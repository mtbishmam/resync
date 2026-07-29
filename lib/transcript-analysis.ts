import { itemFromRow } from "../db/library";
import { usageFromPayload, usageStatement } from "./ai-usage";
import { SCORING_CRITERIA, TEXT_MODEL } from "./model-config";
import {
  MAX_SOURCE_CHARACTERS,
  storeSourceDocument,
} from "./source-storage";
import type {
  SourceDocumentKind,
  TranscriptSource,
} from "./source-storage";

export const ANALYSIS_MODEL = TEXT_MODEL;
export const PROMPT_VERSION = "resync-transcript-v3-knowledge-aware";
export const MAX_TRANSCRIPT_CHARACTERS = MAX_SOURCE_CHARACTERS;
export {
  sha256,
  storeSourceDocument,
} from "./source-storage";
export type {
  SourceDocumentKind,
  TranscriptSource,
} from "./source-storage";

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

type AnalysisOptions = {
  d1: D1Database;
  item: ReturnType<typeof itemFromRow>;
  transcript: string;
  source: TranscriptSource;
  contentKind?: SourceDocumentKind;
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
  learnedKnowledge: string,
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
          content: `You analyze saved learning content for ReSync. Classify it using only the supplied transcript and metadata. Topics must be a subset of AI, CP (competitive programming), Tech, and Business. Recommend summary_only when the transcript is repetitive, generic, or contains no meaningful non-obvious lesson.

Score personal value as the exact sum of ${SCORING_CRITERIA.map((criterion) => `${criterion.label.toLowerCase()} /${criterion.max}`).join(", ")}. Treat the supplied prior learned knowledge as the user's existing baseline: repeated ideas must reduce novelty, information density, time efficiency, and any actionability that is not genuinely new. Evidence quality should still reflect the source itself. Write value_reason as one plain sentence of at most 18 words, focused on the strongest reason to watch or skip. Keep the summary concise and factual. Never infer claims that are absent from the transcript.`,
        },
        {
          role: "user",
          content: `Title: ${item.title}
Author: ${item.channel}
Duration seconds: ${item.durationSeconds ?? 0}

Prior learned knowledge from the user's own notes (exclude this item's notes):
${learnedKnowledge || "No prior learned knowledge has been summarized yet."}

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
  return { analysis: parsed, usage: usageFromPayload(payload) };
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
  contentKind = item.type === "Read" ? "article" : "video_transcript",
  languageCodes = [],
  transcriptionModel = null,
}: AnalysisOptions) {
  const stored = await storeSourceDocument({
    d1,
    itemId: item.id,
    bodyText: transcript,
    kind: contentKind,
    source,
    languageCodes,
    model: transcriptionModel,
  });
  const cleanTranscript = stored.bodyText;
  const transcriptHash = stored.contentHash;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OpenAI API key is not configured.");
    error.name = "OpenAINotConfigured";
    throw error;
  }

  const knowledgeRows = await d1
    .prepare(
      `SELECT summary_markdown
       FROM learned_summaries
       WHERE item_id <> ?1
       ORDER BY updated_at DESC
       LIMIT 100`,
    )
    .bind(item.id)
    .all<{ summary_markdown: string }>();
  const learnedKnowledge = (knowledgeRows.results ?? [])
    .map((row) => row.summary_markdown.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 50_000);
  const requested = await requestAnalysis(
    apiKey,
    item,
    cleanTranscript,
    learnedKnowledge,
  );
  const analysis = requested.analysis;
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
    usageStatement(d1, {
      itemId: item.id,
      purpose: "analysis",
      model: ANALYSIS_MODEL,
      usage: requested.usage,
      createdAt: analyzedAt,
    }),
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
