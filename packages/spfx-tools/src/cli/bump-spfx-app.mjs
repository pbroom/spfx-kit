#!/usr/bin/env node
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import { readJson } from '../lib/fs.mjs';

const usage = `Usage:
  bump-spfx-app --app .spfx-kit/apps/<slug>-spfx [--type patch|minor|major] [--set <x.y.z>] [--json]

Bumps the app package.json version and keeps config/package-solution.json
solution and feature versions in sync (SharePoint uses four-part versions,
so x.y.z becomes x.y.z.0). Defaults to a patch bump.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = required(args, 'app', usage);
  const jsonOutput = args.json === true || args.json === 'true';
  const appDir = path.resolve(app);
  const packagePath = path.join(appDir, 'package.json');
  const solutionPath = path.join(appDir, 'config', 'package-solution.json');

  const recovery = await recoverPendingVersionBump(packagePath, solutionPath);
  if (recovery?.action === 'completed') {
    if (jsonOutput) {
      console.log(
        JSON.stringify({
          app: path.relative(process.cwd(), appDir),
          recovered: true,
          previousVersion: recovery.previousVersion,
          version: recovery.version,
          solutionVersion: recovery.solutionVersion
        })
      );
    } else {
      console.log(
        `Recovered pending bump for ${path.relative(process.cwd(), appDir)} from ${recovery.previousVersion} to ${recovery.version}`
      );
      console.log(`  package.json version: ${recovery.version}`);
      console.log(`  package-solution.json solution/feature versions: ${recovery.solutionVersion}`);
    }
    return;
  }

  const originalPackageJsonText = await readFile(packagePath, 'utf8');
  const packageJson = JSON.parse(originalPackageJsonText);
  const previousVersion = String(packageJson.version || '0.0.0');
  const nextVersion = typeof args.set === 'string' ? parseVersion(args.set).join('.') : bump(previousVersion, args.type);

  // Prepare both updates before writing anything so a missing or malformed
  // package-solution.json cannot leave the two files out of sync.
  const solutionVersion = `${nextVersion}.0`;
  const packageSolution = await readJson(solutionPath);
  packageSolution.solution = packageSolution.solution || {};
  packageSolution.solution.version = solutionVersion;
  for (const feature of packageSolution.solution.features || []) {
    feature.version = solutionVersion;
  }
  packageJson.version = nextVersion;

  await writeBothVersionFiles(packagePath, packageJson, solutionPath, packageSolution, originalPackageJsonText);

  if (jsonOutput) {
    console.log(
      JSON.stringify({ app: path.relative(process.cwd(), appDir), previousVersion, version: nextVersion, solutionVersion })
    );
  } else {
    console.log(`Bumped ${path.relative(process.cwd(), appDir)} from ${previousVersion} to ${nextVersion}`);
    console.log(`  package.json version: ${nextVersion}`);
    console.log(`  package-solution.json solution/feature versions: ${solutionVersion}`);
  }
}

// Stage every write to temp files first so disk or permission failures
// surface before either real file changes, expose the final contents via
// atomic renames, and restore package.json from a pre-staged backup (also an
// atomic rename) if the solution rename fails. This never leaves one final
// write exposed while the other is still pending a fallible plain write.
async function writeBothVersionFiles(packagePath, packageJson, solutionPath, packageSolution, originalPackageJsonText) {
  const { packageTmp, solutionTmp, packageBackup } = getVersionBumpPaths(packagePath, solutionPath);
  try {
    await writeFile(packageTmp, `${JSON.stringify(packageJson, null, 2)}\n`);
    await writeFile(solutionTmp, `${JSON.stringify(packageSolution, null, 2)}\n`);
    await writeFile(packageBackup, originalPackageJsonText);

    await rename(packageTmp, packagePath);
    try {
      await rename(solutionTmp, solutionPath);
    } catch (error) {
      await rename(packageBackup, packagePath);
      throw error;
    }
  } finally {
    await rm(packageTmp, { force: true });
    await rm(solutionTmp, { force: true });
    await rm(packageBackup, { force: true });
  }
}

async function recoverPendingVersionBump(packagePath, solutionPath) {
  const { packageTmp, solutionTmp, packageBackup } = getVersionBumpPaths(packagePath, solutionPath);
  const backupText = await readOptionalText(packageBackup);
  if (backupText === null) {
    await rm(packageTmp, { force: true });
    await rm(solutionTmp, { force: true });
    return null;
  }

  const packageText = await readFile(packagePath, 'utf8');
  const backupPackageJson = JSON.parse(backupText);
  const currentPackageJson = JSON.parse(packageText);
  const previousVersion = String(backupPackageJson.version || '0.0.0');
  const currentVersion = String(currentPackageJson.version || '0.0.0');

  if (currentVersion === previousVersion) {
    await rm(packageTmp, { force: true });
    await rm(solutionTmp, { force: true });
    await rm(packageBackup, { force: true });
    return null;
  }

  const solutionVersion = `${currentVersion}.0`;
  const solutionTmpText = await readOptionalText(solutionTmp);
  if (solutionTmpText !== null && solutionUsesVersion(JSON.parse(solutionTmpText), solutionVersion)) {
    await rename(solutionTmp, solutionPath);
    await rm(packageTmp, { force: true });
    await rm(packageBackup, { force: true });
    return { action: 'completed', previousVersion, version: currentVersion, solutionVersion };
  }

  const packageSolution = await readJson(solutionPath);
  if (solutionUsesVersion(packageSolution, solutionVersion)) {
    await rm(packageTmp, { force: true });
    await rm(solutionTmp, { force: true });
    await rm(packageBackup, { force: true });
    return { action: 'completed', previousVersion, version: currentVersion, solutionVersion };
  }

  await rename(packageBackup, packagePath);
  await rm(packageTmp, { force: true });
  await rm(solutionTmp, { force: true });
  return { action: 'rolledBack', previousVersion: currentVersion, version: previousVersion };
}

function getVersionBumpPaths(packagePath, solutionPath) {
  return {
    packageTmp: `${packagePath}.spfx-kit-bump.tmp`,
    solutionTmp: `${solutionPath}.spfx-kit-bump.tmp`,
    packageBackup: `${packagePath}.spfx-kit-bump.bak`
  };
}

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function solutionUsesVersion(packageSolution, solutionVersion) {
  const solution = packageSolution.solution || {};
  return (
    solution.version === solutionVersion && (solution.features || []).every((feature) => feature.version === solutionVersion)
  );
}

function bump(version, type) {
  const [major, minor, patch] = parseVersion(version);
  const bumpType = typeof type === 'string' ? type : 'patch';
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unsupported bump type "${bumpType}". Use patch, minor, or major.`);
  }
}

function parseVersion(version) {
  const match = String(version)
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`"${version}" is not a plain x.y.z version.`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
