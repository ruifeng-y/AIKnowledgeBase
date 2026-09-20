import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { WorkerModule } from '../src/worker.module';

describe('WorkerModule', () => {
  it('initializes without HTTP server', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
