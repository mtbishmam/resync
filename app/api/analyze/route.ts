import {
  ensureNormalizedLibrary,
  itemFromRow,
  ItemRow,
} from "../../../db/library";
import {
  analyzeAndStoreTranscript,
  MAX_TRANSCRIPT_CHARACTERS,
  SourceDocumentKind,
  TranscriptSource,
} from "../../../lib/transcript-analysis";

type CaptionTrack = {
  id: string;
  snippet?: {
    language?: string;
    name?: string;
    trackKind?: string;
  };
};

const PROVIDED_SOURCES = new Set<TranscriptSource>([
  "extension",
  "extension-page",
  "manual-paste",
  "manual-article",
]);

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

function transcriptUnavailableMessage(captionAvailable?: boolean | null) {
  return captionAvailable
    ? "YouTube reports captions, but its official API cannot download them for videos you do not own. Paste the transcript or upload an audio/video file."
    : "YouTube does not report captions for this video. Paste the transcript or upload an audio/video file.";
}

async function markUnavailable(d1: D1Database, itemId: string) {
  await d1
    .prepare(
      `UPDATE items
       SET transcript_status = 'unavailable',
           analysis_status = 'unavailable',
           updated_at = ?2
       WHERE id = ?1`,
    )
    .bind(itemId, Date.now())
    .run();
}

function chooseCaptionTrack(tracks: CaptionTrack[]) {
  return (
    tracks.find(
      (track) =>
        track.snippet?.language?.toLowerCase().startsWith("en") &&
        track.snippet?.trackKind !== "ASR",
    ) ??
    tracks.find((track) =>
      track.snippet?.language?.toLowerCase().startsWith("en"),
    ) ??
    tracks[0]
  );
}

async function fetchOfficialTranscript(
  youtubeId: string,
  captionAvailable?: boolean | null,
) {
  if (captionAvailable === false) {
    return { kind: "unavailable" as const };
  }

  const accessToken = process.env.YOUTUBE_OAUTH_ACCESS_TOKEN;
  if (!accessToken) {
    return { kind: "unavailable" as const };
  }

  const listUrl = new URL("https://www.googleapis.com/youtube/v3/captions");
  listUrl.searchParams.set("part", "snippet");
  listUrl.searchParams.set("videoId", youtubeId);
  const listResponse = await fetch(listUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!listResponse.ok) return { kind: "unavailable" as const };

  const list = (await listResponse.json()) as { items?: CaptionTrack[] };
  const track = chooseCaptionTrack(list.items ?? []);
  if (!track) return { kind: "unavailable" as const };

  const downloadUrl = new URL(
    `https://www.googleapis.com/youtube/v3/captions/${encodeURIComponent(track.id)}`,
  );
  downloadUrl.searchParams.set("tfmt", "vtt");
  const downloadResponse = await fetch(downloadUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!downloadResponse.ok) return { kind: "unavailable" as const };

  const transcript = await downloadResponse.text();
  if (!transcript.trim()) return { kind: "unavailable" as const };
  return {
    kind: "available" as const,
    transcript: transcript.slice(0, MAX_TRANSCRIPT_CHARACTERS),
    source: "youtube-captions-api" as const,
    languageCodes: track.snippet?.language
      ? [track.snippet.language.toLowerCase()]
      : [],
  };
}

export async function POST(request: Request) {
  let d1: D1Database | null = null;
  let itemId: string | null = null;
  try {
    const body = (await request.json()) as {
      itemId?: unknown;
      transcript?: unknown;
      content?: unknown;
      contentKind?: unknown;
      source?: unknown;
    };
    if (typeof body.itemId !== "string" || !body.itemId) {
      return noStoreJson(
        { error: "A valid itemId is required." },
        { status: 400 },
      );
    }
    itemId = body.itemId;

    d1 = await ensureNormalizedLibrary();
    const row = await d1
      .prepare("SELECT * FROM items WHERE id = ?1")
      .bind(itemId)
      .first<ItemRow>();
    if (!row) {
      return noStoreJson({ error: "ReSync item not found." }, { status: 404 });
    }
    const item = itemFromRow(row);

    const providedContent =
      typeof body.content === "string"
        ? body.content
        : typeof body.transcript === "string"
          ? body.transcript
          : null;
    if (providedContent !== null) {
      const source =
        typeof body.source === "string" &&
        PROVIDED_SOURCES.has(body.source as TranscriptSource)
          ? (body.source as TranscriptSource)
          : item.type === "Read"
            ? "manual-article"
            : "manual-paste";
      const contentKind: SourceDocumentKind =
        body.contentKind === "article" || item.type === "Read"
          ? "article"
          : "video_transcript";
      const result = await analyzeAndStoreTranscript({
        d1,
        item,
        transcript: providedContent,
        source,
        contentKind,
      });
      return noStoreJson(result);
    }

    if (item.cooldownUntil > Date.now()) {
      return noStoreJson(
        {
          status: "cooldown_pending",
          analysisStatus: "pending",
          cooldownUntil: item.cooldownUntil,
          message: "Analysis begins when the cooldown ends.",
        },
        { status: 409 },
      );
    }

    const storedContent = await d1
      .prepare(
        `SELECT body_text, kind, source, language_codes_json, model
         FROM source_documents WHERE item_id = ?1`,
      )
      .bind(item.id)
      .first<{
        body_text: string;
        kind: SourceDocumentKind;
        source: TranscriptSource;
        language_codes_json: string;
        model: string | null;
      }>();
    if (storedContent) {
      const result = await analyzeAndStoreTranscript({
        d1,
        item,
        transcript: storedContent.body_text,
        source: storedContent.source,
        contentKind: storedContent.kind,
        languageCodes: JSON.parse(storedContent.language_codes_json) as string[],
        transcriptionModel: storedContent.model,
      });
      return noStoreJson(result);
    }

    if (item.type === "Read") {
      await markUnavailable(d1, item.id);
      return noStoreJson({
        status: "content_unavailable",
        transcriptStatus: "unavailable",
        analysisStatus: "unavailable",
        message:
          "Article text is unavailable. Capture the page with the ReSync extension or paste its content.",
      });
    }
    if (!item.youtubeId) {
      return noStoreJson(
        { error: "A valid YouTube video is required for transcript analysis." },
        { status: 400 },
      );
    }

    const transcript = await fetchOfficialTranscript(
      item.youtubeId,
      item.captionAvailable,
    );
    if (transcript.kind === "unavailable") {
      await markUnavailable(d1, item.id);
      return noStoreJson({
        status: "transcript_unavailable",
        transcriptStatus: "unavailable",
        analysisStatus: "unavailable",
        message: transcriptUnavailableMessage(item.captionAvailable),
      });
    }

    const result = await analyzeAndStoreTranscript({
      d1,
      item,
      transcript: transcript.transcript,
      source: transcript.source,
      languageCodes: transcript.languageCodes,
    });
    return noStoreJson(result);
  } catch (error) {
    console.error("ReSync content analysis failed", error);
    if (error instanceof Error && error.name === "OpenAINotConfigured") {
      return noStoreJson(
        {
          error: error.message,
          code: "OPENAI_NOT_CONFIGURED",
          transcriptStatus: "available",
          analysisStatus: "pending",
        },
        { status: 503 },
      );
    }
    if (
      d1 &&
      itemId &&
      error instanceof Error &&
      !error.message.includes("too short")
    ) {
      await d1
        .prepare(
          `UPDATE items SET analysis_status = 'error', updated_at = ?2 WHERE id = ?1`,
        )
        .bind(itemId, Date.now())
        .run()
        .catch(() => undefined);
    }
    return noStoreJson(
      {
        error:
          error instanceof Error && error.message.includes("too short")
            ? error.message
            : "Content analysis is temporarily unavailable.",
        analysisStatus: "error",
      },
      { status: error instanceof Error && error.message.includes("too short") ? 400 : 503 },
    );
  }
}
