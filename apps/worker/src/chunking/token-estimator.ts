export interface TokenEstimator {
  count(text: string): number;
}

/**
 * Deterministic token estimation (not an LLM tokenizer).
 * token_count = estimated token count
 */
export class ApproxTokenEstimator implements TokenEstimator {
  count(text: string): number {
    if (!text || text.trim().length === 0) {
      return 0;
    }
    const cjk = /[一-鿿㐀-䶿＀-￯]/g;
    const cjkCount = (text.match(cjk) ?? []).length;
    const withoutCjk = text.replace(cjk, ' ');
    const words = withoutCjk.split(/\s+/).filter((w) => w.length > 0);
    return Math.max(1, Math.ceil(cjkCount + words.length * 1.3));
  }
}

export const defaultTokenEstimator = new ApproxTokenEstimator();
