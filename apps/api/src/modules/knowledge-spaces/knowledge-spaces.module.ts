import { Module } from '@nestjs/common';
import { KnowledgeSpaceRepositoryAdapter } from '../../infrastructure/database/knowledge-space.repository.adapter';
import { WorkspaceRepositoryAdapter } from '../../infrastructure/database/workspace.repository.adapter';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WORKSPACE_REPOSITORY } from '../workspaces/domain/workspace-repository.port';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { KNOWLEDGE_SPACE_REPOSITORY } from './domain/knowledge-space-repository.port';
import { KnowledgeSpaceApplicationService } from './application/knowledge-spaces.application.service';
import {
  SpacesController,
  WorkspaceSpacesController,
} from './presentation/knowledge-spaces.controller';

@Module({
  imports: [WorkspacesModule],
  controllers: [WorkspaceSpacesController, SpacesController],
  providers: [
    { provide: KNOWLEDGE_SPACE_REPOSITORY, useClass: KnowledgeSpaceRepositoryAdapter },
    { provide: WORKSPACE_REPOSITORY, useClass: WorkspaceRepositoryAdapter },
    {
      provide: AuthorizationService,
      useFactory: (
        workspaces: WorkspaceRepositoryAdapter,
        spaces: KnowledgeSpaceRepositoryAdapter,
      ) => new AuthorizationService(workspaces, spaces),
      inject: [WORKSPACE_REPOSITORY, KNOWLEDGE_SPACE_REPOSITORY],
    },
    {
      provide: KnowledgeSpaceApplicationService,
      useFactory: (spaces: KnowledgeSpaceRepositoryAdapter, authorization: AuthorizationService) =>
        new KnowledgeSpaceApplicationService(spaces, authorization),
      inject: [KNOWLEDGE_SPACE_REPOSITORY, AuthorizationService],
    },
  ],
  exports: [KnowledgeSpaceApplicationService],
})
export class KnowledgeSpacesModule {}
