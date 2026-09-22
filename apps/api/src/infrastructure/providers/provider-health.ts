import { providerRegistry } from './provider.registry';
import {
  loadEmbeddingProviderConfig,
  loadLlmProviderConfig,
  loadRerankerProviderConfig,
} from './provider-config';

export interface ProviderHealthResult {
  capability: 'embedding' | 'reranker' | 'llm';
  provider: string;
  model: string;
  ok: boolean;
  code?: string;
  message?: string;
}

async function checkEmbedding(): Promise<ProviderHealthResult> {
  const config = loadEmbeddingProviderConfig();
  const provider = providerRegistry.resolveEmbedding(config);
  try {
    const result = await provider.embed({ text: 'health' });
    const finite = result.vector.every((v) => Number.isFinite(v));
    return {
      capability: 'embedding',
      provider: config.providerId,
      model: config.modelId,
      ok: finite && result.vector.length === config.dimensions,
      message: finite ? 'ok' : 'invalid vector',
    };
  } catch (error) {
    return {
      capability: 'embedding',
      provider: config.providerId,
      model: config.modelId,
      ok: false,
      code: 'PROVIDER_INVALID_RESPONSE',
      message: error instanceof Error ? error.message : 'failed',
    };
  }
}

async function checkReranker(): Promise<ProviderHealthResult> {
  const config = loadRerankerProviderConfig();
  const provider = providerRegistry.resolveReranker(config);
  try {
    const results = await provider.rerank([
      { query: 'health', chunkId: 'h1', content: 'alpha' },
      { query: 'health', chunkId: 'h2', content: 'beta' },
    ]);
    return {
      capability: 'reranker',
      provider: config.providerId,
      model: config.modelId,
      ok: results.length === 2 && results.every((r) => Number.isFinite(r.score)),
    };
  } catch (error) {
    return {
      capability: 'reranker',
      provider: config.providerId,
      model: config.modelId,
      ok: false,
      code: 'PROVIDER_INVALID_RESPONSE',
      message: error instanceof Error ? error.message : 'failed',
    };
  }
}

async function checkLlm(): Promise<ProviderHealthResult> {
  const config = loadLlmProviderConfig();
  const provider = providerRegistry.resolveLlm(config);
  try {
    const result = await provider.generate({
      systemPrompt: 'Answer only from context.',
      userQuery: 'What is the AKB smoke test value?',
      context: [
        {
          citationId: 'C1',
          chunkId: 'c1',
          documentId: 'd1',
          documentVersionId: 'v1',
          knowledgeSpaceId: 's1',
          chunkIndex: 0,
          content: 'Test fact: AKB smoke test value is 42.',
          metadata: {},
          truncated: false,
        },
      ],
    });
    return {
      capability: 'llm',
      provider: config.providerId,
      model: config.modelId,
      ok: typeof result.answer === 'string' && result.answer.trim().length > 0,
    };
  } catch (error) {
    return {
      capability: 'llm',
      provider: config.providerId,
      model: config.modelId,
      ok: false,
      code: 'PROVIDER_INVALID_RESPONSE',
      message: error instanceof Error ? error.message : 'failed',
    };
  }
}

export async function runProviderHealthChecks(): Promise<ProviderHealthResult[]> {
  return Promise.all([checkEmbedding(), checkReranker(), checkLlm()]);
}

export async function runProviderSmokeTest(): Promise<{
  mode: string;
  results: ProviderHealthResult[];
  status: 'PASS' | 'SKIPPED_PROVIDER_UNAVAILABLE' | 'FAIL';
}> {
  const mode = process.env['PROVIDER_MODE'] === 'production' ? 'production' : 'mock';
  const results = await runProviderHealthChecks();
  const allOk = results.every((r) => r.ok);
  if (mode === 'production' && process.env['EMBEDDING_API_KEY'] === undefined) {
    return { mode, results, status: 'SKIPPED_PROVIDER_UNAVAILABLE' };
  }
  return { mode, results, status: allOk ? 'PASS' : 'FAIL' };
}
