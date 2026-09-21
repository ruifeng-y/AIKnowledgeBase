import { Injectable } from '@nestjs/common';
import { prisma, workspaceRepository } from '@akb/db';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceRecord,
  WorkspaceRepositoryPort,
} from '../../modules/workspaces/domain/workspace-repository.port';

function mapWorkspace(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}): WorkspaceRecord {
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

@Injectable()
export class WorkspaceRepositoryAdapter implements WorkspaceRepositoryPort {
  async create(ownerId: string, input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    const row = await workspaceRepository.create({
      name: input.name,
      slug: input.slug,
      owner: { connect: { id: ownerId } },
    });
    return mapWorkspace(row);
  }

  async findByOwnerId(ownerId: string): Promise<WorkspaceRecord[]> {
    const rows = await workspaceRepository.findByOwnerId(ownerId);
    return rows.map(mapWorkspace);
  }

  async findOwnedById(workspaceId: string, ownerId: string): Promise<WorkspaceRecord | null> {
    const row = await prisma.workspace.findFirst({
      where: { id: workspaceId, ownerId },
    });
    return row ? mapWorkspace(row) : null;
  }

  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const row = await workspaceRepository.findBySlug(slug);
    return row ? mapWorkspace(row) : null;
  }

  async updateOwned(
    workspaceId: string,
    ownerId: string,
    input: UpdateWorkspaceInput,
  ): Promise<WorkspaceRecord> {
    const row = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
      },
    });
    if (row.ownerId !== ownerId) {
      throw new Error('Ownership mismatch');
    }
    return mapWorkspace(row);
  }

  async deleteOwned(workspaceId: string, ownerId: string): Promise<void> {
    await prisma.workspace.deleteMany({
      where: { id: workspaceId, ownerId },
    });
  }
}
