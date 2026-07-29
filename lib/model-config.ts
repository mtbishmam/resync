export const TEXT_MODEL = "gpt-5.4-mini-2026-03-17";
export const TRANSCRIPTION_MODEL = "gpt-transcribe";

export const SCORING_CRITERIA = [
  {
    label: "Novelty",
    max: 25,
    description: "How much is genuinely new relative to what you already learned.",
  },
  {
    label: "Actionability",
    max: 25,
    description: "How many specific, useful actions or decisions the content enables.",
  },
  {
    label: "Information density",
    max: 20,
    description: "How much non-redundant value is delivered per section.",
  },
  {
    label: "Evidence quality",
    max: 15,
    description: "How well important claims are supported.",
  },
  {
    label: "Time efficiency",
    max: 15,
    description: "Whether the new value justifies the time required.",
  },
] as const;
