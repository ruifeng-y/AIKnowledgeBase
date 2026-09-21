import type { DocumentRecord, DocumentVersionRecord } from '../domain/document-repository.port';
import type { AuthorizationService } from '../../shared/application/authorization.service';
import { documentNotFound } from '../../../common/errors/app-errors';
import type {
  DocumentChunksView,
  KnowledgeChunkRepositoryPort,
} from '../domain/knowledge-chunk.repository.port';

export interface DocumentVersionLookupPort {
  findVersionById(versionId: string): Promise<DocumentVersionRecord | null>;
}

export class DocumentChunksApplicationService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly chunks: KnowledgeChunkRepositoryPort,
    private readonly versions: DocumentVersionLookupPort,
  ) {}

  async list(userId: string, documentId: string, versionId?: string): Promise<DocumentChunksView> {
    const document: DocumentRecord = await this.authorization.assertDocumentOwner(
      userId,
      documentId,
    );

    let targetVersionId: string;
    if (versionId === undefined || versionId === '') {
      if (!document.currentVersionId) {
        return {
          documentId,
          versionId: null,
          items: [],
          total: 0,
        };
      }
      targetVersionId = document.currentVersionId;
    } else {
      const requested = await this.versions.findVersionById(versionId);
      if (!requested || requested.documentId !== documentId) {
        throw documentNotFound();
      }
      targetVersionId = requested.id;
    }

    const items = await this.chunks.listByVersionId(targetVersionId);
    return {
      documentId,
      versionId: targetVersionId,
      items,
      total: items.length,
    };
  }
}
