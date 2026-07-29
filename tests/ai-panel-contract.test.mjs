import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the next AI question remains editable while an answer is processing", async () => {
  const page = await source("app/page.tsx");
  const inputBlock = page.match(
    /<input\s+aria-label="Ask ReSync AI"[\s\S]*?\/>/,
  )?.[0];

  assert.ok(inputBlock, "ReSync AI input should exist");
  assert.doesNotMatch(inputBlock, /disabled=\{chatBusy\}/);
  assert.match(page, /if \(!message \|\| chatBusy\) return/);
  assert.match(page, /disabled=\{chatBusy \|\| !chatInput\.trim\(\)\}/);
  assert.match(
    page,
    /setChatInput\(\(current\) => \(current\.trim\(\) \? current : message\)\)/,
  );
});

test("score and tags stay above notes and the fixed-height AI panel", async () => {
  const page = await source("app/page.tsx");
  const styles = await source("app/globals.css");
  const scoreIndex = page.indexOf('<section className="score-panel">');
  const propertiesIndex = page.indexOf('<section className="properties-panel"');
  const notesIndex = page.indexOf('<section className="notes-panel">');
  const askIndex = page.indexOf('<section className="ask-panel">');

  assert.ok(scoreIndex < propertiesIndex);
  assert.ok(propertiesIndex < notesIndex);
  assert.ok(notesIndex < askIndex);
  assert.match(
    styles,
    /\.ask-panel\s*\{[\s\S]*?height:\s*600px[\s\S]*?max-height:\s*600px[\s\S]*?overflow:\s*hidden/,
  );
  assert.match(
    styles,
    /\.chat-space\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/,
  );
  assert.match(
    styles,
    /\.chat-message\.assistant p,[\s\S]*?font-size:\s*14px[\s\S]*?font-weight:\s*400/,
  );
});

test("mixed Markdown renders as headings and real lists in AI responses", async () => {
  const page = await source("app/page.tsx");
  const chatRoute = await source("app/api/chat/route.ts");

  assert.match(page, /const heading = line\.match\(\/\^#\{1,4\}\\s\+\(\.\+\)\$\/\)/);
  assert.match(page, /while \(index < lines\.length && \/\^\[-\*\]\\s\+\/\.test/);
  assert.match(page, /while \(index < lines\.length && \/\^\\d\+\\\.\\s\+\/\.test/);
  assert.match(chatRoute, /Use ordinary sentence case and clean Markdown/);
  assert.match(chatRoute, /Never write in all caps/);
});

test("assistant text is normalized to the same regular style as the AI summary", async () => {
  const page = await source("app/page.tsx");
  const styles = await source("app/globals.css");
  const chatRoute = await source("app/api/chat/route.ts");

  assert.match(page, /function normalizeAssistantMarkdown/);
  assert.match(page, /\.replace\(\/\\\*\\\*\(\[\^\*\\n\]\+\)\\\*\\\*\/g, "\$1"\)/);
  assert.match(page, /uppercaseLetters \/ letters\.length >= 0\.55/);
  assert.match(
    page,
    /message\.role === "assistant"[\s\S]*?normalizeAssistantMarkdown\(message\.content\)/,
  );
  assert.match(
    styles,
    /\.chat-message\.assistant \.markdown \*[\s\S]*?font-size:\s*14px !important[\s\S]*?font-weight:\s*400 !important/,
  );
  assert.match(styles, /\.chat-message > span\s*\{[\s\S]*?font-size:\s*10px/);
  assert.doesNotMatch(styles, /\.chat-message span\s*\{/);
  assert.match(styles, /\.chat-message\.assistant > span[\s\S]*?text-transform:\s*none/);
  assert.match(chatRoute, /Never write in all caps or use bold or italic emphasis/);
});

test("ReSync AI can search the live web and keeps citations clickable", async () => {
  const chatRoute = await source("app/api/chat/route.ts");
  const usage = await source("lib/ai-usage.ts");

  assert.match(
    chatRoute,
    /tools:\s*\[\{ type: "web_search", search_context_size: "low" \}\]/,
  );
  assert.match(
    chatRoute,
    /tool_choice: shouldForceWebSearch\(message\) \? "required" : "auto"/,
  );
  assert.match(chatRoute, /annotation\.type !== "url_citation"/);
  assert.match(chatRoute, /\[\$\{citation\.label\}\]\(\$\{citation\.url\}\)/);
  assert.match(chatRoute, /item\.type === "web_search_call"/);
  assert.match(chatRoute, /hasUnpricedTools: webSearched/);
  assert.match(usage, /hasUnpricedTools \? null : estimateCostMicros/);
});
