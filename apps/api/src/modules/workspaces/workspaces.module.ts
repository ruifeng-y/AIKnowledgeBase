import { Module } from '@nestjs/common';
import { WorkspaceRepositoryAdapter } from '../../infrastructure/database/workspace.repository.adapter';
import { KnowledgeSpaceRepositoryAdapter } from '../../infrastructure/database/knowledge-space.repository.adapter';
import { KNOWLEDGE_SPACE_REPOSITORY } from '../knowledge-spaces/domain/knowledge-space-repository.port';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WORKSPACE_REPOSITORY } from './domain/workspace-repository.port';
import { WorkspaceApplicationService } from './application/workspaces.application.service';
import { WorkspacesController } from './presentation/workspaces.controller';

export const AUTHORIZATION_SERVICE = AuthorizationService;

@Module({
  controllers: [WorkspacesController],
  providers: [
    { provide: WORKSPACE_REPOSITORY, useClass: WorkspaceRepositoryAdapter },
    { provide: KNOWLEDGE_SPACE_REPOSITORY, useClass: KnowledgeSpaceRepositoryAdapter },
    {
      provide: AuthorizationService,
      useFactory: (
        workspaces: WorkspaceRepositoryAdapter,
        spaces: KnowledgeSpaceRepositoryAdapter,
      ) => new AuthorizationService(workspaces, spaces),
      inject: [WORKSPACE_REPOSITORY, KNOWLEDGE_SPACE_REPOSITORY],
    },
    {
      provide: WorkspaceApplicationService,
      useFactory: (workspaces: WorkspaceRepositoryAdapter, authorization: AuthorizationService) =>
        new WorkspaceApplicationService(workspaces, authorization),
      inject: [WORKSPACE_REPOSITORY, AuthorizationService],
    },
  ],
  exports: [
    AuthorizationService,
    WORKSPACE_REPOSITORY,
    KNOWLEDGE_SPACE_REPOSITORY,
    WorkspaceApplicationService,
  ],
})
export class WorkspacesModule {}
