import { execFile } from 'node:child_process';
import { copyFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { prepareBaseUi } from '../prepare-base-ui.mjs';
import { canonicalJson } from './profile.mjs';

const execFileAsync = promisify(execFile);
const contractPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const typecheckScript = path.join(contractPackageRoot, 'scripts', 'typecheck.mjs');

export const PINNED_PROFILE_COMPILERS = Object.freeze([
  Object.freeze({ package: 'typescript', version: '5.3.3', config: 'tsconfig.ts53.json' }),
  Object.freeze({ package: 'typescript-5-8', version: '5.8.3', config: 'tsconfig.ts58.json' })
]);

function configPath(from, to) {
  const relative = path.relative(from, to).replaceAll(path.sep, '/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

export async function assertGeneratedProfileCompiles({ packageRoot, outputRoot }) {
  const [realContractRoot, realPackageRoot, realOutputRoot] = await Promise.all([
    realpath(contractPackageRoot),
    realpath(packageRoot),
    realpath(outputRoot)
  ]);
  if (realPackageRoot !== realContractRoot) {
    throw new Error('Generated profile typechecking must use the compiler contract from the active UI profile package');
  }
  const expectedStagingRoot = path.join(realPackageRoot, '.profile-generation-lock', 'staging');
  if (realOutputRoot !== expectedStagingRoot) {
    throw new Error('Generated profile typechecking requires the owned generation-session staging root');
  }

  await prepareBaseUi();

  const projectRoot = path.join(realOutputRoot, '.profile-typecheck');
  await mkdir(projectRoot, { recursive: true });
  const selectValueProbe = path.join(projectRoot, 'select-value.tsx');
  await copyFile(path.join(realPackageRoot, 'compat-consumers', 'select-value.tsx'), selectValueProbe);
  const include = [
    configPath(projectRoot, path.join(realOutputRoot, 'normalized', 'src', '**', '*.ts')),
    configPath(projectRoot, path.join(realOutputRoot, 'normalized', 'src', '**', '*.tsx')),
    configPath(projectRoot, path.join(realPackageRoot, 'compat-consumers', 'react17-base-ui-jsx.d.ts')),
    configPath(projectRoot, selectValueProbe)
  ];

  for (const compiler of PINNED_PROFILE_COMPILERS) {
    const project = path.join(projectRoot, compiler.config);
    await writeFile(
      project,
      canonicalJson({
        extends: configPath(projectRoot, path.join(realPackageRoot, compiler.config)),
        include
      })
    );
    try {
      await execFileAsync(process.execPath, [typecheckScript, compiler.package, compiler.version, project], {
        cwd: realPackageRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      });
    } catch (error) {
      const output = `${error?.stdout ?? ''}${error?.stderr ?? ''}`.trim();
      throw new Error(
        `Staged profile failed semantic compilation with TypeScript ${compiler.version}${output ? `:\n${output}` : ''}`,
        { cause: error }
      );
    }
    console.log(`Validated staged normalized sources with TypeScript ${compiler.version}`);
  }
}
