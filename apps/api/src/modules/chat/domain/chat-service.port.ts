/** Chat domain port — no SSE/LLM orchestration in V0.4-D. */

export const CHAT_SERVICE = Symbol('CHAT_SERVICE');

export interface ChatRequest {
  knowledgeSpaceId: string;
  conversationId?: string;
  message: string;
}

export interface ChatServicePort {
  /** Reserved for future RAG chat orchestration. */
  validateRequest(request: ChatRequest): boolean;
}
