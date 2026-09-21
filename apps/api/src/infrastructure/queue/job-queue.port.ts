export const JOB_QUEUE = Symbol('JOB_QUEUE');

export interface JobEnvelope<TPayload = unknown> {
  queue: string;
  name: string;
  payload: TPayload;
}

export interface JobQueuePort {
  enqueue<TPayload>(job: JobEnvelope<TPayload>): Promise<void>;
  close(): Promise<void>;
}
