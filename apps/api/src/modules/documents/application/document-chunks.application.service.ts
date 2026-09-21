import type { AuthorizationService } from '../../shared/application/authorization.service';
import type {
  DocumentChunksView,
  KnowledgeChunkRepositoryPort,
} from '../domain/knowledge-chunk.repository.port';

export class DocumentChunksApplicationService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly chunks: KnowledgeChunkRepositoryPort,
  ) {}

  async list(userId: string, documentId: string): Promise<DocumentChunksView> {
    const document = await this.authorization.assertDocumentOwner(userId, documentId);
    const items = await this.chunks.listByDocumentId(documentId);
    return {
      documentId,
      versionId: document.currentVersionId,
      items,
      total: items.length,
    };
  }
}
