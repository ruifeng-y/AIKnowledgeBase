import { Injectable } from '@nestjs/common';
import {
  documentRepository,
  knowledgeSpaceRepository,
  prisma,
  userRepository,
  workspaceRepository,
} from '@akb/db';
import type { AuthRepositoryPort } from '../../modules/auth/domain/auth-repository.port';
import { AUTH_REPOSITORY } from '../../modules/auth/domain/auth-repository.port';
import type {
  DocumentRecord,
  DocumentRepositoryPort,
} from '../../modules/documents/domain/document-repository.port';
import { DOCUMENT_REPOSITORY } from '../../modules/documents/domain/document-repository.port';
import type {
  KnowledgeSpaceRecord,
  KnowledgeSpaceRepositoryPort,
} from '../../modules/knowledge-spaces/domain/knowledge-space-repository.port';
import { KNOWLEDGE_SPACE_REPOSITORY } from '../../modules/knowledge-spaces/domain/knowledge-space-repository.port';
import type {
  UserRecord,
  UserRepositoryPort,
} from '../../modules/users/domain/user-repository.port';
import { USER_REPOSITORY } from '../../modules/users/domain/user-repository.port';
import type {
  WorkspaceRecord,
  WorkspaceRepositoryPort,
} from '../../modules/workspaces/domain/workspace-repository.port';
import { WORKSPACE_REPOSITORY } from '../../modules/workspaces/domain/workspace-repository.port';
import { TRANSACTION_MANAGER, type TransactionManagerPort } from './transaction-manager.port';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapUser(row: Awaited<ReturnType<typeof userRepository.findById>>): UserRecord | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    avatarUrl: row.avatarUrl,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWorkspace(
  row: Awaited<ReturnType<typeof workspaceRepository.findById>>,
): WorkspaceRecord | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapKnowledgeSpace(
  row: Awaited<ReturnType<typeof knowledgeSpaceRepository.findById>>,
): KnowledgeSpaceRecord | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    settings: asRecord(row.settings),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDocument(
  row: Awaited<ReturnType<typeof documentRepository.findById>>,
): DocumentRecord | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    knowledgeSpaceId: row.knowledgeSpaceId,
    title: row.title,
    sourceType: row.sourceType,
    sourceUri: row.sourceUri,
    mimeType: row.mimeType,
    status: row.status,
    currentVersionId: row.currentVersionId,
    metadata: asRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaUserRepositoryAdapter implements UserRepositoryPort {
  async findById(id: string): Promise<UserRecord | null> {
    return mapUser(await userRepository.findById(id));
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return mapUser(await userRepository.findByEmail(email));
  }
}

@Injectable()
export class PrismaWorkspaceRepositoryAdapter implements WorkspaceRepositoryPort {
  async findById(id: string): Promise<WorkspaceRecord | null> {
    return mapWorkspace(await workspaceRepository.findById(id));
  }

  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    return mapWorkspace(await workspaceRepository.findBySlug(slug));
  }

  async listByOwnerId(ownerId: string): Promise<WorkspaceRecord[]> {
    const rows = await workspaceRepository.findByOwnerId(ownerId);
    return rows
      .map((row) => mapWorkspace(row))
      .filter((row): row is WorkspaceRecord => row !== null);
  }
}

@Injectable()
export class PrismaKnowledgeSpaceRepositoryAdapter implements KnowledgeSpaceRepositoryPort {
  async findById(id: string): Promise<KnowledgeSpaceRecord | null> {
    return mapKnowledgeSpace(await knowledgeSpaceRepository.findById(id));
  }

  async findByWorkspaceIdAndSlug(
    workspaceId: string,
    slug: string,
  ): Promise<KnowledgeSpaceRecord | null> {
    return mapKnowledgeSpace(
      await knowledgeSpaceRepository.findByWorkspaceIdAndSlug(workspaceId, slug),
    );
  }

  async listByWorkspaceId(workspaceId: string): Promise<KnowledgeSpaceRecord[]> {
    const rows = await knowledgeSpaceRepository.listByWorkspaceId(workspaceId);
    return rows
      .map((row) => mapKnowledgeSpace(row))
      .filter((row): row is KnowledgeSpaceRecord => row !== null);
  }
}

@Injectable()
export class PrismaDocumentRepositoryAdapter implements DocumentRepositoryPort {
  async findById(id: string): Promise<DocumentRecord | null> {
    return mapDocument(await documentRepository.findById(id));
  }

  async listByKnowledgeSpaceId(knowledgeSpaceId: string): Promise<DocumentRecord[]> {
    const rows = await documentRepository.listByKnowledgeSpaceId(knowledgeSpaceId);
    return rows.map((row) => mapDocument(row)).filter((row): row is DocumentRecord => row !== null);
  }
}

@Injectable()
export class PrismaAuthRepositoryAdapter implements AuthRepositoryPort {
  async emailExists(email: string): Promise<boolean> {
    const user = await userRepository.findByEmail(email);
    return user !== null;
  }
}

@Injectable()
export class PrismaTransactionManager implements TransactionManagerPort {
  async run<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => fn(tx));
  }
}

export const repositoryAdapters = [
  { provide: USER_REPOSITORY, useClass: PrismaUserRepositoryAdapter },
  { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepositoryAdapter },
  { provide: KNOWLEDGE_SPACE_REPOSITORY, useClass: PrismaKnowledgeSpaceRepositoryAdapter },
  { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepositoryAdapter },
  { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepositoryAdapter },
  { provide: TRANSACTION_MANAGER, useClass: PrismaTransactionManager },
];
