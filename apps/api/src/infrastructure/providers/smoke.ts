import { runProviderSmokeTest } from './provider-health';

async function main(): Promise<void> {
  const report = await runProviderSmokeTest();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'PASS') {
    process.exitCode = report.status === 'SKIPPED_PROVIDER_UNAVAILABLE' ? 0 : 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
