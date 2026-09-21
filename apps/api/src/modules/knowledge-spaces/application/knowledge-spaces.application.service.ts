import type {
  CreateKnowledgeSpaceInput,
  KnowledgeSpaceRepositoryPort,
  KnowledgeSpaceRecord,
  UpdateKnowledgeSpaceInput,
} from '../domain/knowledge-space-repository.port';
import { knowledgeSpaceSlugExists, ValidationError } from '../../../common/errors/app-errors';
import { AuthorizationService } from '../../shared/application/authorization.service';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class KnowledgeSpaceApplicationService {
  constructor(
    private readonly spaces: KnowledgeSpaceRepositoryPort,
    private readonly authorization: AuthorizationService,
  ) {}

  private validateCreate(input: CreateKnowledgeSpaceInput): void {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    const description = input.description?.trim() ?? '';
    if (name.length < 1 || name.length > 100) {
      throw new ValidationError('Knowledge space name must be 1-100 characters');
    }
    if (slug.length < 3 || slug.length > 80 || !SLUG_RE.test(slug)) {
      throw new ValidationError('Knowledge space slug is invalid');
    }
    if (description.length > 1000) {
      throw new ValidationError('Description must be at most 1000 characters');
    }
  }

  async create(
    userId: string,
    workspaceId: string,
    input: CreateKnowledgeSpaceInput,
  ): Promise<KnowledgeSpaceRecord> {
    await this.authorization.assertWorkspaceOwner(userId, workspaceId);
    this.validateCreate(input);
    const slug = input.slug.trim().toLowerCase();
    const existing = await this.spaces.findByWorkspaceIdAndSlug(workspaceId, slug);
    if (existing) {
      throw knowledgeSpaceSlugExists();
    }
    return this.spaces.create(workspaceId, {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() ?? null,
    });
  }

  async listInWorkspace(userId: string, workspaceId: string): Promise<KnowledgeSpaceRecord[]> {
    await this.authorization.assertWorkspaceOwner(userId, workspaceId);
    return this.spaces.findByWorkspaceId(workspaceId);
  }

  async getOwned(userId: string, spaceId: string): Promise<KnowledgeSpaceRecord> {
    return this.authorization.assertSpaceOwner(userId, spaceId);
  }

  async updateOwned(
    userId: string,
    spaceId: string,
    input: UpdateKnowledgeSpaceInput,
  ): Promise<KnowledgeSpaceRecord> {
    const current = await this.authorization.assertSpaceOwner(userId, spaceId);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 100) {
        throw new ValidationError('Knowledge space name must be 1-100 characters');
      }
    }
    if (input.slug !== undefined) {
      const slug = input.slug.trim().toLowerCase();
      if (slug.length < 3 || slug.length > 80 || !SLUG_RE.test(slug)) {
        throw new ValidationError('Knowledge space slug is invalid');
      }
      const existing = await this.spaces.findByWorkspaceIdAndSlug(current.workspaceId, slug);
      if (existing && existing.id !== spaceId) {
        throw knowledgeSpaceSlugExists();
      }
    }
    if (input.description !== undefined && input.description !== null) {
      if (input.description.length > 1000) {
        throw new ValidationError('Description must be at most 1000 characters');
      }
    }
    if (input.settings !== undefined && !isPlainObject(input.settings)) {
      throw new ValidationError('settings must be a JSON object');
    }

    return this.spaces.updateOwned(spaceId, userId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.slug !== undefined ? { slug: input.slug.trim().toLowerCase() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.settings !== undefined ? { settings: input.settings } : {}),
    });
  }

  async deleteOwned(userId: string, spaceId: string): Promise<void> {
    await this.authorization.assertSpaceOwner(userId, spaceId);
    await this.spaces.deleteOwned(spaceId, userId);
  }
}
