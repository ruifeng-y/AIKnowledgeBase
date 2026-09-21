import { Module } from '@nestjs/common';
import { RETRIEVAL_SERVICE } from './domain/retrieval-service.port';

/** V0.4-D: architecture boundary only. Hybrid retrieval arrives in later phases. */
@Module({
  providers: [
    {
      provide: RETRIEVAL_SERVICE,
      useValue: {
        search: async () => [],
      },
    },
  ],
  exports: [RETRIEVAL_SERVICE],
})
export class RetrievalModule {}
