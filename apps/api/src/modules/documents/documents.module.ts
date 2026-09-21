import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/app-config.module';
import { DocumentPolicyProvider } from '../../common/config/document-policy';
import { DocumentRepositoryAdapter } from '../../infrastructure/database/document.repository.adapter';
import { KnowledgeSpaceRepositoryAdapter } from '../../infrastructure/database/knowledge-space.repository.adapter';
import { WorkspaceRepositoryAdapter } from '../../infrastructure/database/workspace.repository.adapter';
import { OBJECT_STORAGE } from '../../infrastructure/storage/object-storage.port';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { KNOWLEDGE_SPACE_REPOSITORY } from '../knowledge-spaces/domain/knowledge-space-repository.port';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WORKSPACE_REPOSITORY } from '../workspaces/domain/workspace-repository.port';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DOCUMENT_REPOSITORY } from './domain/document-repository.port';
import { DocumentApplicationService } from './application/documents.application.service';
import { DocumentsController, SpaceDocumentsController } from './presentation/documents.controller';
import type { ObjectStoragePort } from '../../infrastructure/storage/object-storage.port';

@Module({
  imports: [AppConfigModule, StorageModule, WorkspacesModule],
  controllers: [SpaceDocumentsController, DocumentsController],
  providers: [
    DocumentPolicyProvider,
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentRepositoryAdapter },
    { provide: KNOWLEDGE_SPACE_REPOSITORY, useClass: KnowledgeSpaceRepositoryAdapter },
    { provide: WORKSPACE_REPOSITORY, useClass: WorkspaceRepositoryAdapter },
    {
      provide: AuthorizationService,
      useFactory: (
        workspaces: WorkspaceRepositoryAdapter,
        spaces: KnowledgeSpaceRepositoryAdapter,
        documents: DocumentRepositoryAdapter,
      ) => new AuthorizationService(workspaces, spaces, documents),
      inject: [WORKSPACE_REPOSITORY, KNOWLEDGE_SPACE_REPOSITORY, DOCUMENT_REPOSITORY],
    },
    {
      provide: DocumentApplicationService,
      useFactory: (
        documents: DocumentRepositoryAdapter,
        authorization: AuthorizationService,
        storage: ObjectStoragePort,
        policy: DocumentPolicyProvider,
      ) => new DocumentApplicationService(documents, authorization, storage, policy.get()),
      inject: [DOCUMENT_REPOSITORY, AuthorizationService, OBJECT_STORAGE, DocumentPolicyProvider],
    },
  ],
  exports: [DocumentApplicationService, AuthorizationService],
})
export class DocumentsModule {}
