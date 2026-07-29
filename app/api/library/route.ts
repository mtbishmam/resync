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

const MAX_REQUEST_BYTES = 1_500_000;

type NoteRow = {
  item_id: string;
  body_markdown: string;
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
    const [itemResults, noteResults, initialized] = await Promise.all([
      d1.prepare("SELECT * FROM items ORDER BY added_at DESC").all<ItemRow>(),
      d1.prepare("SELECT item_id, body_markdown FROM notes").all<NoteRow>(),
      d1
        .prepare("SELECT value FROM app_meta WHERE key = ?1")
        .bind(NORMALIZED_LIBRARY_KEY)
        .first<{ value: string }>(),
    ]);

    return noStoreJson({
      exists: Boolean(initialized),
      videos: (itemResults.results ?? []).map(itemFromRow),
      notes: Object.fromEntries(
        (noteResults.results ?? []).map((note) => [
          note.item_id,
          note.body_markdown,
        ]),
      ),
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

    return noStoreJson({ saved: true, updatedAt });
  } catch {
    return noStoreJson(
      { error: "Cloud library is temporarily unavailable." },
      { status: 503 },
    );
  }
}
