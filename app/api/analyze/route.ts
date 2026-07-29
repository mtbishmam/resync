import {
  ensureNormalizedLibrary,
  itemFromRow,
  ItemRow,
} from "../../../db/library";

const MODEL = "gpt-5.4-mini";
const PROMPT_VERSION = "resync-transcript-v1";
const MAX_TRANSCRIPT_CHARACTERS = 900_000;
const TOPICS = new Set(["AI", "CP", "Tech", "Business"]);

type CaptionTrack = {
  id: string;
  snippet?: {
    language?: string;
    name?: string;
    trackKind?: string;
  };
};

type Analysis = {
  type: "Watch" | "Read";
  topics: Array<"AI" | "CP" | "Tech" | "Business">;
  recommendation: "watch" | "skim" | "summary_only";
  novelty_score: number;
  value_score: number;
  value_reason: string;
  value_factors: {
    novelty: number;
    actionability: number;
    information_density: number;
    evidence_quality: number;
    time_efficiency: number;
  };
  summary_markdown: string;
  rationale_markdown: string;
  learnable_points: Array<{
    title: string;
    detail: string;
    timestamp_seconds: number | null;
  }>;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["Watch", "Read"] },
    topics: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: ["AI", "CP", "Tech", "Business"] },
    },
    recommendation: {
      type: "string",
      enum: ["watch", "skim", "summary_only"],
    },
    novelty_score: { type: "integer", minimum: 0, maximum: 100 },
    value_score: { type: "integer", minimum: 0, maximum: 100 },
    value_reason: { type: "string" },
    value_factors: {
      type: "object",
      additionalProperties: false,
      properties: {
        novelty: { type: "integer", minimum: 0, maximum: 25 },
        actionability: { type: "integer", minimum: 0, maximum: 25 },
        information_density: { type: "integer", minimum: 0, maximum: 20 },
        evidence_quality: { type: "integer", minimum: 0, maximum: 15 },
        time_efficiency: { type: "integer", minimum: 0, maximum: 15 },
      },
      required: [
        "novelty",
        "actionability",
        "information_density",
        "evidence_quality",
        "time_efficiency",
      ],
    },
    summary_markdown: { type: "string" },
    rationale_markdown: { type: "string" },
    learnable_points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          timestamp_seconds: {
            anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
          },
        },
        required: ["title", "detail", "timestamp_seconds"],
      },
    },
  },
  required: [
    "type",
    "topics",
    "recommendation",
    "novelty_score",
    "value_score",
    "value_reason",
    "value_factors",
    "summary_markdown",
    "rationale_markdown",
    "learnable_points",
  ],
} as const;

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}
function transcriptUnavailableMessage(captionAvailable?: boolean | null) {
  return captionAvailable
    ? "Transcript unavailable. YouTube reports captions, but its official API only allows caption downloads when the signed-in account can edit the video. AI analysis was skipped."
    : "Transcript unavailable. YouTube does not report captions for this video, so AI analysis was skipped.";
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
    source: "youtube-captions-api",
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function responseText(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const response = value as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function validAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const analysis = value as Partial<Analysis>;
  return (
    (analysis.type === "Watch" || analysis.type === "Read") &&
    Array.isArray(analysis.topics) &&
    analysis.topics.every((topic) => TOPICS.has(topic)) &&
    ["watch", "skim", "summary_only"].includes(analysis.recommendation ?? "") &&
    typeof analysis.novelty_score === "number" &&
    typeof analysis.value_score === "number" &&
    typeof analysis.value_reason === "string" &&
    typeof analysis.summary_markdown === "string" &&
    typeof analysis.rationale_markdown === "string" &&
    Array.isArray(analysis.learnable_points) &&
    Boolean(analysis.value_factors)
  );
}

async function analyzeTranscript(
  apiKey: string,
  item: ReturnType<typeof itemFromRow>,
  transcript: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content:
            "You analyze saved learning content for ReSync. Classify it using only the supplied transcript and metadata. Topics must be a subset of AI, CP (competitive programming), Tech, and Business. Recommend summary_only when the transcript is repetitive, generic, or contains no meaningful non-obvious lesson. Score value as the exact sum of novelty /25, actionability /25, information density /20, evidence quality /15, and time efficiency /15. Keep the summary concise and factual. Never infer claims that are absent from the transcript.",
        },
        {
          role: "user",
          content: `Title: ${item.title}
Author: ${item.channel}
Duration seconds: ${item.durationSeconds ?? 0}

YouTube transcript (VTT, with timestamps):
${transcript}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "resync_transcript_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const problem = await response.text();
    throw new Error(`OpenAI analysis failed (${response.status}): ${problem}`);
  }
  const payload = (await response.json()) as unknown;
  const text = responseText(payload);
  if (!text) throw new Error("OpenAI returned no analysis text.");
  const parsed = JSON.parse(text) as unknown;
  if (!validAnalysis(parsed)) {
    throw new Error("OpenAI returned an invalid ReSync analysis.");
  }
  return parsed;
}

function factorRows(analysis: Analysis) {
  return [
    { label: "Novelty", points: analysis.value_factors.novelty, max: 25 },
    {
      label: "Actionability",
      points: analysis.value_factors.actionability,
      max: 25,
    },
    {
      label: "Information density",
      points: analysis.value_factors.information_density,
      max: 20,
    },
    {
      label: "Evidence quality",
      points: analysis.value_factors.evidence_quality,
      max: 15,
    },
    {
      label: "Time efficiency",
      points: analysis.value_factors.time_efficiency,
      max: 15,
    },
  ];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { itemId?: unknown };
    if (typeof body.itemId !== "string" || !body.itemId) {
      return noStoreJson({ error: "A valid itemId is required." }, { status: 400 });
    }

    const d1 = await ensureNormalizedLibrary();
    const row = await d1
      .prepare("SELECT * FROM items WHERE id = ?1")
      .bind(body.itemId)
      .first<ItemRow>();
    if (!row) {
      return noStoreJson({ error: "ReSync item not found." }, { status: 404 });
    }
    const item = itemFromRow(row);
    if (item.type !== "Watch" || !item.youtubeId) {
      return noStoreJson(
        { error: "Transcript analysis currently supports YouTube videos only." },
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

    await d1
      .prepare(
        `UPDATE items
         SET transcript_status = 'available', analysis_status = 'pending', updated_at = ?2
         WHERE id = ?1`,
      )
      .bind(item.id, Date.now())
      .run();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return noStoreJson(
        {
          error: "OpenAI API key is not configured.",
          code: "OPENAI_NOT_CONFIGURED",
          transcriptStatus: "available",
          analysisStatus: "pending",
        },
        { status: 503 },
      );
    }

    const analysis = await analyzeTranscript(apiKey, item, transcript.transcript);
    const transcriptHash = await sha256(transcript.transcript);
    const factors = factorRows(analysis);
    const now = Date.now();
    await d1.batch([
      d1
        .prepare(
          `INSERT INTO ai_analyses (
            id, item_id, transcript_hash, transcript_source, summary_markdown,
            novelty_score, recommendation, learnable_points_json, suggested_type,
            suggested_topics_json, value_score, value_reason, value_factors_json,
            rationale_markdown, model, prompt_version, created_at
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17
          )
          ON CONFLICT(item_id, transcript_hash, model, prompt_version) DO UPDATE SET
            summary_markdown = excluded.summary_markdown,
            novelty_score = excluded.novelty_score,
            recommendation = excluded.recommendation,
            learnable_points_json = excluded.learnable_points_json,
            suggested_type = excluded.suggested_type,
            suggested_topics_json = excluded.suggested_topics_json,
            value_score = excluded.value_score,
            value_reason = excluded.value_reason,
            value_factors_json = excluded.value_factors_json,
            rationale_markdown = excluded.rationale_markdown,
            created_at = excluded.created_at`,
        )
        .bind(
          crypto.randomUUID(),
          item.id,
          transcriptHash,
          transcript.source,
          analysis.summary_markdown,
          analysis.novelty_score,
          analysis.recommendation,
          JSON.stringify(analysis.learnable_points),
          analysis.type,
          JSON.stringify(analysis.topics),
          analysis.value_score,
          analysis.value_reason,
          JSON.stringify(factors),
          analysis.rationale_markdown,
          MODEL,
          PROMPT_VERSION,
          now,
        ),
      d1
        .prepare(
          `UPDATE items SET
            content_type = ?2,
            topics_json = ?3,
            value_score = ?4,
            value_reason = ?5,
            value_factors_json = ?6,
            transcript_status = 'available',
            analysis_status = 'complete',
            updated_at = ?7
           WHERE id = ?1`,
        )
        .bind(
          item.id,
          analysis.type,
          JSON.stringify(analysis.topics),
          analysis.value_score,
          analysis.value_reason,
          JSON.stringify(factors),
          now,
        ),
    ]);

    return noStoreJson({
      status: "complete",
      transcriptStatus: "available",
      analysisStatus: "complete",
      model: MODEL,
      analysis: {
        ...analysis,
        valueFactors: factors,
      },
    });
  } catch {
    return noStoreJson(
      {
        error: "Transcript analysis is temporarily unavailable.",
        analysisStatus: "error",
      },
      { status: 503 },
    );
  }
}
