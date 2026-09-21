/** Conversation domain port — no Chat API in V0.4-D. */

export interface ConversationRecord {
  id: string;
  knowledgeSpaceId: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

export interface ConversationRepositoryPort {
  findById(id: string): Promise<ConversationRecord | null>;
}
