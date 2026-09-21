import { Inject, Injectable, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { BullMqJobQueue } from './bullmq-job-queue';
import { JOB_QUEUE, type JobQueuePort } from './job-queue.port';

@Injectable()
export class JobQueueFactory {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  create(): JobQueuePort {
    return new BullMqJobQueue({
      url: this.config.redis.url,
      maxRetriesPerRequest: null,
    });
  }
}

@Module({
  providers: [
    JobQueueFactory,
    {
      provide: JOB_QUEUE,
      useFactory: (factory: JobQueueFactory) => factory.create(),
      inject: [JobQueueFactory],
    },
  ],
  exports: [JOB_QUEUE],
})
export class QueueModule {}
