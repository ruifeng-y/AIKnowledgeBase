import { Module } from '@nestjs/common';
import type { EmbeddingProviderPort } from '@akb/ai';
import { loadEmbeddingConfig, MockEmbeddingProvider } from '@akb/ai';
import { AppConfigModule } from '../../common/config/app-config.module';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VectorSearchApplicationService } from './application/vector-search.application.service';
import { HybridSearchApplicationService } from './application/hybrid-search.application.service';
import { RerankedSearchApplicationService } from './application/reranked-search.application.service';
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
import { VectorSearchController } from './presentation/vector-search.controller';
import { HybridSearchController } from './presentation/hybrid-search.controller';
import { RerankedSearchController } from './presentation/reranked-search.controller';
import { PgVectorSearchRepository } from '../../infrastructure/retrieval/pgvector-search.repository';
import { PgLexicalSearchRepository } from '../../infrastructure/retrieval/pg-lexical-search.repository';
import { InfraMockRerankerProvider } from '../../infrastructure/retrieval/mock-reranker.provider';

@Module({
  imports: [AppConfigModule, WorkspacesModule],
  controllers: [VectorSearchController, HybridSearchController, RerankedSearchController],
  providers: [
    { provide: VECTOR_SEARCH_REPOSITORY, useClass: PgVectorSearchRepository },
    { provide: LEXICAL_SEARCH_REPOSITORY, useClass: PgLexicalSearchRepository },
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
  ],
  exports: [
    VectorSearchApplicationService,
    HybridSearchApplicationService,
    RerankedSearchApplicationService,
  ],
})
export class RetrievalModule {}
