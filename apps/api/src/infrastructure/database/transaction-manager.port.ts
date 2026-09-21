export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

export interface TransactionManagerPort {
  run<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}
