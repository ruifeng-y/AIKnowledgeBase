import { Module } from '@nestjs/common';
import type { EmbeddingProviderPort } from '@akb/ai';
import { loadEmbeddingConfig, MockEmbeddingProvider } from '@akb/ai';
import { AppConfigModule } from '../../common/config/app-config.module';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VectorSearchApplicationService } from './application/vector-search.application.service';
import { HybridSearchApplicationService } from './application/hybrid-search.application.service';
import { RerankedSearchApplicationService } from './application/reranked-search.application.service';
import { RagQueryApplicationService } from './application/rag-query.application.service';
import {
  EMBEDDING_PROVIDER,
  VECTOR_SEARCH_REPOSITORY,
  type VectorSearchRepositoryPort,
} from './domain/vector-search.port';
import {
  LEXICAL_SEARCH_REPOSITORY,
  type LexicalSearchRepositoryPort,
} from './domain/lexical-search.port';
import {
  RETRIEVAL_RERANKER_PROVIDER,
  loadRerankerIdentity,
  type RerankerProviderPort,
} from './domain/reranker.port';
import {
  CONTEXT_BUILDER,
  DefaultContextBuilder,
  DefaultRagPromptBuilder,
  RETRIEVAL_LLM_PROVIDER,
  RAG_PROMPT_BUILDER,
  type ContextBuilderPort,
  type LlmProviderPort,
  type RagPromptBuilder,
} from './domain/rag.port';
import { VectorSearchController } from './presentation/vector-search.controller';
import { HybridSearchController } from './presentation/hybrid-search.controller';
import { RerankedSearchController } from './presentation/reranked-search.controller';
import { RagQueryController } from './presentation/rag-query.controller';
import { PgVectorSearchRepository } from '../../infrastructure/retrieval/pgvector-search.repository';
import { PgLexicalSearchRepository } from '../../infrastructure/retrieval/pg-lexical-search.repository';
import { InfraMockRerankerProvider } from '../../infrastructure/retrieval/mock-reranker.provider';
import {
  loadLlmIdentity,
  loadMockLlmMode,
  MockLlmProvider,
} from '../../infrastructure/llm/mock-llm.provider';

@Module({
  imports: [AppConfigModule, WorkspacesModule],
  controllers: [
    VectorSearchController,
    HybridSearchController,
    RerankedSearchController,
    RagQueryController,
  ],
  providers: [
    { provide: VECTOR_SEARCH_REPOSITORY, useClass: PgVectorSearchRepository },
    { provide: LEXICAL_SEARCH_REPOSITORY, useClass: PgLexicalSearchRepository },
    { provide: CONTEXT_BUILDER, useClass: DefaultContextBuilder },
    { provide: RAG_PROMPT_BUILDER, useClass: DefaultRagPromptBuilder },
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (): EmbeddingProviderPort => {
        const config = loadEmbeddingConfig(process.env);
        return new MockEmbeddingProvider(config);
      },
    },
    {
      provide: RETRIEVAL_RERANKER_PROVIDER,
      useFactory: (): RerankerProviderPort => {
        return new InfraMockRerankerProvider(loadRerankerIdentity(process.env));
      },
    },
    {
      provide: RETRIEVAL_LLM_PROVIDER,
      useFactory: (): LlmProviderPort => {
        return new MockLlmProvider(loadLlmIdentity(process.env), loadMockLlmMode(process.env));
      },
    },
    {
      provide: VectorSearchApplicationService,
      useFactory: (
        authorization: AuthorizationService,
        vectorSearch: VectorSearchRepositoryPort,
        embeddingProvider: EmbeddingProviderPort,
      ) =>
        new VectorSearchApplicationService({
          authorization,
          vectorSearch,
          embeddingProvider,
        }),
      inject: [AuthorizationService, VECTOR_SEARCH_REPOSITORY, EMBEDDING_PROVIDER],
    },
    {
      provide: HybridSearchApplicationService,
      useFactory: (
        authorization: AuthorizationService,
        vectorSearch: VectorSearchRepositoryPort,
        lexicalSearch: LexicalSearchRepositoryPort,
        embeddingProvider: EmbeddingProviderPort,
      ) =>
        new HybridSearchApplicationService({
          authorization,
          vectorSearch,
          lexicalSearch,
          embeddingProvider,
        }),
      inject: [
        AuthorizationService,
        VECTOR_SEARCH_REPOSITORY,
        LEXICAL_SEARCH_REPOSITORY,
        EMBEDDING_PROVIDER,
      ],
    },
    {
      provide: RerankedSearchApplicationService,
      useFactory: (
        authorization: AuthorizationService,
        vectorSearch: VectorSearchRepositoryPort,
        lexicalSearch: LexicalSearchRepositoryPort,
        embeddingProvider: EmbeddingProviderPort,
        rerankerProvider: RerankerProviderPort,
      ) =>
        new RerankedSearchApplicationService({
          authorization,
          vectorSearch,
          lexicalSearch,
          embeddingProvider,
          rerankerProvider,
        }),
      inject: [
        AuthorizationService,
        VECTOR_SEARCH_REPOSITORY,
        LEXICAL_SEARCH_REPOSITORY,
        EMBEDDING_PROVIDER,
        RETRIEVAL_RERANKER_PROVIDER,
      ],
    },
    {
      provide: RagQueryApplicationService,
      useFactory: (
        authorization: AuthorizationService,
        rerankedSearch: RerankedSearchApplicationService,
        contextBuilder: ContextBuilderPort,
        promptBuilder: RagPromptBuilder,
        llmProvider: LlmProviderPort,
      ) =>
        new RagQueryApplicationService({
          authorization,
          rerankedSearch,
          contextBuilder,
          promptBuilder,
          llmProvider,
        }),
      inject: [
        AuthorizationService,
        RerankedSearchApplicationService,
        CONTEXT_BUILDER,
        RAG_PROMPT_BUILDER,
        RETRIEVAL_LLM_PROVIDER,
      ],
    },
  ],
  exports: [
    VectorSearchApplicationService,
    HybridSearchApplicationService,
    RerankedSearchApplicationService,
    RagQueryApplicationService,
  ],
})
export class RetrievalModule {}
