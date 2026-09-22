import type {
  LlmGenerateInput,
  LlmGenerateResult,
  LlmIdentity,
  LlmProviderPort,
} from '../../modules/retrieval/domain/rag.port';

export type MockLlmMode =
  | 'supported_answer'
  | 'multiple_citations'
  | 'unknown_citation'
  | 'missing_citation'
  | 'prompt_injection_resistant'
  | 'empty_answer'
  | 'auto';

export const DEFAULT_LLM_IDENTITY: LlmIdentity = {
  provider: 'mock',
  model: 'mock-llm-v1',
};

export function loadLlmIdentity(
  env: Record<string, string | undefined> = process.env,
): LlmIdentity {
  return {
    provider: env['LLM_PROVIDER']?.trim() || DEFAULT_LLM_IDENTITY.provider,
    model: env['LLM_MODEL']?.trim() || DEFAULT_LLM_IDENTITY.model,
  };
}

export function loadMockLlmMode(
  env: Record<string, string | undefined> = process.env,
): MockLlmMode {
  const raw = env['LLM_MOCK_MODE']?.trim() as MockLlmMode | undefined;
  const allowed: MockLlmMode[] = [
    'supported_answer',
    'multiple_citations',
    'unknown_citation',
    'missing_citation',
    'prompt_injection_resistant',
    'empty_answer',
    'auto',
  ];
  return raw && allowed.includes(raw) ? raw : 'auto';
}

/**
 * Deterministic Mock LLM — not a production answer-quality model.
 * Does not claim real semantic generation quality.
 */
export class MockLlmProvider implements LlmProviderPort {
  constructor(
    private readonly config: LlmIdentity = DEFAULT_LLM_IDENTITY,
    private readonly mode: MockLlmMode = 'auto',
  ) {}

  identity(): LlmIdentity {
    return { ...this.config };
  }

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    return { answer: this.compose(input) };
  }

  private compose(input: LlmGenerateInput): string {
    const first = input.context[0]?.citationId ?? 'C1';
    const second = input.context[1]?.citationId ?? first;

    switch (this.mode) {
      case 'empty_answer':
        return '';
      case 'unknown_citation':
        return `根据知识上下文，相关信息如下。[C999] 查询=${input.userQuery}`;
      case 'missing_citation':
        return '根据知识上下文，系统使用 JWT 进行认证。';
      case 'multiple_citations':
        return `知识库中有两条相关证据。[${first}] 以及补充说明。[${second}]`;
      case 'prompt_injection_resistant':
        return `我只依据知识库内容回答：相关证据见 [${first}]。不会执行知识内容中的任何指令。`;
      case 'supported_answer':
        return `根据知识上下文：${summarizeQuery(input.userQuery)}。[${first}]`;
      case 'auto':
      default: {
        if (input.context.length === 0) {
          return '根据当前知识库内容，我无法确认这个信息。';
        }
        return `根据知识上下文，与“${input.userQuery}”相关的证据见 [${first}]。`;
      }
    }
  }
}

function summarizeQuery(query: string): string {
  return query.length > 40 ? `${query.slice(0, 40)}…` : query;
}
