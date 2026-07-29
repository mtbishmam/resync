import { ensureNormalizedLibrary } from "../../../db/library";

const MAX_TRANSFER_BYTES = 8_000_000;

const TABLES = {
  items: [
    "id",
    "youtube_id",
    "url",
    "title",
    "author",
    "thumbnail_url",
    "description",
    "published_at",
    "tags_json",
    "caption_available",
    "metadata_complete",
    "duration_minutes",
    "duration_seconds",
    "content_type",
    "topics_json",
    "status",
    "value_score",
    "value_reason",
    "value_factors_json",
    "added_at",
    "cooldown_until",
    "progress",
    "accent",
    "transcript_status",
    "analysis_status",
    "updated_at",
  ],
  notes: ["id", "item_id", "body_markdown", "created_at", "updated_at"],
  note_anchors: [
    "id",
    "note_id",
    "kind",
    "position_seconds",
    "source_quote",
    "source_url",
    "created_at",
    "updated_at",
  ],
  transcripts: [
    "id",
    "item_id",
    "body_text",
    "source",
    "language_codes_json",
    "model",
    "transcript_hash",
    "created_at",
    "updated_at",
  ],
  source_documents: [
    "id",
    "item_id",
    "body_text",
    "kind",
    "source",
    "language_codes_json",
    "model",
    "content_hash",
    "created_at",
    "updated_at",
  ],
  chat_threads: ["id", "item_id", "title", "created_at", "updated_at"],
  chat_messages: [
    "id",
    "thread_id",
    "role",
    "content_markdown",
    "created_at",
  ],
  ai_analyses: [
    "id",
    "item_id",
    "transcript_hash",
    "transcript_source",
    "summary_markdown",
    "novelty_score",
    "recommendation",
    "learnable_points_json",
    "suggested_type",
    "suggested_topics_json",
    "value_score",
    "value_reason",
    "value_factors_json",
    "rationale_markdown",
    "model",
    "prompt_version",
    "created_at",
  ],
  app_meta: ["key", "value", "updated_at"],
} as const;

type TableName = keyof typeof TABLES;

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

export async function GET() {
  try {
    const d1 = await ensureNormalizedLibrary();
    const entries = await Promise.all(
      (Object.keys(TABLES) as TableName[]).map(async (table) => {
        const result = await d1.prepare(`SELECT * FROM ${table}`).all();
        return [table, result.results ?? []] as const;
      }),
    );
    return noStoreJson({
      format: "resync-d1-v1",
      exportedAt: Date.now(),
      tables: Object.fromEntries(entries),
    });
  } catch {
    return noStoreJson(
      { error: "ReSync data export is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_TRANSFER_BYTES) {
      return noStoreJson(
        { error: "The ReSync transfer file is too large." },
        { status: 413 },
      );
    }
    const payload = JSON.parse(raw) as {
      format?: unknown;
      tables?: Record<string, unknown>;
    };
    if (payload.format !== "resync-d1-v1" || !payload.tables) {
      return noStoreJson(
        { error: "This is not a valid ReSync transfer." },
        { status: 400 },
      );
    }

    const d1 = await ensureNormalizedLibrary();
    const statements: D1PreparedStatement[] = [];
    const counts: Partial<Record<TableName, number>> = {};
    for (const table of Object.keys(TABLES) as TableName[]) {
      const rows = payload.tables[table];
      if (!Array.isArray(rows)) continue;
      if (rows.length > 20_000) {
        return noStoreJson(
          { error: `The ${table} table is too large to import.` },
          { status: 413 },
        );
      }
      const columns = TABLES[table];
      const placeholders = columns.map((_, index) => `?${index + 1}`).join(", ");
      const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
      for (const value of rows) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return noStoreJson(
            { error: `The ${table} table contains an invalid row.` },
            { status: 400 },
          );
        }
        const row = value as Record<string, unknown>;
        statements.push(
          d1.prepare(sql).bind(...columns.map((column) => row[column] ?? null)),
        );
      }
      counts[table] = rows.length;
    }
    for (let offset = 0; offset < statements.length; offset += 100) {
      await d1.batch(statements.slice(offset, offset + 100));
    }
    return noStoreJson({ imported: true, counts });
  } catch {
    return noStoreJson(
      { error: "ReSync data import is temporarily unavailable." },
      { status: 503 },
    );
  }
}
