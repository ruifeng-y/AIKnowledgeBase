import { Client } from 'minio';
import type { ObjectStorageBody, ObjectStoragePort } from './object-storage.port';

export interface MinioObjectStorageOptions {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

function parseEndpoint(endpoint: string): { host: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port ? Number.parseInt(url.port, 10) : useSSL ? 443 : 80;
  return { host: url.hostname, port, useSSL };
}

export class MinioObjectStorage implements ObjectStoragePort {
  private readonly client: Client;
  private readonly bucket: string;

  constructor(options: MinioObjectStorageOptions) {
    const parsed = parseEndpoint(options.endPoint);
    this.bucket = options.bucket;
    this.client = new Client({
      endPoint: parsed.host,
      port: options.port ?? parsed.port,
      useSSL: options.useSSL ?? parsed.useSSL,
      accessKey: options.accessKey,
      secretKey: options.secretKey,
      region: options.region,
    });
  }

  async put(key: string, body: ObjectStorageBody, contentType?: string): Promise<void> {
    const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    const metaData = contentType ? { 'Content-Type': contentType } : undefined;
    await this.client.putObject(this.bucket, key, buffer, buffer.byteLength, metaData);
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }
}
