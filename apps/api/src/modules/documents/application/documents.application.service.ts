import { createHash } from 'node:crypto';
import type { DocumentPolicy } from '../../../common/config/document-policy';
import {
  documentFileRequired,
  documentFileTooLarge,
  documentStorageError,
  documentUnsupportedFileType,
  ValidationError,
} from '../../../common/errors/app-errors';
import type { ObjectStoragePort } from '../../../infrastructure/storage/object-storage.port';
import { AuthorizationService } from '../../shared/application/authorization.service';
import type {
  CreateDocumentVersionInput,
  DocumentRecord,
  DocumentRepositoryPort,
  DocumentVersionRecord,
  UpdateDocumentInput,
} from '../domain/document-repository.port';

export interface UploadFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface DocumentDownload {
  document: DocumentRecord;
  version: DocumentVersionRecord;
  buffer: Buffer;
}

export function sanitizeFilename(raw: string): string {
  const normalized = (raw || 'file').replace(/\\/g, '/');
  const segments = normalized.split('/');
  const last = segments[segments.length - 1] || 'file';
  const withoutDots = last.replace(/^\.+/, '').trim();
  const safe = withoutDots.replace(/["\\]/g, '_');
  return safe.length > 0 ? safe.slice(0, 200) : 'file';
}

export function buildObjectKey(input: {
  workspaceId: string;
  spaceId: string;
  documentId: string;
  version: number;
}): string {
  return [
    'workspaces',
    input.workspaceId,
    'spaces',
    input.spaceId,
    'documents',
    input.documentId,
    'versions',
    String(input.version),
    'original',
  ].join('/');
}

function mergeMetadata(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...patch };
}

export function contentDispositionFilename(filename: string): string {
  const safe = sanitizeFilename(filename).replace(/"/g, '_');
  return `attachment; filename="${safe}"`;
}

export class DocumentApplicationService {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly authorization: AuthorizationService,
    private readonly storage: ObjectStoragePort,
    private readonly policy: DocumentPolicy,
  ) {}

  private validateTitle(title: string): string {
    const value = title.trim();
    if (value.length < 1 || value.length > 255) {
      throw new ValidationError('Document title must be 1-255 characters');
    }
    return value;
  }

  private validateUploadFile(file: UploadFileInput | undefined): {
    originalFilename: string;
    mimeType: string;
  } {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw documentFileRequired();
    }
    if (file.size > this.policy.maxFileSizeBytes) {
      throw documentFileTooLarge();
    }
    const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
    if (!this.policy.allowedMimeTypes.includes(mimeType)) {
      throw documentUnsupportedFileType();
    }
    return {
      originalFilename: sanitizeFilename(file.originalname || 'file'),
      mimeType,
    };
  }

  async createMetadataOnly(
    userId: string,
    spaceId: string,
    input: { title: string },
  ): Promise<DocumentRecord> {
    const space = await this.authorization.assertSpaceOwner(userId, spaceId);
    const title = this.validateTitle(input.title);
    return this.documents.create(space.id, {
      title,
      sourceType: 'UPLOAD',
      status: 'PENDING',
      metadata: {},
    });
  }

  async listInSpace(userId: string, spaceId: string): Promise<DocumentRecord[]> {
    const space = await this.authorization.assertSpaceOwner(userId, spaceId);
    return this.documents.listByKnowledgeSpaceId(space.id);
  }

  async getOwned(userId: string, documentId: string): Promise<DocumentRecord> {
    return this.authorization.assertDocumentOwner(userId, documentId);
  }

  async updateOwned(
    userId: string,
    documentId: string,
    input: { title?: string; description?: string },
  ): Promise<DocumentRecord> {
    const current = await this.authorization.assertDocumentOwner(userId, documentId);
    const patch: UpdateDocumentInput = {};
    if (input.title !== undefined) {
      patch.title = this.validateTitle(input.title);
    }
    if (input.description !== undefined) {
      patch.metadata = mergeMetadata(current.metadata, { description: input.description });
    }
    return this.documents.updateOwned(documentId, userId, patch);
  }

  async upload(
    userId: string,
    spaceId: string,
    file: UploadFileInput | undefined,
    options: { title?: string },
  ): Promise<DocumentRecord> {
    const space = await this.authorization.assertSpaceOwner(userId, spaceId);
    const workspace = await this.authorization.assertWorkspaceOwner(userId, space.workspaceId);
    const validated = this.validateUploadFile(file);
    if (!file || !file.buffer) {
      throw documentFileRequired();
    }
    const fileBuffer: Buffer = file.buffer;
    const title = this.validateTitle(options.title?.trim() || validated.originalFilename);

    const document = await this.documents.create(space.id, {
      title,
      sourceType: 'UPLOAD',
      mimeType: validated.mimeType,
      status: 'PENDING',
      metadata: { originalFilename: validated.originalFilename },
    });

    const storageKey = buildObjectKey({
      workspaceId: workspace.id,
      spaceId: space.id,
      documentId: document.id,
      version: 1,
    });
    const contentHash = createHash('sha256').update(fileBuffer).digest('hex');

    try {
      await this.storage.put(storageKey, fileBuffer, validated.mimeType);
    } catch {
      await this.documents.deleteOwned(document.id, userId).catch(() => undefined);
      throw documentStorageError();
    }

    try {
      const versionInput: CreateDocumentVersionInput = {
        version: 1,
        storageKey,
        contentHash,
        fileSize: fileBuffer.length,
        mimeType: validated.mimeType,
      };
      const version = await this.documents.createVersion(document.id, versionInput);
      return await this.documents.updateOwned(document.id, userId, {
        status: 'READY',
        mimeType: validated.mimeType,
        currentVersionId: version.id,
        metadata: mergeMetadata(document.metadata, {
          originalFilename: validated.originalFilename,
          storageKey,
          contentHash,
          fileSize: fileBuffer.length,
        }),
      });
    } catch {
      await this.storage.delete(storageKey).catch(() => undefined);
      await this.documents.deleteOwned(document.id, userId).catch(() => undefined);
      throw documentStorageError();
    }
  }

  async appendVersion(
    userId: string,
    documentId: string,
    file: UploadFileInput,
  ): Promise<DocumentRecord> {
    const document = await this.authorization.assertDocumentOwner(userId, documentId);
    const space = await this.authorization.assertSpaceOwner(userId, document.knowledgeSpaceId);
    const workspace = await this.authorization.assertWorkspaceOwner(userId, space.workspaceId);
    const validated = this.validateUploadFile(file);
    const versions = await this.documents.listVersions(document.id);
    const versionNumber = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const storageKey = buildObjectKey({
      workspaceId: workspace.id,
      spaceId: space.id,
      documentId: document.id,
      version: versionNumber,
    });
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');

    try {
      await this.storage.put(storageKey, file.buffer, validated.mimeType);
    } catch {
      throw documentStorageError();
    }

    try {
      const version = await this.documents.createVersion(document.id, {
        version: versionNumber,
        storageKey,
        contentHash,
        fileSize: file.buffer.length,
        mimeType: validated.mimeType,
      });
      return await this.documents.updateOwned(document.id, userId, {
        status: 'READY',
        mimeType: validated.mimeType,
        currentVersionId: version.id,
        metadata: mergeMetadata(document.metadata, {
          originalFilename: validated.originalFilename,
          storageKey,
          contentHash,
          fileSize: file.buffer.length,
        }),
      });
    } catch {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw documentStorageError();
    }
  }

  async download(userId: string, documentId: string): Promise<DocumentDownload> {
    const bundle = await this.documents.findOwnedDocumentWithVersions(documentId, userId);
    if (!bundle) {
      // Cross-tenant or missing document must surface as 404, not storage error.
      await this.authorization.assertDocumentOwner(userId, documentId);
      throw documentStorageError();
    }
    const { document, versions } = bundle;
    const current =
      versions.find((item) => item.id === document.currentVersionId) ??
      [...versions].sort((a, b) => b.version - a.version)[0];
    if (!current) {
      throw documentStorageError();
    }
    try {
      const buffer = await this.storage.get(current.storageKey);
      return { document, version: current, buffer };
    } catch {
      throw documentStorageError();
    }
  }

  async deleteOwned(userId: string, documentId: string): Promise<void> {
    const bundle = await this.documents.findOwnedDocumentWithVersions(documentId, userId);
    if (!bundle) {
      await this.authorization.assertDocumentOwner(userId, documentId);
    }
    const storageKeys = (bundle?.versions ?? []).map((item) => item.storageKey);
    const doc = bundle?.document;
    if (doc) {
      const metaKey =
        typeof doc.metadata['storageKey'] === 'string' ? doc.metadata['storageKey'] : null;
      if (metaKey && !storageKeys.includes(metaKey)) {
        storageKeys.push(metaKey);
      }
    }

    await this.documents.deleteOwned(documentId, userId);
    for (const key of storageKeys) {
      await this.storage.delete(key).catch(() => undefined);
    }
  }
}
