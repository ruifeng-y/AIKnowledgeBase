/** Minimal config skeleton. Full env loading arrives in later phases. */
export const CONFIG_PACKAGE = '@akb/config' as const;

export type NodeEnv = 'development' | 'test' | 'production';

export interface BaseRuntimeConfig {
  nodeEnv: NodeEnv;
  apiPort: number;
  webPort: number;
}

export function readBaseRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): BaseRuntimeConfig {
  const rawNodeEnv = env['NODE_ENV'];
  const nodeEnv: NodeEnv =
    rawNodeEnv === 'production' || rawNodeEnv === 'test' ? rawNodeEnv : 'development';

  return {
    nodeEnv,
    apiPort: parsePort(env['API_PORT'], 3001),
    webPort: parsePort(env['WEB_PORT'], 3000),
  };
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
