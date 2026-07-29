import {
  ensureNormalizedLibrary,
  itemFromRow,
  ItemRow,
  LibraryItem,
  upsertItemStatement,
} from "../../../db/library";
import { storeSourceDocument } from "../../../lib/transcript-analysis";

const COOLDOWN_MINUTES = 5;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

function parseWebUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function youtubeIdFromUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate: string | null | undefined;
  if (hostname === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0];
  } else if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
    if (
      url.pathname.startsWith("/shorts/") ||
      url.pathname.startsWith("/embed/") ||
      url.pathname.startsWith("/live/")
    ) {
      candidate = url.pathname.split("/").filter(Boolean)[1];
    } else if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    }
  }
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

function shortText(value: unknown, fallback: string, max = 500) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: unknown;
      title?: unknown;
      author?: unknown;
      content?: unknown;
    };
    const url = parseWebUrl(body.url);
    if (!url) {
      return noStoreJson(
        { error: "The extension did not provide a valid webpage URL." },
        { status: 400 },
      );
    }
    const youtubeId = youtubeIdFromUrl(url);
    const type = youtubeId ? "Watch" : "Read";
    const d1 = await ensureNormalizedLibrary();
    const existing = youtubeId
      ? await d1
          .prepare("SELECT * FROM items WHERE youtube_id = ?1")
          .bind(youtubeId)
          .first<ItemRow>()
      : await d1
          .prepare("SELECT * FROM items WHERE url = ?1")
          .bind(url.toString())
          .first<ItemRow>();

    const now = Date.now();
    const current = existing ? itemFromRow(existing) : null;
    const item: LibraryItem = current
      ? {
          ...current,
          title: shortText(body.title, current.title),
          channel: shortText(body.author, current.channel, 200),
          status: current.status === "feed" ? "inbox" : current.status,
          cooldownUntil:
            current.status === "feed"
              ? now + COOLDOWN_MINUTES * 60 * 1000
              : current.cooldownUntil,
        }
      : {
          id: crypto.randomUUID(),
          youtubeId: youtubeId ?? undefined,
          url: url.toString(),
          title: shortText(
            body.title,
            type === "Watch" ? "Saved YouTube video" : url.hostname,
          ),
          channel: shortText(body.author, url.hostname, 200),
          durationMinutes: 0,
          durationSeconds: 0,
          type,
          topics: [],
          status: "inbox",
          valueScore: 0,
          valueReason: "AI analysis begins after cooldown",
          addedAt: now,
          cooldownUntil: now + COOLDOWN_MINUTES * 60 * 1000,
          progress: 0,
          accent: type === "Watch" ? "red" : "blue",
          transcriptStatus:
            typeof body.content === "string" && body.content.trim().length >= 40
              ? "available"
              : "pending",
          analysisStatus: "pending",
        };

    await upsertItemStatement(d1, item, now).run();
    let contentCaptured = false;
    if (typeof body.content === "string" && body.content.trim().length >= 40) {
      await storeSourceDocument({
        d1,
        itemId: item.id,
        bodyText: body.content,
        kind: type === "Watch" ? "video_transcript" : "article",
        source: type === "Watch" ? "extension" : "extension-page",
      });
      contentCaptured = true;
    }

    return noStoreJson({
      status: existing ? "updated" : "created",
      contentCaptured,
      item: {
        ...item,
        transcriptStatus: contentCaptured
          ? ("available" as const)
          : item.transcriptStatus,
        analysisStatus: "pending" as const,
      },
      message:
        type === "Watch" && !contentCaptured
          ? "Saved to Inbox. YouTube transcript was not found; paste it in the extension or ReSync."
          : `Saved to Inbox. Analysis begins after the ${COOLDOWN_MINUTES}-minute cooldown.`,
    });
  } catch {
    return noStoreJson(
      { error: "ReSync could not capture this page." },
      { status: 503 },
    );
  }
}
