import { Module } from '@nestjs/common';
import { CITATION_MAPPER } from './domain/citation-mapper.port';

/** V0.4-D: architecture boundary only. Citation mapping arrives later. */
@Module({
  providers: [
    {
      provide: CITATION_MAPPER,
      useValue: {
        listCitations: async () => [],
      },
    },
  ],
  exports: [CITATION_MAPPER],
})
export class CitationsModule {}
