import { Injectable } from '@nestjs/common';
import { knowledgeSpaceRepository, prisma } from '@akb/db';
import type {
  CreateKnowledgeSpaceInput,
  KnowledgeSpaceRecord,
  KnowledgeSpaceRepositoryPort,
  UpdateKnowledgeSpaceInput,
} from '../../modules/knowledge-spaces/domain/knowledge-space-repository.port';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapSpace(row: {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeSpaceRecord {
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

@Injectable()
export class KnowledgeSpaceRepositoryAdapter implements KnowledgeSpaceRepositoryPort {
  async create(
    workspaceId: string,
    input: CreateKnowledgeSpaceInput,
  ): Promise<KnowledgeSpaceRecord> {
    const row = await knowledgeSpaceRepository.create({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      workspace: { connect: { id: workspaceId } },
    });
    return mapSpace(row);
  }

  async findByWorkspaceId(workspaceId: string): Promise<KnowledgeSpaceRecord[]> {
    const rows = await knowledgeSpaceRepository.listByWorkspaceId(workspaceId);
    return rows.map(mapSpace);
  }

  async findOwnedById(spaceId: string, ownerId: string): Promise<KnowledgeSpaceRecord | null> {
    const row = await prisma.knowledgeSpace.findFirst({
      where: { id: spaceId, workspace: { ownerId } },
    });
    return row ? mapSpace(row) : null;
  }

  async findByWorkspaceIdAndSlug(
    workspaceId: string,
    slug: string,
  ): Promise<KnowledgeSpaceRecord | null> {
    const row = await knowledgeSpaceRepository.findByWorkspaceIdAndSlug(workspaceId, slug);
    return row ? mapSpace(row) : null;
  }

  async updateOwned(
    spaceId: string,
    ownerId: string,
    input: UpdateKnowledgeSpaceInput,
  ): Promise<KnowledgeSpaceRecord> {
    const owned = await this.findOwnedById(spaceId, ownerId);
    if (!owned) {
      throw new Error('Ownership mismatch');
    }
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      data['name'] = input.name;
    }
    if (input.slug !== undefined) {
      data['slug'] = input.slug;
    }
    if (input.description !== undefined) {
      data['description'] = input.description;
    }
    if (input.settings !== undefined) {
      data['settings'] = input.settings;
    }
    const row = await prisma.knowledgeSpace.update({
      where: { id: spaceId },
      data,
    });
    return mapSpace(row);
  }

  async deleteOwned(spaceId: string, ownerId: string): Promise<void> {
    await prisma.knowledgeSpace.deleteMany({
      where: { id: spaceId, workspace: { ownerId } },
    });
  }
}
