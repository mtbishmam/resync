import { getD1 } from "./index";

export const LIBRARY_ID = "primary";
export const NORMALIZED_LIBRARY_KEY = "normalized_library_initialized";

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS replay_library (
    id TEXT PRIMARY KEY NOT NULL,
    videos_json TEXT DEFAULT '[]' NOT NULL,
    notes_json TEXT DEFAULT '{}' NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY NOT NULL,
    youtube_id TEXT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    thumbnail_url TEXT,
    description TEXT,
    published_at TEXT,
    tags_json TEXT DEFAULT '[]' NOT NULL,
    caption_available INTEGER,
    metadata_complete INTEGER DEFAULT 0 NOT NULL,
    duration_minutes INTEGER DEFAULT 0 NOT NULL,
    duration_seconds INTEGER DEFAULT 0 NOT NULL,
    content_type TEXT DEFAULT 'Watch' NOT NULL,
    topics_json TEXT DEFAULT '[]' NOT NULL,
    status TEXT DEFAULT 'inbox' NOT NULL,
    value_score INTEGER DEFAULT 0 NOT NULL,
    value_reason TEXT DEFAULT 'AI analysis pending' NOT NULL,
    value_factors_json TEXT,
    added_at INTEGER NOT NULL,
    cooldown_until INTEGER DEFAULT 0 NOT NULL,
    progress INTEGER DEFAULT 0 NOT NULL,
    accent TEXT DEFAULT 'red' NOT NULL,
    transcript_status TEXT DEFAULT 'pending' NOT NULL,
    analysis_status TEXT DEFAULT 'pending' NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS items_youtube_id_unique ON items (youtube_id)",
  "CREATE INDEX IF NOT EXISTS items_type_status_idx ON items (content_type, status)",
  "CREATE INDEX IF NOT EXISTS items_updated_at_idx ON items (updated_at)",
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    body_markdown TEXT DEFAULT '' NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS notes_item_id_unique ON notes (item_id)",
  `CREATE TABLE IF NOT EXISTS note_anchors (
    id TEXT PRIMARY KEY NOT NULL,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    position_seconds INTEGER,
    source_quote TEXT,
    source_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS note_anchors_note_id_idx ON note_anchors (note_id)",
  `CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    body_text TEXT NOT NULL,
    source TEXT NOT NULL,
    language_codes_json TEXT DEFAULT '[]' NOT NULL,
    model TEXT,
    transcript_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS transcripts_item_id_unique ON transcripts (item_id)",
  "CREATE INDEX IF NOT EXISTS transcripts_hash_idx ON transcripts (transcript_hash)",
  `CREATE TABLE IF NOT EXISTS source_documents (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    body_text TEXT NOT NULL,
    kind TEXT NOT NULL,
    source TEXT NOT NULL,
    language_codes_json TEXT DEFAULT '[]' NOT NULL,
    model TEXT,
    content_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS source_documents_item_id_unique ON source_documents (item_id)",
  "CREATE INDEX IF NOT EXISTS source_documents_hash_idx ON source_documents (content_hash)",
  `INSERT OR IGNORE INTO source_documents (
    id, item_id, body_text, kind, source, language_codes_json, model,
    content_hash, created_at, updated_at
  )
  SELECT
    'source:' || item_id, item_id, body_text, 'video_transcript', source,
    language_codes_json, model, transcript_hash, created_at, updated_at
  FROM transcripts`,
  `CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New conversation' NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS chat_threads_item_id_idx ON chat_threads (item_id)",
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS chat_messages_thread_id_idx ON chat_messages (thread_id)",
  `CREATE TABLE IF NOT EXISTS ai_analyses (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    transcript_hash TEXT NOT NULL,
    transcript_source TEXT NOT NULL,
    summary_markdown TEXT NOT NULL,
    novelty_score INTEGER NOT NULL,
    recommendation TEXT NOT NULL,
    learnable_points_json TEXT DEFAULT '[]' NOT NULL,
    suggested_type TEXT NOT NULL,
    suggested_topics_json TEXT DEFAULT '[]' NOT NULL,
    value_score INTEGER DEFAULT 0 NOT NULL,
    value_reason TEXT DEFAULT '' NOT NULL,
    value_factors_json TEXT DEFAULT '[]' NOT NULL,
    rationale_markdown TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ai_analyses_version_unique
    ON ai_analyses (item_id, transcript_hash, model, prompt_version)`,
  "CREATE INDEX IF NOT EXISTS ai_analyses_item_id_idx ON ai_analyses (item_id)",
  `CREATE TABLE IF NOT EXISTS learned_summaries (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    note_hash TEXT NOT NULL,
    summary_markdown TEXT NOT NULL,
    topics_json TEXT DEFAULT '[]' NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS learned_summaries_item_id_unique ON learned_summaries (item_id)",
  "CREATE INDEX IF NOT EXISTS learned_summaries_updated_at_idx ON learned_summaries (updated_at)",
  `CREATE TABLE IF NOT EXISTS ai_usage_events (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0 NOT NULL,
    cached_input_tokens INTEGER DEFAULT 0 NOT NULL,
    audio_input_tokens INTEGER DEFAULT 0 NOT NULL,
    output_tokens INTEGER DEFAULT 0 NOT NULL,
    total_tokens INTEGER DEFAULT 0 NOT NULL,
    estimated_cost_micros INTEGER,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS ai_usage_events_item_id_idx ON ai_usage_events (item_id)",
  "CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx ON ai_usage_events (created_at)",
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];

export type LibraryItem = {
  id: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  description?: string;
  publishedAt?: string | null;
  tags?: string[];
  captionAvailable?: boolean | null;
  metadataComplete?: boolean;
  url: string;
  title: string;
  channel: string;
  durationMinutes: number;
  durationSeconds?: number;
  type: "Watch" | "Read";
  topics: Array<"AI" | "CP" | "Tech" | "Business">;
  status: "feed" | "inbox" | "queued" | "watched";
  valueScore: number;
  valueReason: string;
  valueFactors?: Array<{ label: string; points: number; max: number }>;
  addedAt: number;
  cooldownUntil: number;
  progress: number;
  accent: string;
  transcriptStatus?: "pending" | "available" | "unavailable" | "error";
  analysisStatus?: "pending" | "complete" | "unavailable" | "error";
};

export type ItemRow = {
  id: string;
  youtube_id: string | null;
  url: string;
  title: string;
  author: string;
  thumbnail_url: string | null;
  description: string | null;
  published_at: string | null;
  tags_json: string;
  caption_available: number | null;
  metadata_complete: number;
  duration_minutes: number;
  duration_seconds: number;
  content_type: string;
  topics_json: string;
  status: string;
  value_score: number;
  value_reason: string;
  value_factors_json: string | null;
  added_at: number;
  cooldown_until: number;
  progress: number;
  accent: string;
  transcript_status: string;
  analysis_status: string;
  updated_at: number;
};

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

export function normalizeLibraryItem(value: unknown): LibraryItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = stringValue(item.id);
  const url = stringValue(item.url);
  if (!id || !url) return null;

  const allowedTopics = new Set(["AI", "CP", "Tech", "Business"]);
  const topics = Array.isArray(item.topics)
    ? item.topics.filter(
        (topic): topic is LibraryItem["topics"][number] =>
          typeof topic === "string" && allowedTopics.has(topic),
      )
    : [];
  const type = item.type === "Read" ? "Read" : "Watch";
  const allowedStatuses = new Set(["feed", "inbox", "queued", "watched"]);
  const status = allowedStatuses.has(stringValue(item.status))
    ? (item.status as LibraryItem["status"])
    : "inbox";
  const transcriptStatus = ["pending", "available", "unavailable", "error"].includes(
    stringValue(item.transcriptStatus),
  )
    ? (item.transcriptStatus as LibraryItem["transcriptStatus"])
    : "pending";
  const analysisStatus = ["pending", "complete", "unavailable", "error"].includes(
    stringValue(item.analysisStatus),
  )
    ? (item.analysisStatus as LibraryItem["analysisStatus"])
    : "pending";

  return {
    id,
    youtubeId: stringValue(item.youtubeId) || undefined,
    thumbnailUrl: stringValue(item.thumbnailUrl) || undefined,
    description: stringValue(item.description) || undefined,
    publishedAt:
      typeof item.publishedAt === "string" ? item.publishedAt : null,
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    captionAvailable: nullableBoolean(item.captionAvailable),
    metadataComplete: item.metadataComplete === true,
    url,
    title: stringValue(item.title, type === "Watch" ? "Saved video" : "Saved article"),
    channel: stringValue(item.channel, "Unknown source"),
    durationMinutes: Math.max(0, numberValue(item.durationMinutes)),
    durationSeconds: Math.max(0, numberValue(item.durationSeconds)),
    type,
    topics: Array.from(new Set(topics)),
    status,
    valueScore: Math.max(0, Math.min(100, numberValue(item.valueScore))),
    valueReason: stringValue(item.valueReason, "AI analysis pending"),
    valueFactors: Array.isArray(item.valueFactors)
      ? (item.valueFactors as LibraryItem["valueFactors"])
      : undefined,
    addedAt: Math.max(1, numberValue(item.addedAt, Date.now())),
    cooldownUntil: Math.max(0, numberValue(item.cooldownUntil)),
    progress: Math.max(0, Math.min(100, numberValue(item.progress))),
    accent: stringValue(item.accent, "red"),
    transcriptStatus,
    analysisStatus,
  };
}

export function itemFromRow(row: ItemRow): LibraryItem {
  return {
    id: row.id,
    youtubeId: row.youtube_id ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    description: row.description ?? undefined,
    publishedAt: row.published_at,
    tags: safeJson<string[]>(row.tags_json, []),
    captionAvailable:
      row.caption_available === null ? null : row.caption_available === 1,
    metadataComplete: row.metadata_complete === 1,
    url: row.url,
    title: row.title,
    channel: row.author,
    durationMinutes: row.duration_minutes,
    durationSeconds: row.duration_seconds,
    type: row.content_type === "Read" ? "Read" : "Watch",
    topics: safeJson<LibraryItem["topics"]>(row.topics_json, []),
    status: row.status as LibraryItem["status"],
    valueScore: row.value_score,
    valueReason: row.value_reason,
    valueFactors: safeJson<LibraryItem["valueFactors"]>(
      row.value_factors_json,
      undefined,
    ),
    addedAt: row.added_at,
    cooldownUntil: row.cooldown_until,
    progress: row.progress,
    accent: row.accent,
    transcriptStatus: row.transcript_status as LibraryItem["transcriptStatus"],
    analysisStatus: row.analysis_status as LibraryItem["analysisStatus"],
  };
}

export function upsertItemStatement(
  d1: D1Database,
  item: LibraryItem,
  updatedAt: number,
) {
  return d1
    .prepare(
      `INSERT INTO items (
        id, youtube_id, url, title, author, thumbnail_url, description,
        published_at, tags_json, caption_available, metadata_complete,
        duration_minutes, duration_seconds, content_type, topics_json, status,
        value_score, value_reason, value_factors_json, added_at, cooldown_until,
        progress, accent, transcript_status, analysis_status, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
        ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26
      )
      ON CONFLICT(id) DO UPDATE SET
        youtube_id = excluded.youtube_id,
        url = excluded.url,
        title = excluded.title,
        author = excluded.author,
        thumbnail_url = excluded.thumbnail_url,
        description = excluded.description,
        published_at = excluded.published_at,
        tags_json = excluded.tags_json,
        caption_available = excluded.caption_available,
        metadata_complete = excluded.metadata_complete,
        duration_minutes = excluded.duration_minutes,
        duration_seconds = excluded.duration_seconds,
        content_type = excluded.content_type,
        topics_json = excluded.topics_json,
        status = excluded.status,
        value_score = excluded.value_score,
        value_reason = excluded.value_reason,
        value_factors_json = excluded.value_factors_json,
        added_at = excluded.added_at,
        cooldown_until = excluded.cooldown_until,
        progress = excluded.progress,
        accent = excluded.accent,
        transcript_status = excluded.transcript_status,
        analysis_status = excluded.analysis_status,
        updated_at = excluded.updated_at`,
    )
    .bind(
      item.id,
      item.youtubeId ?? null,
      item.url,
      item.title,
      item.channel,
      item.thumbnailUrl ?? null,
      item.description ?? null,
      item.publishedAt ?? null,
      JSON.stringify(item.tags ?? []),
      item.captionAvailable === null || item.captionAvailable === undefined
        ? null
        : item.captionAvailable
          ? 1
          : 0,
      item.metadataComplete ? 1 : 0,
      item.durationMinutes,
      item.durationSeconds ?? 0,
      item.type,
      JSON.stringify(item.topics),
      item.status,
      item.valueScore,
      item.valueReason,
      item.valueFactors ? JSON.stringify(item.valueFactors) : null,
      item.addedAt,
      item.cooldownUntil,
      item.progress,
      item.accent,
      item.transcriptStatus ?? "pending",
      item.analysisStatus ?? "pending",
      updatedAt,
    );
}

export function upsertNoteStatement(
  d1: D1Database,
  itemId: string,
  markdown: string,
  updatedAt: number,
) {
  return d1
    .prepare(
      `INSERT INTO notes (id, item_id, body_markdown, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4)
      ON CONFLICT(item_id) DO UPDATE SET
         body_markdown = excluded.body_markdown,
         updated_at = CASE
           WHEN notes.body_markdown <> excluded.body_markdown
             THEN excluded.updated_at
           ELSE notes.updated_at
         END`,
    )
    .bind(`note:${itemId}`, itemId, markdown, updatedAt);
}

async function migrateLegacySnapshot(d1: D1Database) {
  const initialized = await d1
    .prepare("SELECT value FROM app_meta WHERE key = ?1")
    .bind(NORMALIZED_LIBRARY_KEY)
    .first<{ value: string }>();
  if (initialized) return;

  const legacy = await d1
    .prepare(
      "SELECT videos_json, notes_json FROM replay_library WHERE id = ?1",
    )
    .bind(LIBRARY_ID)
    .first<{ videos_json: string; notes_json: string }>();
  const now = Date.now();
  const videos = legacy
    ? safeJson<unknown[]>(legacy.videos_json, [])
        .map(normalizeLibraryItem)
        .filter((item): item is LibraryItem => item !== null)
    : [];
  const legacyNotes = legacy
    ? safeJson<Record<string, unknown>>(legacy.notes_json, {})
    : {};
  const statements = videos.map((item) => upsertItemStatement(d1, item, now));

  for (const item of videos) {
    const markdown = legacyNotes[item.id];
    if (typeof markdown === "string") {
      statements.push(upsertNoteStatement(d1, item.id, markdown, now));
    }
  }
  statements.push(
    d1
      .prepare(
        `INSERT INTO app_meta (key, value, updated_at) VALUES (?1, 'true', ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(NORMALIZED_LIBRARY_KEY, now),
  );
  await d1.batch(statements);
}

export async function ensureNormalizedLibrary() {
  const d1 = await getD1();
  await d1.batch(CREATE_STATEMENTS.map((statement) => d1.prepare(statement)));
  await migrateLegacySnapshot(d1);
  return d1;
}
