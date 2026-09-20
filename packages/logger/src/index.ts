/** Package skeleton only. Structured logging arrives in later phases. */
export const LOGGER_PACKAGE = '@akb/logger' as const;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export function formatLogPayload(payload: LogPayload): string {
  return JSON.stringify({
    level: payload.level,
    message: payload.message,
    ...(payload.context ? { context: payload.context } : {}),
  });
}
