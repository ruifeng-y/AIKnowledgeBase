import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import type { JobEnvelope, JobQueuePort } from './job-queue.port';

export class BullMqJobQueue implements JobQueuePort {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: ConnectionOptions) {}

  async enqueue<TPayload>(job: JobEnvelope<TPayload>): Promise<void> {
    const queue = this.resolveQueue(job.queue);
    await queue.add(job.name, job.payload);
  }

  async close(): Promise<void> {
    const queues = [...this.queues.values()];
    this.queues.clear();
    await Promise.all(queues.map((queue) => queue.close()));
  }

  private resolveQueue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }
    const queue = new Queue(name, { connection: this.connection });
    this.queues.set(name, queue);
    return queue;
  }
}

/** Offline-friendly adapter for tests — no Redis connection. */
export class InMemoryJobQueue implements JobQueuePort {
  readonly jobs: JobEnvelope[] = [];

  async enqueue<TPayload>(job: JobEnvelope<TPayload>): Promise<void> {
    this.jobs.push({ queue: job.queue, name: job.name, payload: job.payload });
  }

  async close(): Promise<void> {
    this.jobs.length = 0;
  }
}
