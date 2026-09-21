import { NestFactory } from '@nestjs/core';
import { DocumentProcessorHost } from './processors/document.processor';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const host = app.get(DocumentProcessorHost);
  host.start('document-processing');
  console.log('Worker application context started');
  console.log('Document processor listening on queue document-processing');

  const shutdown = async (): Promise<void> => {
    await host.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void bootstrap();
