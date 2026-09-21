import { Worker } from 'bullmq';
import { DOCUMENT_PROCESS_JOB_NAME } from '@akb/contracts';
import type { DocumentProcessJobPayload } from '../services/document-processing.service';

export class DocumentProcessorHost {
  private worker: Worker | null = null;

  constructor(
    private readonly connection: { url?: string; host?: string; port?: number },
    private readonly handler: (payload: DocumentProcessJobPayload) => Promise<void>,
  ) {}

  start(queueName = 'document-processing'): void {
    this.worker = new Worker(
      queueName,
      async (job) => {
        if (job.name !== DOCUMENT_PROCESS_JOB_NAME && job.name !== 'DOCUMENT_PROCESS') {
          return;
        }
        const payload = job.data as DocumentProcessJobPayload;
        await this.handler(payload);
      },
      {
        connection: this.connection.url
          ? { url: this.connection.url }
          : {
              host: this.connection.host ?? 'localhost',
              port: this.connection.port ?? 6379,
            },
        concurrency: 2,
      },
    );
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}

/** Offline-friendly fake queue consumer for unit tests. */
export class InMemoryDocumentJobRunner {
  constructor(private readonly handler: (payload: DocumentProcessJobPayload) => Promise<void>) {}

  async run(payload: DocumentProcessJobPayload): Promise<void> {
    await this.handler(payload);
  }
}
