import { getD1 } from "../../../db";

const LIBRARY_ID = "primary";
const MAX_SNAPSHOT_BYTES = 1_500_000;
const CREATE_LIBRARY_TABLE = `
  CREATE TABLE IF NOT EXISTS replay_library (
    id TEXT PRIMARY KEY NOT NULL,
    videos_json TEXT DEFAULT '[]' NOT NULL,
    notes_json TEXT DEFAULT '{}' NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

type LibraryRow = {
  videos_json: string;
  notes_json: string;
  updated_at: number;
};

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

async function ensureLibraryTable() {
  const d1 = await getD1();
  await d1.prepare(CREATE_LIBRARY_TABLE).run();
  return d1;
}

function parseNotes(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, note]) => typeof note !== "string")) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

export async function GET() {
  try {
    const d1 = await ensureLibraryTable();
    const row = await d1
      .prepare(
        "SELECT videos_json, notes_json, updated_at FROM replay_library WHERE id = ?1",
      )
      .bind(LIBRARY_ID)
      .first<LibraryRow>();

    if (!row) {
      return noStoreJson({
        exists: false,
        videos: [],
        notes: {},
        updatedAt: 0,
      });
    }

    return noStoreJson({
      exists: true,
      videos: JSON.parse(row.videos_json),
      notes: JSON.parse(row.notes_json),
      updatedAt: row.updated_at,
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
    const body = (await request.json()) as {
      videos?: unknown;
      notes?: unknown;
    };
    const notes = parseNotes(body.notes);

    if (!Array.isArray(body.videos) || !notes) {
      return noStoreJson(
        { error: "Invalid RePlay library snapshot." },
        { status: 400 },
      );
    }

    const videosJson = JSON.stringify(body.videos);
    const notesJson = JSON.stringify(notes);
    if (videosJson.length + notesJson.length > MAX_SNAPSHOT_BYTES) {
      return noStoreJson(
        { error: "The RePlay library is too large to sync." },
        { status: 413 },
      );
    }

    const updatedAt = Date.now();
    const d1 = await ensureLibraryTable();
    await d1
      .prepare(
        `INSERT INTO replay_library (id, videos_json, notes_json, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
           videos_json = excluded.videos_json,
           notes_json = excluded.notes_json,
           updated_at = excluded.updated_at`,
      )
      .bind(LIBRARY_ID, videosJson, notesJson, updatedAt)
      .run();

    return noStoreJson({ saved: true, updatedAt });
  } catch {
    return noStoreJson(
      { error: "Cloud library is temporarily unavailable." },
      { status: 503 },
    );
  }
}
