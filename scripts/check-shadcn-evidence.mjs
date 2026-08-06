import { spawnSync } from 'node:child_process';

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('scripts/validate-shadcn-evidence.mjs', process.argv.slice(2));
run('scripts/check-phase0-inventories.mjs');
