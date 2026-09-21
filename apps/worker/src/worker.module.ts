import { Module } from '@nestjs/common';
import { DocumentProcessingService } from './services/document-processing.service';
import { DocumentProcessorHost } from './processors/document.processor';
import { WorkerMinioObjectStorage } from './api-storage/worker-minio-storage';

@Module({
  providers: [
    {
      provide: 'WORKER_STORAGE',
      useFactory: () =>
        new WorkerMinioObjectStorage({
          endPoint: process.env['S3_ENDPOINT'] ?? 'http://127.0.0.1:9000',
          accessKey: process.env['S3_ACCESS_KEY_ID'] ?? 'minioadmin',
          secretKey: process.env['S3_SECRET_ACCESS_KEY'] ?? 'change_me',
          bucket: process.env['S3_BUCKET'] ?? 'ai-knowledge-base',
          region: process.env['S3_REGION'] ?? 'us-east-1',
        }),
    },
    {
      provide: DocumentProcessingService,
      useFactory: (storage: WorkerMinioObjectStorage) => new DocumentProcessingService(storage),
      inject: ['WORKER_STORAGE'],
    },
    {
      provide: DocumentProcessorHost,
      useFactory: (service: DocumentProcessingService) =>
        new DocumentProcessorHost(
          {
            url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
            host: process.env['REDIS_HOST'] ?? 'localhost',
            port: Number(process.env['REDIS_PORT'] ?? 6379),
          },
          async (payload) => {
            await service.process(payload);
          },
        ),
      inject: [DocumentProcessingService],
    },
  ],
  exports: [DocumentProcessingService, DocumentProcessorHost],
})
export class WorkerModule {}
