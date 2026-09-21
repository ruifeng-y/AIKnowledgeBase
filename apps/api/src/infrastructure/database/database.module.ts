import { Module } from '@nestjs/common';
import { AUTH_REPOSITORY } from '../../modules/auth/domain/auth-repository.port';
import { DOCUMENT_REPOSITORY } from '../../modules/documents/domain/document-repository.port';
import { KNOWLEDGE_SPACE_REPOSITORY } from '../../modules/knowledge-spaces/domain/knowledge-space-repository.port';
import { USER_REPOSITORY } from '../../modules/users/domain/user-repository.port';
import { WORKSPACE_REPOSITORY } from '../../modules/workspaces/domain/workspace-repository.port';
import { repositoryAdapters } from './prisma-repository.adapters';
import { TRANSACTION_MANAGER } from './transaction-manager.port';

/**
 * Database access boundary.
 * Uses @akb/db repositories/Prisma client under the hood.
 * Application/presentation layers must depend on domain ports only.
 */
@Module({
  providers: [...repositoryAdapters],
  exports: [
    USER_REPOSITORY,
    WORKSPACE_REPOSITORY,
    KNOWLEDGE_SPACE_REPOSITORY,
    DOCUMENT_REPOSITORY,
    AUTH_REPOSITORY,
    TRANSACTION_MANAGER,
  ],
})
export class DatabaseModule {}
