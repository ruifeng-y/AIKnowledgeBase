import { InMemoryJobQueue } from './bullmq-job-queue';
import { describe, expect, it } from 'vitest';

describe('InMemoryJobQueue', () => {
  it('records jobs offline', async () => {
    const queue = new InMemoryJobQueue();
    await queue.enqueue({ queue: 'q1', name: 'job1', payload: { a: 1 } });
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.name).toBe('job1');
    await queue.close();
  });
});
