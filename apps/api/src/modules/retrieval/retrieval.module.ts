import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/app-config.module';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { VectorSearchApplicationService } from './application/vector-search.application.service';
import { VECTOR_SEARCH_REPOSITORY } from './domain/vector-search.port';
import { VectorSearchController } from './presentation/vector-search.controller';
import { PgVectorSearchRepository } from '../../infrastructure/retrieval/pgvector-search.repository';

@Module({
  imports: [AppConfigModule, WorkspacesModule],
  controllers: [VectorSearchController],
  providers: [
    { provide: VECTOR_SEARCH_REPOSITORY, useClass: PgVectorSearchRepository },
    {
      provide: VectorSearchApplicationService,
      useFactory: (authorization: AuthorizationService, vectorSearch: PgVectorSearchRepository) =>
        VectorSearchApplicationService.createDefault(authorization, vectorSearch),
      inject: [AuthorizationService, VECTOR_SEARCH_REPOSITORY],
    },
  ],
  exports: [VectorSearchApplicationService],
})
export class RetrievalModule {}
