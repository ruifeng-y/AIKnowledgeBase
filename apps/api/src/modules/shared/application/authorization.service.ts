import type { DocumentRecord } from '../../documents/domain/document-repository.port';
import type { KnowledgeSpaceRecord } from '../../knowledge-spaces/domain/knowledge-space-repository.port';
import type { WorkspaceRecord } from '../../workspaces/domain/workspace-repository.port';
import {
  documentNotFound,
  knowledgeSpaceNotFound,
  workspaceNotFound,
} from '../../../common/errors/app-errors';

/**
 * Application-layer authorization boundary.
 * Cross-tenant resources must 404 to avoid existence disclosure.
 */
export class AuthorizationService {
  constructor(
    private readonly workspaces: {
      findOwnedById(workspaceId: string, ownerId: string): Promise<WorkspaceRecord | null>;
    },
    private readonly spaces: {
      findOwnedById(spaceId: string, ownerId: string): Promise<KnowledgeSpaceRecord | null>;
    },
    private readonly documents: {
      findOwnedById(documentId: string, ownerId: string): Promise<DocumentRecord | null>;
    },
  ) {}

  async assertWorkspaceOwner(userId: string, workspaceId: string): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.findOwnedById(workspaceId, userId);
    if (!workspace) {
      throw workspaceNotFound();
    }
    return workspace;
  }

  async assertSpaceOwner(userId: string, spaceId: string): Promise<KnowledgeSpaceRecord> {
    const space = await this.spaces.findOwnedById(spaceId, userId);
    if (!space) {
      throw knowledgeSpaceNotFound();
    }
    return space;
  }

  async assertDocumentOwner(userId: string, documentId: string): Promise<DocumentRecord> {
    const document = await this.documents.findOwnedById(documentId, userId);
    if (!document) {
      throw documentNotFound();
    }
    return document;
  }
}
