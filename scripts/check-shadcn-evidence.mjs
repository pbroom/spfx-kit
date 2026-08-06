import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));

function selectedOptions(args) {
  const options = { root: process.cwd(), candidateRef: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== '--root' && argument !== '--candidate-ref') continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    if (argument === '--root') options.root = path.resolve(process.cwd(), value);
    else options.candidateRef = value;
    index += 1;
  }
  return options;
}

function run(script, args = [], cwd = process.cwd()) {
  const result = spawnSync(process.execPath, [path.join(scriptRoot, script), ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
const { root, candidateRef } = selectedOptions(args);
run('validate-shadcn-evidence.mjs', args);
run('check-phase0-inventories.mjs', candidateRef ? ['--candidate-ref', candidateRef] : [], root);
