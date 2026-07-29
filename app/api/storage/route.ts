import { ensureNormalizedLibrary } from "../../../db/library";
import {
  migrateLegacySourceDocuments,
  sourceStorageStats,
} from "../../../lib/source-storage";

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

export async function GET() {
  try {
    const d1 = await ensureNormalizedLibrary();
    return noStoreJson(await sourceStorageStats(d1));
  } catch {
    return noStoreJson(
      { error: "Source storage status is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      limit?: unknown;
    };
    if (body.action !== "migrate") {
      return noStoreJson(
        { error: "The requested source-storage action is not supported." },
        { status: 400 },
      );
    }
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? body.limit
        : 10;
    const d1 = await ensureNormalizedLibrary();
    const migration = await migrateLegacySourceDocuments({ d1, limit });
    return noStoreJson({
      ...migration,
      stats: await sourceStorageStats(d1),
    });
  } catch {
    return noStoreJson(
      { error: "Source storage migration is temporarily unavailable." },
      { status: 503 },
    );
  }
}
