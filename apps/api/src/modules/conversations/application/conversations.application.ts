/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type {
  ConversationRepositoryPort,
  ConversationRecord,
} from '../domain/conversation-repository.port';
export { CONVERSATION_REPOSITORY } from '../domain/conversation-repository.port';
