/** Infrastructure/ObjectStorage port — pure TypeScript, no SDK types. */

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export type ObjectStorageBody = Buffer | Uint8Array | string;

export interface ObjectStoragePort {
  put(key: string, body: ObjectStorageBody, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
