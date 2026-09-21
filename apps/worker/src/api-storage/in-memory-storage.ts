export class InMemoryObjectStorage {
  private readonly store = new Map<string, Buffer>();

  async put(key: string, body: Buffer | Uint8Array | string): Promise<void> {
    const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    this.store.set(key, buffer);
  }

  async get(key: string): Promise<Buffer> {
    const value = this.store.get(key);
    if (!value) {
      throw new Error(`Object not found: ${key}`);
    }
    return Buffer.from(value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}
