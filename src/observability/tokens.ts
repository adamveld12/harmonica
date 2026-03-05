import type { TokenUsage } from "../types.ts";

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export function formatUsage(usage: TokenUsage): string {
  return `in=${usage.inputTokens} out=${usage.outputTokens} cache_read=${usage.cacheReadTokens} cache_write=${usage.cacheWriteTokens}`;
}

export function estimateCostUsd(usage: TokenUsage, _model: string): number {
  const inputRate = 3.0;
  const outputRate = 15.0;
  const cacheReadRate = 0.30;
  const cacheWriteRate = 3.75;
  return (
    (usage.inputTokens / 1_000_000) * inputRate +
    (usage.outputTokens / 1_000_000) * outputRate +
    (usage.cacheReadTokens / 1_000_000) * cacheReadRate +
    (usage.cacheWriteTokens / 1_000_000) * cacheWriteRate
  );
}
