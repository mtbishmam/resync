import {
  ensureNormalizedLibrary,
  itemFromRow,
  ItemRow,
} from "../../../db/library";
import { usageFromPayload, usageStatement } from "../../../lib/ai-usage";
import { TEXT_MODEL } from "../../../lib/model-config";
import { sha256 } from "../../../lib/transcript-analysis";

const MAX_NOTE_CHARACTERS = 40_000;

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { itemId?: unknown };
    if (typeof body.itemId !== "string" || !body.itemId) {
      return noStoreJson(
        { error: "A valid itemId is required." },
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
    const [row, note, existing] = await Promise.all([
      d1
        .prepare("SELECT * FROM items WHERE id = ?1")
        .bind(body.itemId)
        .first<ItemRow>(),
      d1
        .prepare("SELECT body_markdown FROM notes WHERE item_id = ?1")
        .bind(body.itemId)
        .first<{ body_markdown: string }>(),
      d1
        .prepare(
          `SELECT note_hash, summary_markdown, model, updated_at
           FROM learned_summaries WHERE item_id = ?1`,
        )
        .bind(body.itemId)
        .first<{
          note_hash: string;
          summary_markdown: string;
          model: string;
          updated_at: number;
        }>(),
    ]);
    if (!row) {
      return noStoreJson({ error: "ReSync item not found." }, { status: 404 });
    }
    const noteText = note?.body_markdown.trim().slice(0, MAX_NOTE_CHARACTERS) ?? "";
    if (noteText.length < 12) {
      await d1
        .prepare("DELETE FROM learned_summaries WHERE item_id = ?1")
        .bind(body.itemId)
        .run();
      return noStoreJson({ status: "empty", itemId: body.itemId });
    }
    const noteHash = await sha256(noteText);
    if (existing?.note_hash === noteHash) {
      return noStoreJson({
        status: "current",
        itemId: body.itemId,
        summary: existing.summary_markdown,
        noteHash,
        model: existing.model,
        updatedAt: existing.updated_at,
      });
    }

    const item = itemFromRow(row);
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
              "Convert the user's working notes into a compact durable memory of what the user appears to have learned. Preserve uncertainty, decisions, and actionable rules. Do not copy filler, invent facts, or summarize the source beyond what the notes actually say. Write concise Markdown bullets that can be compared against future content for novelty and repeated value.",
          },
          {
            role: "user",
            content: `Item: ${item.title}
Source: ${item.channel}
Topics: ${item.topics.join(", ") || "Unsorted"}

User's working notes:
${noteText}`,
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI knowledge summary failed (${response.status}).`);
    }
    const payload = (await response.json()) as unknown;
    const summary = responseText(payload)?.trim();
    if (!summary) throw new Error("OpenAI returned an empty knowledge summary.");

    const now = Date.now();
    await d1.batch([
      d1
        .prepare(
          `INSERT INTO learned_summaries (
            id, item_id, note_hash, summary_markdown, topics_json, model,
            created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
          ON CONFLICT(item_id) DO UPDATE SET
            note_hash = excluded.note_hash,
            summary_markdown = excluded.summary_markdown,
            topics_json = excluded.topics_json,
            model = excluded.model,
            updated_at = excluded.updated_at`,
        )
        .bind(
          `learned:${item.id}`,
          item.id,
          noteHash,
          summary,
          JSON.stringify(item.topics),
          TEXT_MODEL,
          now,
        ),
      usageStatement(d1, {
        itemId: item.id,
        purpose: "knowledge",
        model: TEXT_MODEL,
        usage: usageFromPayload(payload),
        createdAt: now,
      }),
    ]);

    return noStoreJson({
      status: "complete",
      itemId: item.id,
      summary,
      noteHash,
      model: TEXT_MODEL,
      updatedAt: now,
    });
  } catch (error) {
    console.error("ReSync knowledge summary failed", error);
    return noStoreJson(
      { error: "AI learning summary is temporarily unavailable." },
      { status: 503 },
    );
  }
}
