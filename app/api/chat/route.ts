import {
  ensureNormalizedLibrary,
  itemFromRow,
  ItemRow,
} from "../../../db/library";
import { usageFromPayload, usageStatement } from "../../../lib/ai-usage";
import { TEXT_MODEL } from "../../../lib/model-config";
import { loadSourceDocument } from "../../../lib/source-storage";

const MAX_MESSAGE_CHARACTERS = 4_000;
const MAX_SOURCE_CHARACTERS = 600_000;

type ChatRow = {
  id: string;
  role: "user" | "assistant";
  content_markdown: string;
  created_at: number;
};

type UrlCitation = {
  type?: unknown;
  start_index?: unknown;
  end_index?: unknown;
  url?: unknown;
  title?: unknown;
};

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

function markdownSafeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\(/g, "%28").replace(/\)/g, "%29");
  } catch {
    return null;
  }
}

function citationLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function linkCitations(text: string, annotations: UrlCitation[]) {
  const citations = annotations
    .flatMap((annotation) => {
      if (
        annotation.type !== "url_citation" ||
        typeof annotation.end_index !== "number" ||
        typeof annotation.url !== "string"
      ) {
        return [];
      }
      const url = markdownSafeUrl(annotation.url);
      const endIndex = Math.min(text.length, Math.max(0, annotation.end_index));
      if (!url || !endIndex) return [];
      return [{ endIndex, url, label: citationLabel(annotation.url) }];
    })
    .filter(
      (citation, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.endIndex === citation.endIndex &&
            candidate.url === citation.url,
        ) === index,
    )
    .sort((left, right) => right.endIndex - left.endIndex);

  let linked = text;
  for (const citation of citations) {
    linked = `${linked.slice(0, citation.endIndex)} [${citation.label}](${citation.url})${linked.slice(citation.endIndex)}`;
  }
  return linked;
}

function responseAnswer(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const response = value as {
    output_text?: unknown;
    output?: Array<{
      type?: unknown;
      content?: Array<{
        type?: unknown;
        text?: unknown;
        annotations?: UrlCitation[];
      }>;
    }>;
  };
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(linkCitations(content.text, content.annotations ?? []));
      }
    }
  }
  if (parts.length) return parts.join("\n\n");
  if (typeof response.output_text === "string") return response.output_text;
  return null;
}

function usedWebSearch(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const output = (value as { output?: Array<{ type?: unknown }> }).output;
  return output?.some((item) => item.type === "web_search_call") ?? false;
}

function shouldForceWebSearch(message: string) {
  return /\b(?:search|browse|look\s+(?:it\s+)?up|find\s+out\s+online|latest|today|current(?:ly)?|recent|up-to-date|fact[- ]?check|verify\s+(?:online|on\s+the\s+web|with\s+sources))\b/i.test(
    message,
  );
}

function publicMessage(row: ChatRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content_markdown,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const itemId = new URL(request.url).searchParams.get("itemId");
    if (!itemId) {
      return noStoreJson(
        { error: "A valid itemId is required." },
        { status: 400 },
      );
    }
    const d1 = await ensureNormalizedLibrary();
    const messages = await d1
      .prepare(
        `SELECT m.id, m.role, m.content_markdown, m.created_at
         FROM chat_messages m
         JOIN chat_threads t ON t.id = m.thread_id
         WHERE t.item_id = ?1
         ORDER BY m.created_at ASC`,
      )
      .bind(itemId)
      .all<ChatRow>();
    return noStoreJson({
      messages: (messages.results ?? []).map(publicMessage),
    });
  } catch {
    return noStoreJson(
      { error: "Conversation history is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      itemId?: unknown;
      message?: unknown;
    };
    if (typeof body.itemId !== "string" || !body.itemId) {
      return noStoreJson(
        { error: "A valid itemId is required." },
        { status: 400 },
      );
    }
    const message =
      typeof body.message === "string"
        ? body.message.trim().slice(0, MAX_MESSAGE_CHARACTERS)
        : "";
    if (!message) {
      return noStoreJson(
        { error: "Write a message first." },
        { status: 400 },
      );
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return noStoreJson(
        { error: "OpenAI API key is not configured." },
        { status: 503 },
      );
    }

    const d1 = await ensureNormalizedLibrary();
    const row = await d1
      .prepare("SELECT * FROM items WHERE id = ?1")
      .bind(body.itemId)
      .first<ItemRow>();
    if (!row) {
      return noStoreJson({ error: "ReSync item not found." }, { status: 404 });
    }
    const item = itemFromRow(row);
    const [source, note, analysis, history] = await Promise.all([
      loadSourceDocument({ d1, itemId: item.id }),
      d1
        .prepare("SELECT body_markdown FROM notes WHERE item_id = ?1")
        .bind(item.id)
        .first<{ body_markdown: string }>(),
      d1
        .prepare(
          `SELECT summary_markdown, rationale_markdown, recommendation
           FROM ai_analyses WHERE item_id = ?1 ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(item.id)
        .first<{
          summary_markdown: string;
          rationale_markdown: string;
          recommendation: string;
        }>(),
      d1
        .prepare(
          `SELECT m.id, m.role, m.content_markdown, m.created_at
           FROM chat_messages m
           JOIN chat_threads t ON t.id = m.thread_id
           WHERE t.item_id = ?1
           ORDER BY m.created_at DESC LIMIT 20`,
        )
        .bind(item.id)
        .all<ChatRow>(),
    ]);

    const sourceText = source?.bodyText
      .slice(0, MAX_SOURCE_CHARACTERS)
      .trim();
    const priorMessages = [...(history.results ?? [])]
      .reverse()
      .map((entry) => ({
        role: entry.role,
        content: entry.content_markdown.slice(0, 8_000),
      }));
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        store: false,
        reasoning: { effort: "low" },
        tools: [{ type: "web_search", search_context_size: "low" }],
        tool_choice: shouldForceWebSearch(message) ? "required" : "auto",
        input: [
          {
            role: "system",
            content:
              "You are ReSync's grounded learning assistant. Start with the captured source, saved analysis, and working notes. You also have live web search: use it when the user explicitly asks to search, browse, look something up, verify something online, or needs current information. Never claim that you cannot search the web. Clearly distinguish transcript-backed claims from web-backed facts, and do not present one as the other. For video transcripts, cite useful timestamps when they appear. Be concise, practical, and comfortable answering in Bengali or English to match the user. Use ordinary sentence case and clean Markdown. Never write in all caps or use bold or italic emphasis. Prefer short plain paragraphs; use real bullet or numbered lists only when they materially improve readability.",
          },
          {
            role: "user",
            content: `Item title: ${item.title}
Author: ${item.channel}
URL: ${item.url}
Captured source kind: ${source?.kind ?? "not available"}

Saved analysis:
${analysis ? `${analysis.summary_markdown}\n${analysis.rationale_markdown}\nRecommendation: ${analysis.recommendation}` : "Not available yet."}

Working notes:
${note?.body_markdown || "No notes yet."}

Captured source:
${sourceText || "No transcript or article text has been captured. Disclose this limitation if it affects the answer."}`,
          },
          ...priorMessages,
          { role: "user", content: message },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI chat failed (${response.status}).`);
    }
    const payload = (await response.json()) as unknown;
    const answer = responseAnswer(payload)?.trim();
    if (!answer) throw new Error("OpenAI returned an empty answer.");
    const webSearched = usedWebSearch(payload);

    const now = Date.now();
    const threadId = `chat:${item.id}`;
    const userMessage: ChatRow = {
      id: crypto.randomUUID(),
      role: "user",
      content_markdown: message,
      created_at: now,
    };
    const assistantMessage: ChatRow = {
      id: crypto.randomUUID(),
      role: "assistant",
      content_markdown: answer,
      created_at: now + 1,
    };
    await d1.batch([
      d1
        .prepare(
          `INSERT INTO chat_threads (id, item_id, title, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?4)
           ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
        )
        .bind(threadId, item.id, `Conversation about ${item.title}`.slice(0, 200), now),
      d1
        .prepare(
          `INSERT INTO chat_messages
           (id, thread_id, role, content_markdown, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(
          userMessage.id,
          threadId,
          userMessage.role,
          userMessage.content_markdown,
          userMessage.created_at,
        ),
      d1
        .prepare(
          `INSERT INTO chat_messages
           (id, thread_id, role, content_markdown, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(
          assistantMessage.id,
          threadId,
          assistantMessage.role,
          assistantMessage.content_markdown,
          assistantMessage.created_at,
        ),
      usageStatement(d1, {
        itemId: item.id,
        purpose: "chat",
        model: TEXT_MODEL,
        usage: usageFromPayload(payload),
        hasUnpricedTools: webSearched,
        createdAt: now,
      }),
    ]);

    return noStoreJson({
      messages: [publicMessage(userMessage), publicMessage(assistantMessage)],
      model: TEXT_MODEL,
      grounded: Boolean(sourceText),
      webSearched,
    });
  } catch {
    return noStoreJson(
      { error: "ReSync AI is temporarily unavailable." },
      { status: 503 },
    );
  }
}
