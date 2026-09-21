import { Module } from '@nestjs/common';
import type { EmbeddingProviderPort } from '@akb/ai';
import { loadEmbeddingConfig, MockEmbeddingProvider } from '@akb/ai';
import { AppConfigModule } from '../../common/config/app-config.module';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VectorSearchApplicationService } from './application/vector-search.application.service';
import { HybridSearchApplicationService } from './application/hybrid-search.application.service';
import {
  EMBEDDING_PROVIDER,
  VECTOR_SEARCH_REPOSITORY,
  type VectorSearchRepositoryPort,
} from './domain/vector-search.port';
import {
  LEXICAL_SEARCH_REPOSITORY,
  type LexicalSearchRepositoryPort,
} from './domain/lexical-search.port';
import { VectorSearchController } from './presentation/vector-search.controller';
import { HybridSearchController } from './presentation/hybrid-search.controller';
import { PgVectorSearchRepository } from '../../infrastructure/retrieval/pgvector-search.repository';
import { PgLexicalSearchRepository } from '../../infrastructure/retrieval/pg-lexical-search.repository';

@Module({
  imports: [AppConfigModule, WorkspacesModule],
  controllers: [VectorSearchController, HybridSearchController],
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
  ],
  exports: [VectorSearchApplicationService, HybridSearchApplicationService],
})
export class RetrievalModule {}
