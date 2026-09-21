import { Module } from '@nestjs/common';
import type { ChatRequest } from './domain/chat-service.port';
import { CHAT_SERVICE } from './domain/chat-service.port';

/** V0.4-D: architecture boundary only. Chat orchestration arrives later. */
@Module({
  providers: [
    {
      provide: CHAT_SERVICE,
      useValue: {
        validateRequest(request: ChatRequest): boolean {
          return request.message.trim().length > 0 && request.knowledgeSpaceId.length > 0;
        },
      },
    },
  ],
  exports: [CHAT_SERVICE],
})
export class ChatModule {}
