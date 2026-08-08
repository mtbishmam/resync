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
    "favorite",
    "liked",
    "value_score",
    "value_reason",
    "value_factors_json",
    "added_at",
    "cooldown_until",
    "finished_at",
    "archived_at",
    "progress",
    "accent",
    "transcript_status",
    "analysis_status",
    "updated_at",
  ],
  consumption_history: ["id", "item_id", "completed_at"],
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
    "storage_backend",
    "object_key",
    "byte_size",
    "storage_status",
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
const TRANSFER_FORMAT = "resync-hybrid-v2";
const LEGACY_TRANSFER_FORMAT = "resync-d1-v1";

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
    const tables = Object.fromEntries(entries) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const sourceManifest = (tables.source_documents ?? []).map((row) => ({
      itemId: row.item_id,
      contentHash: row.content_hash,
      storageBackend: row.storage_backend,
      objectKey: row.object_key,
      byteSize: row.byte_size,
      storageStatus: row.storage_status,
    }));
    return noStoreJson({
      format: TRANSFER_FORMAT,
      exportedAt: Date.now(),
      tables,
      sourceManifest,
      sourceContentIncluded: false,
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
    if (
      ![TRANSFER_FORMAT, LEGACY_TRANSFER_FORMAT].includes(
        String(payload.format),
      ) ||
      !payload.tables
    ) {
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
          d1
            .prepare(sql)
            .bind(
              ...columns.map((column) =>
                transferValue(table, column, row),
              ),
            ),
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

function transferValue(
  table: TableName,
  column: string,
  row: Record<string, unknown>,
) {
  if (row[column] !== undefined && row[column] !== null) return row[column];
  if (
    table === "items" &&
    (column === "favorite" || column === "liked" || column === "cooldown_until")
  ) {
    return 0;
  }
  if (table !== "source_documents") return null;
  if (column === "storage_backend") return "d1";
  if (column === "storage_status") return "ready";
  if (column === "byte_size") {
    return typeof row.body_text === "string"
      ? new TextEncoder().encode(row.body_text).byteLength
      : 0;
  }
  return null;
}
