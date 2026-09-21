import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppConfigModule } from '../common/config/app-config.module';
import { AUTH_REPOSITORY } from '../modules/auth/domain/auth-repository.port';
import { DOCUMENT_REPOSITORY } from '../modules/documents/domain/document-repository.port';
import { KNOWLEDGE_SPACE_REPOSITORY } from '../modules/knowledge-spaces/domain/knowledge-space-repository.port';
import { USER_REPOSITORY } from '../modules/users/domain/user-repository.port';
import { WORKSPACE_REPOSITORY } from '../modules/workspaces/domain/workspace-repository.port';
import { AppModule } from '../app.module';
import { EMBEDDING_PROVIDER, LLM_PROVIDER, RERANKER_PROVIDER } from './ai/ai-provider.ports';
import { AiProvidersModule } from './ai/ai-providers.module';
import { DatabaseModule } from './database/database.module';
import { TRANSACTION_MANAGER } from './database/transaction-manager.port';
import { JOB_QUEUE } from './queue/job-queue.port';
import { QueueModule } from './queue/queue.module';
import { OBJECT_STORAGE } from './storage/object-storage.port';
import { StorageModule } from './storage/storage.module';
import { API_KEY_REPOSITORY } from '../modules/api-keys/domain/api-key-repository.port';
import { ApiKeysModule } from '../modules/api-keys/api-keys.module';

describe('Repository and infrastructure DI', () => {
  it('resolves domain ports from AppModule without hitting external services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(USER_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(WORKSPACE_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(KNOWLEDGE_SPACE_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(DOCUMENT_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(AUTH_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(TRANSACTION_MANAGER)).toBeDefined();
    expect(moduleRef.get(OBJECT_STORAGE)).toBeDefined();
    expect(moduleRef.get(JOB_QUEUE)).toBeDefined();
    expect(moduleRef.get(EMBEDDING_PROVIDER)).toBeDefined();
    expect(moduleRef.get(RERANKER_PROVIDER)).toBeDefined();
    expect(moduleRef.get(LLM_PROVIDER)).toBeDefined();
    expect(moduleRef.get(API_KEY_REPOSITORY)).toBeDefined();

    await moduleRef.close();
  });

  it('infrastructure modules export ports', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        DatabaseModule,
        StorageModule,
        QueueModule,
        AiProvidersModule,
        ApiKeysModule,
      ],
    }).compile();

    expect(moduleRef.get(USER_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(OBJECT_STORAGE)).toBeDefined();
    expect(moduleRef.get(JOB_QUEUE)).toBeDefined();
    expect(moduleRef.get(EMBEDDING_PROVIDER)).toBeDefined();
    await moduleRef.close();
  });
});
