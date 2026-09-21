import { Inject, Injectable, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { MinioObjectStorage } from './minio-object-storage';
import { OBJECT_STORAGE, type ObjectStoragePort } from './object-storage.port';

@Injectable()
export class ObjectStorageFactory {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  create(): ObjectStoragePort {
    return new MinioObjectStorage({
      endPoint: this.config.storage.endpoint,
      accessKey: this.config.storage.accessKeyId,
      secretKey: this.config.storage.secretAccessKey,
      bucket: this.config.storage.bucket,
      region: this.config.storage.region,
    });
  }
}

@Module({
  providers: [
    ObjectStorageFactory,
    {
      provide: OBJECT_STORAGE,
      useFactory: (factory: ObjectStorageFactory) => factory.create(),
      inject: [ObjectStorageFactory],
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
