import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { DocumentProcessingService } from './services/document-processing.service';
import { DocumentProcessorHost } from './processors/document.processor';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('initializes processing services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    expect(moduleRef.get(DocumentProcessingService)).toBeDefined();
    expect(moduleRef.get(DocumentProcessorHost)).toBeDefined();
    await moduleRef.close();
  }, 20_000);
});
