/** Package skeleton only. Keep utilities minimal until a real shared need appears. */
export const UTILS_PACKAGE = '@akb/utils' as const;

export function createRequestId(prefix = 'req'): string {
  const random = Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}
