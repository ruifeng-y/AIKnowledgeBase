import type {
  LlmGenerateInput,
  LlmGenerateResult,
  LlmIdentity,
  LlmProviderPort,
} from '../../modules/retrieval/domain/rag.port';
import { providerHttpPost } from './http-transport';
import { ProviderError, logProviderMetric } from './provider-error';
import type { LlmProviderConfig } from './provider-config';
import { validateProductionProviderConfig } from './provider-config';

interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Production LLM adapter (OpenAI-compatible chat completions).
 * Adapter only translates request/response — does not alter grounding prompts.
 */
export class OpenAICompatibleLlmAdapter implements LlmProviderPort {
  constructor(private readonly config: LlmProviderConfig) {
    validateProductionProviderConfig(config);
  }

  identity(): LlmIdentity {
    return { provider: this.config.providerId, model: this.config.modelId };
  }

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const started = Date.now();
    try {
      const payload = await providerHttpPost({
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'llm',
        endpoint: normalizeChatEndpoint(this.config.endpoint),
        apiKey: this.config.apiKey,
        body: {
          model: this.config.modelId,
          temperature: this.config.temperature,
          max_tokens: this.config.maxOutputTokens,
          messages: [
            { role: 'system', content: input.systemPrompt },
            {
              role: 'user',
              content: `${input.userQuery}\n\n${summarizeContextMeta(input.context.length)}`,
            },
          ],
        },
        timeoutMs: this.config.timeoutMs,
        maxRetries: this.config.maxRetries,
      });

      const parsed = parseLlmResponse(payload.json, this.config);
      const usage = parsed.usage;
      const usageMeta =
        usage && usage !== 'unavailable'
          ? usage
          : { inputTokens: null, outputTokens: null, totalTokens: null };
      logProviderMetric({
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'llm',
        latencyMs: Date.now() - started,
        success: true,
        retryCount: 0,
        inputTokens: usageMeta.inputTokens,
        outputTokens: usageMeta.outputTokens,
        totalTokens: usageMeta.totalTokens,
      });
      return parsed;
    } catch (error) {
      logProviderMetric({
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'llm',
        latencyMs: Date.now() - started,
        success: false,
        errorCode: error instanceof ProviderError ? error.code : 'PROVIDER_INVALID_RESPONSE',
        retryCount: 0,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      });
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'llm provider failed', {
        provider: this.config.providerId,
        model: this.config.modelId,
        operation: 'llm',
      });
    }
  }
}

function summarizeContextMeta(count: number): string {
  return `(retrieved_knowledge_items=${count})`;
}

function normalizeChatEndpoint(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) {
    return base;
  }
  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

function parseLlmResponse(json: unknown, config: LlmProviderConfig): LlmGenerateResult {
  const payload = json as ChatCompletionPayload;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'llm content missing or empty', {
      provider: config.providerId,
      model: config.modelId,
      operation: 'llm',
    });
  }
  const usage = payload?.usage;
  return {
    answer: content,
    provider: config.providerId,
    model: config.modelId,
    usage:
      usage && typeof usage.total_tokens === 'number'
        ? {
            inputTokens: usage.prompt_tokens ?? null,
            outputTokens: usage.completion_tokens ?? null,
            totalTokens: usage.total_tokens,
          }
        : 'unavailable',
    finishReason: payload?.choices?.[0]?.finish_reason ?? null,
  };
}
