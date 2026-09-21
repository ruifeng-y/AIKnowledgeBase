/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type { ChatServicePort, ChatRequest } from '../domain/chat-service.port';
export { CHAT_SERVICE } from '../domain/chat-service.port';
