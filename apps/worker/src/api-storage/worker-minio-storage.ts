import { Client } from 'minio';
import {
  parseMinioEndpoint,
  type ObjectStorageBody,
  type ObjectStoragePort,
} from './object-storage.port';

export interface MinioOptions {
  endPoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

export class WorkerMinioObjectStorage implements ObjectStoragePort {
  private readonly client: Client;
  private readonly bucket: string;

  constructor(options: MinioOptions) {
    const parsed = parseMinioEndpoint(options.endPoint);
    this.bucket = options.bucket;
    this.client = new Client({
      endPoint: parsed.host,
      port: parsed.port,
      useSSL: parsed.useSSL,
      accessKey: options.accessKey,
      secretKey: options.secretKey,
      region: options.region,
    });
  }

  async put(key: string, body: ObjectStorageBody, contentType?: string): Promise<void> {
    const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    await this.client.putObject(
      this.bucket,
      key,
      buffer,
      buffer.byteLength,
      contentType ? { 'Content-Type': contentType } : undefined,
    );
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
