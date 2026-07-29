import {
  ensureNormalizedLibrary,
  itemFromRow,
  ItemRow,
  LibraryItem,
  normalizeLibraryItem,
  NORMALIZED_LIBRARY_KEY,
  upsertItemStatement,
  upsertNoteStatement,
} from "../../../db/library";
import { TEXT_MODEL, TRANSCRIPTION_MODEL } from "../../../lib/model-config";
import { sha256 } from "../../../lib/transcript-analysis";

const MAX_REQUEST_BYTES = 1_500_000;

type NoteRow = {
  item_id: string;
  body_markdown: string;
  updated_at: number;
};

type AnalysisRow = {
  item_id: string;
  summary_markdown: string;
  rationale_markdown: string;
  recommendation: string;
  learnable_points_json: string;
  created_at: number;
};

type KnowledgeRow = {
  item_id: string;
  note_hash: string;
  summary_markdown: string;
  topics_json: string;
  model: string;
  updated_at: number;
};

type UsageRow = {
  id: string;
  item_id: string;
  purpose: string;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  audio_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_micros: number | null;
  created_at: number;
};

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

function parseNotes(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, note]) => typeof note !== "string")) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

export async function GET() {
  try {
    const d1 = await ensureNormalizedLibrary();
    const [
      itemResults,
      noteResults,
      analysisResults,
      knowledgeResults,
      usageResults,
      initialized,
    ] =
      await Promise.all([
      d1.prepare("SELECT * FROM items ORDER BY added_at DESC").all<ItemRow>(),
      d1
        .prepare("SELECT item_id, body_markdown, updated_at FROM notes")
        .all<NoteRow>(),
      d1
        .prepare(
          `SELECT item_id, summary_markdown, rationale_markdown, recommendation,
                  learnable_points_json, created_at
           FROM ai_analyses ORDER BY created_at DESC`,
        )
        .all<AnalysisRow>(),
      d1
        .prepare(
          `SELECT item_id, note_hash, summary_markdown, topics_json, model,
                  updated_at
           FROM learned_summaries ORDER BY updated_at DESC`,
        )
        .all<KnowledgeRow>(),
      d1
        .prepare(
          `SELECT id, item_id, purpose, model, input_tokens,
                  cached_input_tokens, audio_input_tokens, output_tokens,
                  total_tokens, estimated_cost_micros, created_at
           FROM ai_usage_events ORDER BY created_at DESC`,
        )
        .all<UsageRow>(),
      d1
        .prepare("SELECT value FROM app_meta WHERE key = ?1")
        .bind(NORMALIZED_LIBRARY_KEY)
        .first<{ value: string }>(),
    ]);
    const analyses: Record<string, Omit<AnalysisRow, "item_id" | "created_at">> =
      {};
    for (const analysis of analysisResults.results ?? []) {
      analyses[analysis.item_id] ??= {
        summary_markdown: analysis.summary_markdown,
        rationale_markdown: analysis.rationale_markdown,
        recommendation: analysis.recommendation,
        learnable_points_json: analysis.learnable_points_json,
      };
    }

    return noStoreJson({
      exists: Boolean(initialized),
      videos: (itemResults.results ?? []).map(itemFromRow),
      notes: Object.fromEntries(
        (noteResults.results ?? []).map((note) => [
          note.item_id,
          note.body_markdown,
        ]),
      ),
      noteUpdatedAt: Object.fromEntries(
        (noteResults.results ?? []).map((note) => [
          note.item_id,
          note.updated_at,
        ]),
      ),
      analyses,
      knowledge: Object.fromEntries(
        (knowledgeResults.results ?? []).map((summary) => [
          summary.item_id,
          {
            summary: summary.summary_markdown,
            noteHash: summary.note_hash,
            topics: JSON.parse(summary.topics_json) as string[],
            model: summary.model,
            updatedAt: summary.updated_at,
          },
        ]),
      ),
      usageEvents: usageResults.results ?? [],
      models: {
        text: TEXT_MODEL,
        transcription: TRANSCRIPTION_MODEL,
      },
      updatedAt: Math.max(
        0,
        ...(itemResults.results ?? []).map((item) => item.updated_at),
      ),
    });
  } catch {
    return noStoreJson(
      { error: "Cloud library is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_BYTES) {
      return noStoreJson(
        { error: "The ReSync library is too large to sync." },
        { status: 413 },
      );
    }

    const body = JSON.parse(rawBody) as {
      videos?: unknown;
      notes?: unknown;
    };
    const notes = parseNotes(body.notes);
    if (!Array.isArray(body.videos) || !notes) {
      return noStoreJson(
        { error: "Invalid ReSync library data." },
        { status: 400 },
      );
    }

    const items = body.videos
      .map(normalizeLibraryItem)
      .filter((item): item is LibraryItem => item !== null);
    if (items.length !== body.videos.length) {
      return noStoreJson(
        { error: "One or more ReSync items are invalid." },
        { status: 400 },
      );
    }
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      return noStoreJson(
        { error: "Duplicate ReSync item IDs are not allowed." },
        { status: 400 },
      );
    }

    const d1 = await ensureNormalizedLibrary();
    const existing = await d1.prepare("SELECT id FROM items").all<{ id: string }>();
    const incomingIds = new Set(items.map((item) => item.id));
    const updatedAt = Date.now();
    const statements = items.map((item) =>
      upsertItemStatement(d1, item, updatedAt),
    );

    for (const item of items) {
      statements.push(
        upsertNoteStatement(d1, item.id, notes[item.id] ?? "", updatedAt),
      );
    }
    for (const item of existing.results ?? []) {
      if (!incomingIds.has(item.id)) {
        statements.push(
          d1.prepare("DELETE FROM items WHERE id = ?1").bind(item.id),
        );
      }
    }
    statements.push(
      d1
        .prepare(
          `INSERT INTO app_meta (key, value, updated_at) VALUES (?1, 'true', ?2)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(NORMALIZED_LIBRARY_KEY, updatedAt),
    );
    await d1.batch(statements);

    const knowledgeRows = await d1
      .prepare(
        `SELECT n.item_id, n.body_markdown, k.note_hash
         FROM notes n
         LEFT JOIN learned_summaries k ON k.item_id = n.item_id
         WHERE length(trim(n.body_markdown)) >= 12`,
      )
      .all<{
        item_id: string;
        body_markdown: string;
        note_hash: string | null;
      }>();
    const knowledgeStaleIds: string[] = [];
    for (const row of knowledgeRows.results ?? []) {
      if ((await sha256(row.body_markdown.trim())) !== row.note_hash) {
        knowledgeStaleIds.push(row.item_id);
      }
    }

    return noStoreJson({ saved: true, updatedAt, knowledgeStaleIds });
  } catch {
    return noStoreJson(
      { error: "Cloud library is temporarily unavailable." },
      { status: 503 },
    );
  }
}
