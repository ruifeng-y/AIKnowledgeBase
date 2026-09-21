import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/app-config.module';
import { DocumentPolicyProvider } from '../../common/config/document-policy';
import { DocumentRepositoryAdapter } from '../../infrastructure/database/document.repository.adapter';
import { KnowledgeSpaceRepositoryAdapter } from '../../infrastructure/database/knowledge-space.repository.adapter';
import { WorkspaceRepositoryAdapter } from '../../infrastructure/database/workspace.repository.adapter';
import { OBJECT_STORAGE } from '../../infrastructure/storage/object-storage.port';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { JOB_QUEUE } from '../../infrastructure/queue/job-queue.port';
import type { JobQueuePort } from '../../infrastructure/queue/job-queue.port';
import { KNOWLEDGE_SPACE_REPOSITORY } from '../knowledge-spaces/domain/knowledge-space-repository.port';
import { AuthorizationService } from '../shared/application/authorization.service';
import { WORKSPACE_REPOSITORY } from '../workspaces/domain/workspace-repository.port';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DOCUMENT_REPOSITORY } from './domain/document-repository.port';
import { DocumentApplicationService } from './application/documents.application.service';
import { DocumentProcessingApplicationService } from './application/document-processing.application.service';
import { DocumentsController, SpaceDocumentsController } from './presentation/documents.controller';
import { DocumentProcessingController } from './presentation/document-processing.controller';
import { DocumentChunksController } from './presentation/document-chunks.controller';
import { DocumentChunksApplicationService } from './application/document-chunks.application.service';
import { KNOWLEDGE_CHUNK_REPOSITORY } from './domain/knowledge-chunk.repository.port';
import { KnowledgeChunkRepositoryAdapter } from '../../infrastructure/database/knowledge-chunk.repository.adapter';
import type { KnowledgeChunkRepositoryPort } from './domain/knowledge-chunk.repository.port';
import { PROCESSING_JOB_REPOSITORY } from './domain/processing-job.repository.port';
import { ProcessingJobRepositoryAdapter } from '../../infrastructure/database/processing-job.repository.adapter';
import type { ObjectStoragePort } from '../../infrastructure/storage/object-storage.port';
import type { ProcessingJobRepositoryPort } from './domain/processing-job.repository.port';

@Module({
  imports: [AppConfigModule, StorageModule, QueueModule, WorkspacesModule],
  controllers: [
    SpaceDocumentsController,
    DocumentsController,
    DocumentProcessingController,
    DocumentChunksController,
  ],
  providers: [
    DocumentPolicyProvider,
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentRepositoryAdapter },
    { provide: KNOWLEDGE_SPACE_REPOSITORY, useClass: KnowledgeSpaceRepositoryAdapter },
    { provide: WORKSPACE_REPOSITORY, useClass: WorkspaceRepositoryAdapter },
    { provide: PROCESSING_JOB_REPOSITORY, useClass: ProcessingJobRepositoryAdapter },
    { provide: KNOWLEDGE_CHUNK_REPOSITORY, useClass: KnowledgeChunkRepositoryAdapter },
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
    {
      provide: DocumentProcessingApplicationService,
      useFactory: (
        authorization: AuthorizationService,
        queue: JobQueuePort,
        jobs: ProcessingJobRepositoryPort,
      ) => new DocumentProcessingApplicationService(authorization, queue, jobs),
      inject: [AuthorizationService, JOB_QUEUE, PROCESSING_JOB_REPOSITORY],
    },
    {
      provide: DocumentChunksApplicationService,
      useFactory: (
        authorization: AuthorizationService,
        chunks: KnowledgeChunkRepositoryPort,
        documents: DocumentRepositoryAdapter,
      ) =>
        new DocumentChunksApplicationService(authorization, chunks, {
          findVersionById: (versionId) => documents.findVersionById(versionId),
        }),
      inject: [AuthorizationService, KNOWLEDGE_CHUNK_REPOSITORY, DOCUMENT_REPOSITORY],
    },
  ],
  exports: [
    DocumentApplicationService,
    AuthorizationService,
    DocumentProcessingApplicationService,
    DocumentChunksApplicationService,
  ],
})
export class DocumentsModule {}
