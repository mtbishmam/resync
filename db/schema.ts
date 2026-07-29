import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Kept as a read-only migration source. New writes use the normalized tables below.
export const replayLibrary = sqliteTable("replay_library", {
  id: text("id").primaryKey(),
  videosJson: text("videos_json").notNull().default("[]"),
  notesJson: text("notes_json").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    youtubeId: text("youtube_id"),
    url: text("url").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    description: text("description"),
    publishedAt: text("published_at"),
    tagsJson: text("tags_json").notNull().default("[]"),
    captionAvailable: integer("caption_available", { mode: "boolean" }),
    metadataComplete: integer("metadata_complete", { mode: "boolean" })
      .notNull()
      .default(false),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    contentType: text("content_type").notNull().default("Watch"),
    topicsJson: text("topics_json").notNull().default("[]"),
    status: text("status").notNull().default("inbox"),
    valueScore: integer("value_score").notNull().default(0),
    valueReason: text("value_reason").notNull().default("AI analysis pending"),
    valueFactorsJson: text("value_factors_json"),
    addedAt: integer("added_at").notNull(),
    cooldownUntil: integer("cooldown_until").notNull().default(0),
    progress: integer("progress").notNull().default(0),
    accent: text("accent").notNull().default("red"),
    transcriptStatus: text("transcript_status").notNull().default("pending"),
    analysisStatus: text("analysis_status").notNull().default("pending"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("items_youtube_id_unique").on(table.youtubeId),
    index("items_type_status_idx").on(table.contentType, table.status),
    index("items_updated_at_idx").on(table.updatedAt),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("notes_item_id_unique").on(table.itemId)],
);

export const noteAnchors = sqliteTable(
  "note_anchors",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    positionSeconds: integer("position_seconds"),
    sourceQuote: text("source_quote"),
    sourceUrl: text("source_url"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("note_anchors_note_id_idx").on(table.noteId)],
);

export const transcripts = sqliteTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    bodyText: text("body_text").notNull(),
    source: text("source").notNull(),
    languageCodesJson: text("language_codes_json").notNull().default("[]"),
    model: text("model"),
    transcriptHash: text("transcript_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("transcripts_item_id_unique").on(table.itemId),
    index("transcripts_hash_idx").on(table.transcriptHash),
  ],
);

export const sourceDocuments = sqliteTable(
  "source_documents",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    bodyText: text("body_text").notNull(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    languageCodesJson: text("language_codes_json").notNull().default("[]"),
    model: text("model"),
    contentHash: text("content_hash").notNull(),
    storageBackend: text("storage_backend").notNull().default("d1"),
    objectKey: text("object_key"),
    byteSize: integer("byte_size").notNull().default(0),
    storageStatus: text("storage_status").notNull().default("ready"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("source_documents_item_id_unique").on(table.itemId),
    index("source_documents_hash_idx").on(table.contentHash),
    index("source_documents_object_key_idx").on(table.objectKey),
  ],
);

export const chatThreads = sqliteTable(
  "chat_threads",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("chat_threads_item_id_idx").on(table.itemId)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("chat_messages_thread_id_idx").on(table.threadId)],
);

export const aiAnalyses = sqliteTable(
  "ai_analyses",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    transcriptHash: text("transcript_hash").notNull(),
    transcriptSource: text("transcript_source").notNull(),
    summaryMarkdown: text("summary_markdown").notNull(),
    noveltyScore: integer("novelty_score").notNull(),
    recommendation: text("recommendation").notNull(),
    learnablePointsJson: text("learnable_points_json").notNull().default("[]"),
    suggestedType: text("suggested_type").notNull(),
    suggestedTopicsJson: text("suggested_topics_json").notNull().default("[]"),
    valueScore: integer("value_score").notNull().default(0),
    valueReason: text("value_reason").notNull().default(""),
    valueFactorsJson: text("value_factors_json").notNull().default("[]"),
    rationaleMarkdown: text("rationale_markdown").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ai_analyses_version_unique").on(
      table.itemId,
      table.transcriptHash,
      table.model,
      table.promptVersion,
    ),
    index("ai_analyses_item_id_idx").on(table.itemId),
  ],
);

export const learnedSummaries = sqliteTable(
  "learned_summaries",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    noteHash: text("note_hash").notNull(),
    summaryMarkdown: text("summary_markdown").notNull(),
    topicsJson: text("topics_json").notNull().default("[]"),
    model: text("model").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("learned_summaries_item_id_unique").on(table.itemId),
    index("learned_summaries_updated_at_idx").on(table.updatedAt),
  ],
);

export const aiUsageEvents = sqliteTable(
  "ai_usage_events",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    audioInputTokens: integer("audio_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    estimatedCostMicros: integer("estimated_cost_micros"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("ai_usage_events_item_id_idx").on(table.itemId),
    index("ai_usage_events_created_at_idx").on(table.createdAt),
  ],
);

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
