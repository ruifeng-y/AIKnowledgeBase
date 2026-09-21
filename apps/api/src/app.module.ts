import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/app-config.module';
import { AiProvidersModule } from './infrastructure/ai/ai-providers.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { CitationsModule } from './modules/citations/citations.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { KnowledgeSpacesModule } from './modules/knowledge-spaces/knowledge-spaces.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    StorageModule,
    QueueModule,
    AiProvidersModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    KnowledgeSpacesModule,
    DocumentsModule,
    ConversationsModule,
    RetrievalModule,
    ChatModule,
    CitationsModule,
    ApiKeysModule,
  ],
})
export class AppModule {}
