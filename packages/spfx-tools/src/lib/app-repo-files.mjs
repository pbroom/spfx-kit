import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exists } from './fs.mjs';
import { DEFAULT_NODE_VERSION } from './spfx-support.mjs';

const APP_GITIGNORE = `# Dependencies
node_modules/

# Logs
*.log
npm-debug.log*

# Build output
lib/
temp/
dist/
build/
release/assets/
release/manifests/
sharepoint/solution/*.sppkg
sharepoint/solution/debug/
*.tsbuildinfo
.heft/

# Local config
.env
.env.local
.DS_Store
`;

// Writes the files a standalone app repo needs to be pushed to its own
// remote with working CI: a GitHub Actions workflow, a pinned .nvmrc, and a
// .gitignore for SPFx build output. Existing files are never overwritten so
// apps can customize them.
export async function writeAppRepoFiles(appDir) {
  const templatePath = path.resolve(import.meta.dirname, '..', '..', 'templates', 'app-ci.yml');
  const written = [];

  const workflowPath = path.join(appDir, '.github', 'workflows', 'ci.yml');
  if (!(await exists(workflowPath))) {
    await mkdir(path.dirname(workflowPath), { recursive: true });
    await copyFile(templatePath, workflowPath);
    written.push('.github/workflows/ci.yml');
  }

  const nvmrcPath = path.join(appDir, '.nvmrc');
  if (!(await exists(nvmrcPath))) {
    await writeFile(nvmrcPath, `${DEFAULT_NODE_VERSION}\n`);
    written.push('.nvmrc');
  }

  const gitignorePath = path.join(appDir, '.gitignore');
  if (!(await exists(gitignorePath))) {
    await writeFile(gitignorePath, APP_GITIGNORE);
    written.push('.gitignore');
  }

  return written;
}
