/**
 * Groundedness evaluator (V0.5-C).
 * Does not receive gold labels / expected grades — only query, answer, retrieved context evidence.
 * Status-based output; numeric score is secondary.
 */

export type GroundednessStatus =
  | 'grounded'
  | 'partially_grounded'
  | 'ungrounded'
  | 'unable_to_evaluate';

export interface GroundednessInput {
  query: string;
  answer: string;
  /** server-owned citation ids that were validated */
  citations: string[];
  /** retrieved context texts actually shown to the LLM */
  contextTexts: string[];
  contextChunkIds: string[];
}

export interface GroundednessResult {
  status: GroundednessStatus;
  score: number | null;
  evaluatorName: string;
  evaluatorModel: string | null;
  evaluatorVersion: string;
  manualReviewRequired: boolean;
  notes: string[];
}

export interface GroundednessEvaluatorPort {
  evaluate(input: GroundednessInput): Promise<GroundednessResult>;
}

export const GROUNDEDNESS_EVALUATOR_VERSION = '1.0.0';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}%]+/u)
    .filter((t) => t.length >= 2);
}

/**
 * Deterministic lexical overlap groundedness judge.
 * Suitable for infrastructure validation; model-based judge can be plugged later.
 */
export class LexicalGroundednessEvaluator implements GroundednessEvaluatorPort {
  constructor(
    private readonly options: {
      evaluatorName?: string;
      evaluatorModel?: string | null;
      groundedThreshold?: number;
      partialThreshold?: number;
    } = {},
  ) {}

  async evaluate(input: GroundednessInput): Promise<GroundednessResult> {
    const notes: string[] = [];
    const evaluatorName = this.options.evaluatorName ?? 'lexical-overlap';
    const evaluatorModel = this.options.evaluatorModel ?? null;
    const base = {
      evaluatorName,
      evaluatorModel,
      evaluatorVersion: GROUNDEDNESS_EVALUATOR_VERSION,
    };

    const answer = (input.answer ?? '').trim();
    if (answer.length === 0) {
      return {
        ...base,
        status: 'unable_to_evaluate',
        score: null,
        manualReviewRequired: false,
        notes: ['empty answer'],
      };
    }

    const contextBlob = input.contextTexts.join('\n');
    if (contextBlob.trim().length === 0) {
      // no evidence: answer should abstain
      const looksLikeAbstain =
        /无法确认|无法回答|没有足够|cannot confirm|insufficient|unable to|no (sufficient )?evidence|根据当前知识库内容/i.test(
          answer,
        );
      return {
        ...base,
        status: looksLikeAbstain ? 'grounded' : 'ungrounded',
        score: looksLikeAbstain ? 1 : 0,
        manualReviewRequired: !looksLikeAbstain,
        notes: ['no retrieved context'],
      };
    }

    const answerTokens = new Set(tokenize(answer));
    const contextTokens = new Set(tokenize(contextBlob));
    if (answerTokens.size === 0) {
      return {
        ...base,
        status: 'unable_to_evaluate',
        score: null,
        manualReviewRequired: true,
        notes: ['answer has no tokens'],
      };
    }

    let overlap = 0;
    for (const t of answerTokens) {
      if (contextTokens.has(t)) overlap += 1;
    }
    const ratio = overlap / answerTokens.size;
    const groundedT = this.options.groundedThreshold ?? 0.55;
    const partialT = this.options.partialThreshold ?? 0.25;

    let status: GroundednessStatus;
    if (ratio >= groundedT) status = 'grounded';
    else if (ratio >= partialT) status = 'partially_grounded';
    else status = 'ungrounded';

    if (status === 'partially_grounded') {
      notes.push('partial lexical overlap; manual review recommended for factual claims');
    }
    if (input.citations.length === 0 && status !== 'ungrounded') {
      notes.push('no citations provided');
    }

    return {
      ...base,
      status,
      score: Number(ratio.toFixed(4)),
      manualReviewRequired: status === 'partially_grounded',
      notes,
    };
  }
}
