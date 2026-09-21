import type { ObjectStorageBody, ObjectStoragePort } from './object-storage.port';

export class InMemoryObjectStorage implements ObjectStoragePort {
  private readonly store = new Map<string, Buffer>();

  async put(key: string, body: ObjectStorageBody): Promise<void> {
    const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    this.store.set(key, buffer);
  }

  async get(key: string): Promise<Buffer> {
    const existing = this.store.get(key);
    if (!existing) {
      throw new Error(`Object not found: ${key}`);
    }
    return Buffer.from(existing);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}
