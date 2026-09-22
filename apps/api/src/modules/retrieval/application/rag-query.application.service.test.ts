import { describe, expect, it } from 'vitest';
import { RagQueryApplicationService } from './rag-query.application.service';
import {
  DefaultContextBuilder,
  DefaultRagPromptBuilder,
  INSUFFICIENT_EVIDENCE_ANSWER,
  type LlmProviderPort,
} from '../domain/rag.port';
import type { RerankedSearchApplicationService } from './reranked-search.application.service';
import type { RerankedSearchResultItem } from '../domain/reranked-search.port';

function item(id: string, content = `content ${id}`): RerankedSearchResultItem {
  return {
    chunkId: id,
    documentId: 'doc',
    documentVersionId: 'ver',
    knowledgeSpaceId: 'space-1',
    content,
    chunkIndex: 0,
    score: 1,
    metadata: {},
  };
}

function makeService(options?: {
  items?: RerankedSearchResultItem[];
  llm?: LlmProviderPort;
  failRetrieval?: boolean;
  llmCalls?: number[];
}) {
  const llmCalls = options?.llmCalls ?? [];
  const service = new RagQueryApplicationService({
    authorization: { assertSpaceOwner: async () => ({ id: 'space-1' }) as never },
    rerankedSearch: {
      search: async () => {
        if (options?.failRetrieval) {
          throw new Error('retrieval down');
        }
        return {
          knowledgeSpaceId: 'space-1',
          versionId: null,
          query: 'q',
          topK: 20,
          retrievalCandidateK: 50,
          rerankCandidateK: 20,
          threshold: 0.3,
          provider: 'mock',
          model: 'mock-reranker-v1',
          total: options?.items?.length ?? 0,
          items: options?.items ?? [],
        };
      },
    } as unknown as RerankedSearchApplicationService,
    contextBuilder: new DefaultContextBuilder(),
    promptBuilder: new DefaultRagPromptBuilder(),
    llmProvider:
      options?.llm ??
      ({
        identity: () => ({ provider: 'mock', model: 'mock-llm-v1' }),
        generate: async () => {
          llmCalls.push(1);
          return { answer: '根据知识内容说明。[C1]' };
        },
      } satisfies LlmProviderPort),
  });
  return { service, llmCalls };
}

describe('RagQueryApplicationService', () => {
  it('empty retrieval skips LLM and returns insufficient response', async () => {
    const { service, llmCalls } = makeService({ items: [] });
    const result = await service.search('u', 'space-1', { query: 'jwt' });
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
    expect(result.citations).toEqual([]);
    expect(result.context.itemCount).toBe(0);
    expect(llmCalls).toHaveLength(0);
  });

  it('supported answer with citation', async () => {
    const { service } = makeService({ items: [item('c1', 'JWT authentication content')] });
    const result = await service.search('u', 'space-1', { query: 'jwt' });
    expect(result.answer).toContain('[C1]');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.chunkId).toBe('c1');
    expect(result.model.provider).toBe('mock');
  });

  it('unknown citation → 500', async () => {
    const { service } = makeService({
      items: [item('c1')],
      llm: {
        identity: () => ({ provider: 'mock', model: 'mock-llm-v1' }),
        generate: async () => ({ answer: 'bad [C999]' }),
      },
    });
    await expect(service.search('u', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'INVALID_CITATION_REFERENCE',
      httpStatus: 500,
    });
  });

  it('missing citation for factual answer → 500', async () => {
    const { service } = makeService({
      items: [item('c1')],
      llm: {
        identity: () => ({ provider: 'mock', model: 'mock-llm-v1' }),
        generate: async () => ({ answer: '系统使用 JWT 进行认证。' }),
      },
    });
    await expect(service.search('u', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'GROUNDED_RESPONSE_VALIDATION_FAILED',
      httpStatus: 500,
    });
  });

  it('empty LLM answer → 500', async () => {
    const { service } = makeService({
      items: [item('c1')],
      llm: {
        identity: () => ({ provider: 'mock', model: 'mock-llm-v1' }),
        generate: async () => ({ answer: '   ' }),
      },
    });
    await expect(service.search('u', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'LLM_EMPTY_RESPONSE',
      httpStatus: 500,
    });
  });

  it('LLM failure → 500 no fallback', async () => {
    const { service } = makeService({
      items: [item('c1')],
      llm: {
        identity: () => ({ provider: 'mock', model: 'mock-llm-v1' }),
        generate: async () => {
          throw new Error('down');
        },
      },
    });
    await expect(service.search('u', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'LLM_PROVIDER_ERROR',
      httpStatus: 500,
    });
  });

  it('rejects invalid contextTopK and budget', async () => {
    const { service } = makeService({ items: [item('c1')] });
    await expect(
      service.search('u', 'space-1', { query: 'jwt', contextTopK: 13 }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTEXT_TOP_K', httpStatus: 400 });
    await expect(
      service.search('u', 'space-1', { query: 'jwt', contextTokenBudget: 999 }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTEXT_TOKEN_BUDGET', httpStatus: 400 });
  });
});
