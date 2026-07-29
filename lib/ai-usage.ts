export type UsageNumbers = {
  inputTokens: number;
  cachedInputTokens: number;
  audioInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsagePayload = {
  input_tokens?: unknown;
  cached_input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
  input_tokens_details?: { cached_tokens?: unknown };
  input_token_details?: {
    cached_tokens?: unknown;
    audio_tokens?: unknown;
  };
};

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

export function usageFromPayload(value: unknown): UsageNumbers {
  const payload =
    value && typeof value === "object"
      ? (value as { usage?: UsagePayload }).usage ?? (value as UsagePayload)
      : {};
  const inputTokens = count(payload.input_tokens);
  const cachedInputTokens = count(
    payload.input_tokens_details?.cached_tokens ??
      payload.input_token_details?.cached_tokens ??
      payload.cached_input_tokens,
  );
  const audioInputTokens = count(payload.input_token_details?.audio_tokens);
  const outputTokens = count(payload.output_tokens);
  return {
    inputTokens,
    cachedInputTokens,
    audioInputTokens,
    outputTokens,
    totalTokens: count(payload.total_tokens) || inputTokens + outputTokens,
  };
}

export function estimateCostMicros(
  model: string,
  usage: UsageNumbers,
): number | null {
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  if (model.startsWith("gpt-5.4-mini")) {
    // Standard API list price per 1M tokens: $0.75 input, $0.075 cached, $4.50 output.
    return Math.round(
      uncachedInput * 0.75 +
        usage.cachedInputTokens * 0.075 +
        usage.outputTokens * 4.5,
    );
  }
  if (model === "gpt-4o-transcribe") {
    // Audio token list price per 1M tokens: $2.50 input, $10 output.
    return Math.round(usage.inputTokens * 2.5 + usage.outputTokens * 10);
  }
  return null;
}

export function usageStatement(
  d1: D1Database,
  {
    itemId,
    purpose,
    model,
    usage,
    hasUnpricedTools = false,
    createdAt = Date.now(),
  }: {
    itemId: string;
    purpose: "analysis" | "chat" | "knowledge" | "transcription";
    model: string;
    usage: UsageNumbers;
    hasUnpricedTools?: boolean;
    createdAt?: number;
  },
) {
  return d1
    .prepare(
      `INSERT INTO ai_usage_events (
        id, item_id, purpose, model, input_tokens, cached_input_tokens,
        audio_input_tokens, output_tokens, total_tokens,
        estimated_cost_micros, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      crypto.randomUUID(),
      itemId,
      purpose,
      model,
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.audioInputTokens,
      usage.outputTokens,
      usage.totalTokens,
      hasUnpricedTools ? null : estimateCostMicros(model, usage),
      createdAt,
    );
}
