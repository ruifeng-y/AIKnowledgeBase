import type { AuthorizationService } from '../../shared/application/authorization.service';
import type { RerankedSearchApplicationService } from './reranked-search.application.service';
import {
  contextItemsToCitations,
  INSUFFICIENT_EVIDENCE_ANSWER,
  normalizeContextTopK,
  normalizeContextTokenBudget,
  RagError,
  RAG_RERANK_CANDIDATE_K,
  RAG_RETRIEVAL_CANDIDATE_K,
  validateGrounding,
  validateRagQuery,
  type ContextBuilderPort,
  type LlmProviderPort,
  type RagPromptBuilder,
  type RagQueryRequest,
  type RagQueryResponse,
} from '../domain/rag.port';
import { RerankedSearchError } from '../domain/reranked-search.port';

export interface RagQueryServiceDeps {
  authorization: AuthorizationService;
  rerankedSearch: RerankedSearchApplicationService;
  contextBuilder: ContextBuilderPort;
  promptBuilder: RagPromptBuilder;
  llmProvider: LlmProviderPort;
}

export class RagQueryApplicationService {
  constructor(private readonly deps: RagQueryServiceDeps) {}

  async search(userId: string, spaceId: string, input: RagQueryRequest): Promise<RagQueryResponse> {
    const startedAt = Date.now();
    await this.deps.authorization.assertSpaceOwner(userId, spaceId);

    const query = validateRagQuery(input.query);
    const contextTopK = normalizeContextTopK(input.contextTopK, RAG_RERANK_CANDIDATE_K);
    const contextTokenBudget = normalizeContextTokenBudget(input.contextTokenBudget);
    const llmIdentity = this.deps.llmProvider.identity();

    let retrieval;
    try {
      retrieval = await this.deps.rerankedSearch.search(userId, spaceId, {
        query,
        topK: RAG_RERANK_CANDIDATE_K,
        retrievalCandidateK: RAG_RETRIEVAL_CANDIDATE_K,
        rerankCandidateK: RAG_RERANK_CANDIDATE_K,
        threshold: 0.3,
        versionId: input.versionId,
      });
    } catch (error) {
      if (error instanceof RagError || error instanceof RerankedSearchError) {
        throw error;
      }
      throw new RagError('RERANKER_PROVIDER_ERROR', 'retrieval failed', 500);
    }

    const candidates = retrieval.items;
    const built = this.deps.contextBuilder.build(candidates, {
      contextTopK,
      contextTokenBudget,
    });

    if (built.items.length === 0) {
      // Empty context: do not call LLM (grounded-only, no general knowledge fallback).
      console.log(
        JSON.stringify({
          event: 'rag_query_stats',
          spaceId,
          versionId: retrieval.versionId,
          retrievalCandidateCount: candidates.length,
          rerankCandidateCount: candidates.length,
          contextItemCount: 0,
          estimatedContextTokens: 0,
          contextTokenBudget,
          llmProvider: llmIdentity.provider,
          llmModel: llmIdentity.model,
          answerLength: INSUFFICIENT_EVIDENCE_ANSWER.length,
          citationCount: 0,
          durationMs: Date.now() - startedAt,
        }),
      );
      return {
        knowledgeSpaceId: spaceId,
        versionId: retrieval.versionId,
        query,
        answer: INSUFFICIENT_EVIDENCE_ANSWER,
        citations: [],
        context: { itemCount: 0, estimatedTokens: 0 },
        model: { provider: llmIdentity.provider, model: llmIdentity.model },
      };
    }

    const prompt = this.deps.promptBuilder.build({ query, context: built.items });

    let answer: string;
    try {
      const generated = await this.deps.llmProvider.generate({
        systemPrompt: prompt.systemPrompt,
        userQuery: prompt.userQuery,
        context: built.items,
      });
      answer = generated.answer;
    } catch (error) {
      if (error instanceof RagError) {
        throw error;
      }
      throw new RagError('LLM_PROVIDER_ERROR', 'llm provider failed', 500);
    }

    if (!answer || answer.trim().length === 0) {
      throw new RagError('LLM_EMPTY_RESPONSE', 'LLM returned empty answer', 500);
    }

    try {
      validateGrounding(answer, built.items);
    } catch (error) {
      if (error instanceof RagError) {
        throw error;
      }
      throw new RagError(
        'GROUNDED_RESPONSE_VALIDATION_FAILED',
        'grounded response validation failed',
        500,
      );
    }

    console.log(
      JSON.stringify({
        event: 'rag_query_stats',
        spaceId,
        versionId: retrieval.versionId,
        retrievalCandidateCount: candidates.length,
        rerankCandidateCount: candidates.length,
        contextItemCount: built.itemCount,
        estimatedContextTokens: built.estimatedTokens,
        contextTokenBudget,
        llmProvider: llmIdentity.provider,
        llmModel: llmIdentity.model,
        answerLength: answer.length,
        citationCount: contextItemsToCitations(built.items).length,
        durationMs: Date.now() - startedAt,
      }),
    );

    return {
      knowledgeSpaceId: spaceId,
      versionId: retrieval.versionId,
      query,
      answer,
      citations: contextItemsToCitations(built.items),
      context: {
        itemCount: built.itemCount,
        estimatedTokens: built.estimatedTokens,
      },
      model: { provider: llmIdentity.provider, model: llmIdentity.model },
    };
  }
}
