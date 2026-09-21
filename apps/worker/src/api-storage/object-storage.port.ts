export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export type ObjectStorageBody = Buffer | Uint8Array | string;

export interface ObjectStoragePort {
  put(key: string, body: ObjectStorageBody, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function parseMinioEndpoint(endpoint: string): {
  host: string;
  port: number;
  useSSL: boolean;
} {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port ? Number.parseInt(url.port, 10) : useSSL ? 443 : 80;
  return { host: url.hostname, port, useSSL };
}
