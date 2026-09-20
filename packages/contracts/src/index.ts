export interface HealthResponse {
  status: 'ok';
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (value as { status?: unknown }).status === 'ok';
}
