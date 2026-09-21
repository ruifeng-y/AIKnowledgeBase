import { Module } from '@nestjs/common';
import type { EmbeddingProviderPort } from '@akb/ai';
import { loadEmbeddingConfig, MockEmbeddingProvider } from '@akb/ai';
import { AppConfigModule } from '../../common/config/app-config.module';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VectorSearchApplicationService } from './application/vector-search.application.service';
import {
  EMBEDDING_PROVIDER,
  VECTOR_SEARCH_REPOSITORY,
  type VectorSearchRepositoryPort,
} from './domain/vector-search.port';
import { VectorSearchController } from './presentation/vector-search.controller';
import { PgVectorSearchRepository } from '../../infrastructure/retrieval/pgvector-search.repository';

@Module({
  imports: [AppConfigModule, WorkspacesModule],
  controllers: [VectorSearchController],
  providers: [
    { provide: VECTOR_SEARCH_REPOSITORY, useClass: PgVectorSearchRepository },
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
  ],
  exports: [VectorSearchApplicationService],
})
export class RetrievalModule {}
