import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceRecord,
} from '../domain/workspace-repository.port';
import type { WorkspaceRepositoryPort } from '../domain/workspace-repository.port';
import { ValidationError, workspaceSlugExists } from '../../../common/errors/app-errors';
import { AuthorizationService } from '../../shared/application/authorization.service';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateWorkspaceInput(input: { name?: string; slug?: string }): void {
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 100) {
      throw new ValidationError('Workspace name must be 1-100 characters');
    }
  }
  if (input.slug !== undefined) {
    const slug = input.slug.trim();
    if (slug.length < 3 || slug.length > 80 || !SLUG_RE.test(slug)) {
      throw new ValidationError('Workspace slug is invalid');
    }
  }
}

export class WorkspaceApplicationService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly authorization: AuthorizationService,
  ) {}

  async create(ownerId: string, input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    validateWorkspaceInput(input);
    const slug = input.slug.trim().toLowerCase();
    const name = input.name.trim();
    const existing = await this.workspaces.findBySlug(slug);
    if (existing) {
      throw workspaceSlugExists();
    }
    return this.workspaces.create(ownerId, { name, slug });
  }

  list(ownerId: string): Promise<WorkspaceRecord[]> {
    return this.workspaces.findByOwnerId(ownerId);
  }

  async getOwned(userId: string, workspaceId: string): Promise<WorkspaceRecord> {
    return this.authorization.assertWorkspaceOwner(userId, workspaceId);
  }

  async updateOwned(
    userId: string,
    workspaceId: string,
    input: UpdateWorkspaceInput,
  ): Promise<WorkspaceRecord> {
    await this.authorization.assertWorkspaceOwner(userId, workspaceId);
    validateWorkspaceInput(input);
    if (input.slug !== undefined) {
      const slug = input.slug.trim().toLowerCase();
      const existing = await this.workspaces.findBySlug(slug);
      if (existing && existing.id !== workspaceId) {
        throw workspaceSlugExists();
      }
    }
    return this.workspaces.updateOwned(workspaceId, userId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.slug !== undefined ? { slug: input.slug.trim().toLowerCase() } : {}),
    });
  }

  async deleteOwned(userId: string, workspaceId: string): Promise<void> {
    await this.authorization.assertWorkspaceOwner(userId, workspaceId);
    await this.workspaces.deleteOwned(workspaceId, userId);
  }
}
