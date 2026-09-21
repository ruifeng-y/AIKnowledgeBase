import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './app-config';

export const DOCUMENT_POLICY = Symbol('DOCUMENT_POLICY');

export interface DocumentPolicy {
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
}

const DEFAULT_ALLOWED = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/json',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function loadDocumentPolicy(config: AppConfig): DocumentPolicy {
  const documents = config.documents;
  return {
    maxFileSizeBytes: documents?.maxFileSizeBytes ?? 20 * 1024 * 1024,
    allowedMimeTypes: documents?.allowedMimeTypes ?? DEFAULT_ALLOWED,
  };
}

@Injectable()
export class DocumentPolicyProvider {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get(): DocumentPolicy {
    return loadDocumentPolicy(this.config);
  }
}
