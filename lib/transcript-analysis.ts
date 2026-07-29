import { itemFromRow } from "../db/library";

export const ANALYSIS_MODEL = "gpt-5.4-mini-2026-03-17";
export const PROMPT_VERSION = "resync-transcript-v2";
export const MAX_TRANSCRIPT_CHARACTERS = 900_000;

const TOPICS = new Set(["AI", "CP", "Tech", "Business"]);

type Topic = "AI" | "CP" | "Tech" | "Business";

type Analysis = {
  type: "Watch" | "Read";
  topics: Topic[];
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

export type TranscriptSource =
  | "extension"
  | "manual-paste"
  | "gpt-transcribe"
  | "youtube-captions-api";

type AnalysisOptions = {
  d1: D1Database;
  item: ReturnType<typeof itemFromRow>;
  transcript: string;
  source: TranscriptSource;
  languageCodes?: string[];
  transcriptionModel?: string | null;
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

export async function sha256(value: string) {
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

async function requestAnalysis(
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
      model: ANALYSIS_MODEL,
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

Transcript:
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

export async function analyzeAndStoreTranscript({
  d1,
  item,
  transcript,
  source,
  languageCodes = [],
  transcriptionModel = null,
}: AnalysisOptions) {
  const cleanTranscript = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARACTERS);
  if (cleanTranscript.length < 40) {
    throw new Error("The transcript is too short to analyze.");
  }

  const transcriptHash = await sha256(cleanTranscript);
  const now = Date.now();
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO transcripts (
          id, item_id, body_text, source, language_codes_json, model,
          transcript_hash, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        ON CONFLICT(item_id) DO UPDATE SET
          body_text = excluded.body_text,
          source = excluded.source,
          language_codes_json = excluded.language_codes_json,
          model = excluded.model,
          transcript_hash = excluded.transcript_hash,
          updated_at = excluded.updated_at`,
      )
      .bind(
        `transcript:${item.id}`,
        item.id,
        cleanTranscript,
        source,
        JSON.stringify(languageCodes),
        transcriptionModel,
        transcriptHash,
        now,
      ),
    d1
      .prepare(
        `UPDATE items
         SET transcript_status = 'available',
             analysis_status = 'pending',
             updated_at = ?2
         WHERE id = ?1`,
      )
      .bind(item.id, now),
  ]);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OpenAI API key is not configured.");
    error.name = "OpenAINotConfigured";
    throw error;
  }

  const analysis = await requestAnalysis(apiKey, item, cleanTranscript);
  const factors = factorRows(analysis);
  const analyzedAt = Date.now();
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
        source,
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
        ANALYSIS_MODEL,
        PROMPT_VERSION,
        analyzedAt,
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
        analyzedAt,
      ),
  ]);

  return {
    status: "complete" as const,
    transcriptStatus: "available" as const,
    analysisStatus: "complete" as const,
    model: ANALYSIS_MODEL,
    transcript: {
      source,
      languageCodes,
      characterCount: cleanTranscript.length,
    },
    analysis: {
      ...analysis,
      valueFactors: factors,
    },
  };
}
