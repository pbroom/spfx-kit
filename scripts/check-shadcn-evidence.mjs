import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));

function selectedRoot(args) {
  let root = process.cwd();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--root') continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('--root requires a value.');
    root = path.resolve(process.cwd(), value);
    index += 1;
  }
  return root;
}

function run(script, args = [], cwd = process.cwd()) {
  const result = spawnSync(process.execPath, [path.join(scriptRoot, script), ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
const root = selectedRoot(args);
run('validate-shadcn-evidence.mjs', args);
run('check-phase0-inventories.mjs', [], root);
