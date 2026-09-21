import { Module } from '@nestjs/common';
import { CONVERSATION_REPOSITORY } from './domain/conversation-repository.port';

/** V0.4-D: module boundary only. Conversation persistence adapters arrive later. */
@Module({
  exports: [CONVERSATION_REPOSITORY],
  providers: [
    {
      provide: CONVERSATION_REPOSITORY,
      useValue: {
        findById: async () => null,
      },
    },
  ],
})
export class ConversationsModule {}
