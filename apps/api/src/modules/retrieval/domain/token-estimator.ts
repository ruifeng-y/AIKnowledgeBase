/** Estimated token counting — deterministic approximation, not an exact LLM tokenizer. */
export function estimateContextTokens(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  const cjk = /[一-鿿㐀-䶿＀-￯]/g;
  const cjkCount = (text.match(cjk) ?? []).length;
  const withoutCjk = text.replace(cjk, ' ');
  const words = withoutCjk.split(/\s+/).filter((w) => w.length > 0);
  return Math.max(1, Math.ceil(cjkCount + words.length * 1.3));
}

/**
 * Source-preserving deterministic truncation by estimated tokens.
 * Keeps original order from the start; does not rewrite/summarize.
 */
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
): {
  content: string;
  truncated: boolean;
  estimatedTokens: number;
} {
  const fullTokens = estimateContextTokens(text);
  if (maxTokens <= 0) {
    return { content: '', truncated: text.length > 0, estimatedTokens: 0 };
  }
  if (fullTokens <= maxTokens) {
    return { content: text, truncated: false, estimatedTokens: fullTokens };
  }

  // Binary-search character prefix that stays within estimated token budget.
  let lo = 0;
  let hi = text.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.slice(0, mid);
    const tokens = estimateContextTokens(candidate);
    if (tokens <= maxTokens) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const content = text.slice(0, best);
  return {
    content,
    truncated: true,
    estimatedTokens: estimateContextTokens(content),
  };
}
