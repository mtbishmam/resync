import { getR2 } from "../db/index";

export const MAX_SOURCE_CHARACTERS = 900_000;

export type SourceDocumentKind = "video_transcript" | "article";

export type TranscriptSource =
  | "extension"
  | "extension-page"
  | "manual-paste"
  | "manual-article"
  | "gpt-transcribe"
  | "youtube-captions-api";

type SourceDocumentRow = {
  item_id: string;
  body_text: string;
  kind: SourceDocumentKind;
  source: TranscriptSource;
  language_codes_json: string;
  model: string | null;
  content_hash: string;
  storage_backend: string;
  object_key: string | null;
  byte_size: number;
  storage_status: string;
};

export type SourceDocument = {
  itemId: string;
  bodyText: string;
  kind: SourceDocumentKind;
  source: TranscriptSource;
  languageCodes: string[];
  model: string | null;
  contentHash: string;
  byteSize: number;
  storageBackend: "d1" | "r2";
  objectKey: string | null;
};

function cleanSourceText(value: string) {
  return value.trim().slice(0, MAX_SOURCE_CHARACTERS);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function parseLanguageCodes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((code): code is string => typeof code === "string")
      : [];
  } catch {
    return [];
  }
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function sourceObjectKey(contentHash: string) {
  return `sources/${contentHash.slice(0, 2)}/${contentHash}.txt`;
}

async function putSourceObject({
  bodyText,
  contentHash,
  kind,
}: {
  bodyText: string;
  contentHash: string;
  kind: SourceDocumentKind;
}) {
  const r2 = await getR2();
  const objectKey = sourceObjectKey(contentHash);
  await r2.put(objectKey, bodyText, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
    customMetadata: {
      sha256: contentHash,
      kind,
    },
  });
  return objectKey;
}

export async function storeSourceDocument({
  d1,
  itemId,
  bodyText,
  kind,
  source,
  languageCodes = [],
  model = null,
  markAnalysisPending = true,
}: {
  d1: D1Database;
  itemId: string;
  bodyText: string;
  kind: SourceDocumentKind;
  source: TranscriptSource;
  languageCodes?: string[];
  model?: string | null;
  markAnalysisPending?: boolean;
}) {
  const cleanBody = cleanSourceText(bodyText);
  if (cleanBody.length < 40) {
    throw new Error("The captured content is too short to analyze.");
  }

  const contentHash = await sha256(cleanBody);
  const objectKey = await putSourceObject({
    bodyText: cleanBody,
    contentHash,
    kind,
  });
  const sourceBytes = byteLength(cleanBody);
  const now = Date.now();

  const itemUpdate = markAnalysisPending
    ? d1
        .prepare(
          `UPDATE items
           SET transcript_status = 'available',
               analysis_status = 'pending',
               updated_at = ?2
           WHERE id = ?1`,
        )
        .bind(itemId, now)
    : d1
        .prepare(
          `UPDATE items
           SET transcript_status = 'available',
               updated_at = ?2
           WHERE id = ?1`,
        )
        .bind(itemId, now);

  await d1.batch([
    d1
      .prepare(
        `INSERT INTO source_documents (
          id, item_id, body_text, kind, source, language_codes_json, model,
          content_hash, storage_backend, object_key, byte_size, storage_status,
          created_at, updated_at
        ) VALUES (
          ?1, ?2, '', ?3, ?4, ?5, ?6, ?7, 'r2', ?8, ?9, 'ready', ?10, ?10
        )
        ON CONFLICT(item_id) DO UPDATE SET
          body_text = '',
          kind = excluded.kind,
          source = excluded.source,
          language_codes_json = excluded.language_codes_json,
          model = excluded.model,
          content_hash = excluded.content_hash,
          storage_backend = excluded.storage_backend,
          object_key = excluded.object_key,
          byte_size = excluded.byte_size,
          storage_status = excluded.storage_status,
          updated_at = excluded.updated_at`,
      )
      .bind(
        `source:${itemId}`,
        itemId,
        kind,
        source,
        JSON.stringify(languageCodes),
        model,
        contentHash,
        objectKey,
        sourceBytes,
        now,
      ),
    itemUpdate,
    d1
      .prepare(
        `UPDATE transcripts
         SET body_text = '',
             updated_at = ?2
         WHERE item_id = ?1
           AND length(body_text) > 0`,
      )
      .bind(itemId, now),
  ]);

  return {
    bodyText: cleanBody,
    contentHash,
    byteSize: sourceBytes,
    objectKey,
  };
}

async function readSourceObject(row: SourceDocumentRow) {
  if (!row.object_key) return null;
  const r2 = await getR2();
  const object = await r2.get(row.object_key);
  if (!object) return null;
  if (
    object.customMetadata?.sha256 &&
    object.customMetadata.sha256 !== row.content_hash
  ) {
    throw new Error("The stored source document failed its integrity check.");
  }
  return cleanSourceText(await object.text());
}

function publicSource(
  row: SourceDocumentRow,
  bodyText: string,
  storageBackend: "d1" | "r2",
): SourceDocument {
  return {
    itemId: row.item_id,
    bodyText,
    kind: row.kind,
    source: row.source,
    languageCodes: parseLanguageCodes(row.language_codes_json),
    model: row.model,
    contentHash: row.content_hash,
    byteSize: row.byte_size || byteLength(bodyText),
    storageBackend,
    objectKey: row.object_key,
  };
}

export async function loadSourceDocument({
  d1,
  itemId,
  migrateLegacy = true,
}: {
  d1: D1Database;
  itemId: string;
  migrateLegacy?: boolean;
}) {
  const row = await d1
    .prepare(
      `SELECT item_id, body_text, kind, source, language_codes_json, model,
              content_hash, storage_backend, object_key, byte_size,
              storage_status
       FROM source_documents
       WHERE item_id = ?1`,
    )
    .bind(itemId)
    .first<SourceDocumentRow>();
  if (!row) return null;

  if (
    row.storage_backend === "r2" &&
    row.storage_status === "ready" &&
    row.object_key
  ) {
    try {
      const bodyText = await readSourceObject(row);
      if (bodyText) return publicSource(row, bodyText, "r2");
    } catch (error) {
      if (!row.body_text.trim()) throw error;
      console.error("ReSync R2 source read failed; using D1 fallback", error);
    }
  }

  const legacyBody = cleanSourceText(row.body_text);
  if (!legacyBody) {
    throw new Error("The source document is referenced but unavailable.");
  }

  if (migrateLegacy) {
    try {
      const migrated = await storeSourceDocument({
        d1,
        itemId,
        bodyText: legacyBody,
        kind: row.kind,
        source: row.source,
        languageCodes: parseLanguageCodes(row.language_codes_json),
        model: row.model,
        markAnalysisPending: false,
      });
      return {
        ...publicSource(row, legacyBody, "r2"),
        contentHash: migrated.contentHash,
        byteSize: migrated.byteSize,
        objectKey: migrated.objectKey,
      };
    } catch (error) {
      console.error("ReSync source migration deferred", error);
    }
  }

  return publicSource(row, legacyBody, "d1");
}

export async function migrateLegacySourceDocuments({
  d1,
  limit = 10,
}: {
  d1: D1Database;
  limit?: number;
}) {
  const safeLimit = Math.max(1, Math.min(25, Math.floor(limit)));
  const rows = await d1
    .prepare(
      `SELECT item_id, body_text, kind, source, language_codes_json, model,
              content_hash, storage_backend, object_key, byte_size,
              storage_status
       FROM source_documents
       WHERE length(trim(body_text)) >= 40
         AND (storage_backend <> 'r2' OR object_key IS NULL)
       ORDER BY updated_at ASC
       LIMIT ?1`,
    )
    .bind(safeLimit)
    .all<SourceDocumentRow>();

  let migrated = 0;
  const failures: Array<{ itemId: string; message: string }> = [];
  for (const row of rows.results ?? []) {
    try {
      await storeSourceDocument({
        d1,
        itemId: row.item_id,
        bodyText: row.body_text,
        kind: row.kind,
        source: row.source,
        languageCodes: parseLanguageCodes(row.language_codes_json),
        model: row.model,
        markAnalysisPending: false,
      });
      migrated += 1;
    } catch (error) {
      failures.push({
        itemId: row.item_id,
        message: error instanceof Error ? error.message : "Migration failed.",
      });
    }
  }

  const remaining = await d1
    .prepare(
      `SELECT count(*) AS count
       FROM source_documents
       WHERE length(trim(body_text)) >= 40
         AND (storage_backend <> 'r2' OR object_key IS NULL)`,
    )
    .first<{ count: number }>();

  return {
    attempted: rows.results?.length ?? 0,
    migrated,
    remaining: remaining?.count ?? 0,
    failures,
  };
}

export async function sourceStorageStats(d1: D1Database) {
  const result = await d1
    .prepare(
      `SELECT
         count(*) AS total,
         sum(CASE WHEN storage_backend = 'r2' AND storage_status = 'ready'
                  THEN 1 ELSE 0 END) AS r2_ready,
         sum(CASE WHEN length(trim(body_text)) >= 40
                  THEN 1 ELSE 0 END) AS legacy_d1,
         sum(CASE WHEN storage_backend = 'r2' THEN byte_size ELSE 0 END)
           AS referenced_r2_bytes
       FROM source_documents`,
    )
    .all<{
      total: number;
      r2_ready: number | null;
      legacy_d1: number | null;
      referenced_r2_bytes: number | null;
    }>();
  const row = result.results?.[0];
  const d1Bytes = result.meta.size_after ?? 0;
  const referencedR2Bytes = row?.referenced_r2_bytes ?? 0;

  return {
    total: row?.total ?? 0,
    r2Ready: row?.r2_ready ?? 0,
    legacyD1: row?.legacy_d1 ?? 0,
    referencedR2Bytes,
    d1Bytes,
    warnings: {
      d1FreePlan: d1Bytes >= 400_000_000,
      r2FreeStorageEstimate: referencedR2Bytes >= 8_000_000_000,
    },
  };
}
