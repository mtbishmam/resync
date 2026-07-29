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

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

function responseText(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const response = value as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
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
        input: [
          {
            role: "system",
            content:
              "You are ReSync's grounded learning assistant. Answer from the captured source, saved analysis, and working notes. If the source does not contain the answer, say so plainly instead of guessing. For video transcripts, cite useful timestamps when they appear. Be concise, practical, and comfortable answering in Bengali or English to match the user.",
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
    const answer = responseText(payload)?.trim();
    if (!answer) throw new Error("OpenAI returned an empty answer.");

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
        createdAt: now,
      }),
    ]);

    return noStoreJson({
      messages: [publicMessage(userMessage), publicMessage(assistantMessage)],
      model: TEXT_MODEL,
      grounded: Boolean(sourceText),
    });
  } catch {
    return noStoreJson(
      { error: "ReSync AI is temporarily unavailable." },
      { status: 503 },
    );
  }
}
