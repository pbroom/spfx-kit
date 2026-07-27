import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeExportReadme(outDir, slug, targets) {
  const pieces = targets
    .map((target) => {
      const entryName = path.relative(outDir, target.dir).replace(/\\/g, '/');
      if (target.id === 'single') {
        const packageFileName = target.files.find((file) => file.relativePath.endsWith('.sppkg'))?.relativePath || `${slug}.sppkg`;
        return `- \`${entryName}/\`: upload \`${packageFileName}\` to the SharePoint tenant app catalog. This package embeds its assets and does not need a CDN upload.`;
      }
      if (target.id === 'cdn') {
        return `- \`${entryName}/\`: upload \`release/assets/\` to the configured CDN path, then upload the .sppkg in \`sharepoint/solution/\` to the SharePoint tenant app catalog.`;
      }
      if (target.id === 'staging-cdn') {
        return `- \`${entryName}/\`: locally validated immutable staging package. Upload exactly \`upload/\` to the recorded staging prefix, optionally verify the remote bytes, then perform the separate SharePoint App Catalog proof.`;
      }
      if (target.id === 'standalone') {
        return `- \`${entryName}/\`: portable SPFx source repo. Run \`npm ci\` and \`npm run ship\`, then upload the generated \`sharepoint/solution/*.sppkg\` package and any generated CDN assets.`;
      }
      return `- \`${entryName}/\`: see the README inside this folder.`;
    })
    .join('\n');

  await writeFile(
    path.join(outDir, 'README.md'),
    `# ${slug} SPFx Export

This archive contains the selected SPFx Kit export pieces.

${pieces}

SharePoint upload location:

1. Open the SharePoint Admin Center.
2. Open the tenant app catalog.
3. Upload .sppkg files under Apps for SharePoint.
4. Deploy or trust the app when prompted, then add the app or web part to the target site.

CDN upload location:

Upload CDN asset folders to the CDN base path shown in each CDN README. Preserve the folder structure under \`assets/\`.
`
  );
}

export async function writeSingleBundleReadme(dir, slug, packageFileName) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'README.md');
  await writeFile(
    file,
    `# ${slug} Standalone SharePoint Package

Upload \`${packageFileName}\` to the SharePoint tenant app catalog under Apps for SharePoint.

Use this package when you want one .sppkg file with the web part assets embedded. No CDN upload is required.

Deployment steps:

1. Open the SharePoint Admin Center.
2. Open the tenant app catalog, then Apps for SharePoint.
3. Upload \`${packageFileName}\`.
4. Deploy or trust the app when prompted.
5. Add or update the app on the target SharePoint site, then add the web part to the page.
`
  );
  return file;
}

export async function writeCdnPackageReadme(dir, slug, cdnBasePath, packageFileName) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'README.md');
  await writeFile(
    file,
    `# ${slug} CDN SharePoint Package

This package is split into SharePoint app catalog files and CDN-hosted assets.

CDN upload:

1. Upload the contents of \`release/assets/\` to:

\`${cdnBasePath}\`

2. Preserve the folder structure under \`assets/\`.
3. Use \`release/manifests/\` for manifest review or CDN handoff records when needed.

SharePoint upload:

1. Open the SharePoint Admin Center.
2. Open the tenant app catalog, then Apps for SharePoint.
3. Upload \`sharepoint/solution/${packageFileName}\`.
4. Deploy or trust the app when prompted.
5. Add or update the app on the target SharePoint site after the CDN assets are available.
`
  );
  return file;
}

export async function writeCdnStageReadme(dir, slug, cdnBasePath, releaseId, packageFileName) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'README.md');
  await writeFile(
    file,
    `# ${slug} Staging CDN Proof Package

This artifact is pinned to immutable release id \`${releaseId}\`.

Staging CDN upload:

1. Upload exactly the contents of \`upload/\` to:

\`${cdnBasePath}\`

2. Do not merge this tree into another release prefix or overwrite an existing release.
3. After upload, run the shared verifier with \`--remote --expected-cdn-base-url ${cdnBasePath}\`. Supply that expected prefix from trusted deployment configuration.

SharePoint proof:

1. Only after the remote CDN bytes pass, upload \`sharepoint/solution/${packageFileName}\` to a test App Catalog.
2. Deploy or trust the app, install or update it on a test site, and exercise its runtime and lazy-loaded paths.
3. Confirm browser requests use the immutable staging prefix with no CDN, CSP, CORS, MIME, or cache failures.

Proof boundary:

- Local artifact validation: passed during export.
- Remote CDN byte validation: not run by export.
- SharePoint App Catalog/runtime proof: not run by export.

\`deployment-manifest.json\` is the exact inventory: every upload path, resolved URL, byte count, and SHA-256 hash. The \`manifests/\` directory is for inspection and is not part of the CDN upload tree.
`
  );
  return file;
}

export async function writeRepoExportReadme(dir, slug) {
  await writeFile(
    path.join(dir, 'SPFX-KIT-EXPORT-README.md'),
    `# ${slug} Repo Export

This folder is a portable SPFx source repo. It is not the upload artifact itself.

Build deployment artifacts:

1. Run \`npm ci\`.
2. Run \`npm run ship\`.
3. Upload generated .sppkg files from \`sharepoint/solution/\` to the SharePoint tenant app catalog under Apps for SharePoint.
4. If the package uses CDN assets, upload generated files from \`release/assets/\` to the CDN base path in \`config/write-manifests.json\`.
5. Deploy or trust the SharePoint package, then add or update the app on the target SharePoint site.
`
  );
}

export async function writeCdnHandoffReadme(dir, slug, cdnBasePath) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'README.md'),
    `# ${slug} CDN Handoff

Upload the contents of \`assets/\` to:

\`${cdnBasePath}\`

The SharePoint package in \`sharepoint/solution\` references this CDN path through \`config/write-manifests.json\`.
CDN upload is intentionally manual for v1.
`
  );
}

export async function writeReleaseReadme(dir, slug, cdnBasePath) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'README.md'),
    `# ${slug} Release

This folder contains CDN-ready assets and manifests generated by the app's production ship build.

CDN base path: \`${cdnBasePath}\`
`
  );
}

export function defaultClaude(slug, toolchain = 'heft') {
  const stack =
    toolchain === 'gulp'
      ? "Preserve the app's declared SPFx, React, and TypeScript versions and its legacy Gulp toolchain."
      : 'Use SPFx 1.23.2, React 17, TypeScript 5.8, and Heft.';
  return `# ${slug} SPFx Project Rules

- Use Node >=22.14.0 <23.0.0 and npm 10.
- ${stack}
- For CDN production packages, keep \`includeClientSideAssets=false\` and set \`cdnBasePath\` to your CDN URL for this app.
- Provision SharePoint lists and tenant resources manually; do not add PnP provisioning as a hidden build step.
- Keep production-consumed source under \`src/\`; do not add a top-level \`packages/\` workspace.
- Debug on a modern SharePoint page with the SPFx Debug Toolbar; do not depend on the hosted workbench.
`;
}
