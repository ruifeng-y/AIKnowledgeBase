import { Module } from '@nestjs/common';
import { API_KEY_REPOSITORY } from './domain/api-key-repository.port';

/** V0.4-D: architecture boundary only. API key service arrives later. */
@Module({
  providers: [
    {
      provide: API_KEY_REPOSITORY,
      useValue: {
        findByKeyHash: async () => null,
        listByWorkspaceId: async () => [],
      },
    },
  ],
  exports: [API_KEY_REPOSITORY],
})
export class ApiKeysModule {}
