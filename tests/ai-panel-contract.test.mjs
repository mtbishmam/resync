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

test("working notes and the taller, lighter AI panel come before metadata", async () => {
  const page = await source("app/page.tsx");
  const styles = await source("app/globals.css");

  assert.ok(
    page.indexOf('<section className="notes-panel">') <
      page.indexOf('<section className="score-panel">'),
  );
  assert.ok(
    page.indexOf('<section className="ask-panel">') <
      page.indexOf('<section className="score-panel">'),
  );
  assert.match(styles, /\.ask-panel\s*\{[\s\S]*?min-height:\s*600px/);
  assert.match(
    styles,
    /\.chat-message p,[\s\S]*?font-weight:\s*400/,
  );
  assert.match(
    styles,
    /\.chat-message\.assistant \.markdown strong,[\s\S]*?font-weight:\s*600/,
  );
});
