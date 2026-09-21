import { describe, expect, it } from 'vitest';
import { InMemoryObjectStorage } from './in-memory-object-storage';
import type { ObjectStoragePort } from './object-storage.port';

async function runContract(storage: ObjectStoragePort): Promise<void> {
  const key = 'contracts/demo.txt';
  expect(await storage.exists(key)).toBe(false);
  await storage.put(key, 'hello', 'text/plain');
  expect(await storage.exists(key)).toBe(true);
  const body = await storage.get(key);
  expect(body.toString('utf8')).toBe('hello');
  await storage.delete(key);
  expect(await storage.exists(key)).toBe(false);
}

describe('ObjectStorage contract', () => {
  it('InMemoryObjectStorage satisfies put/get/delete/exists', async () => {
    await runContract(new InMemoryObjectStorage());
  });
});
