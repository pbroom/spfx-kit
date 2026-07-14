const TOOLCHAIN_PACKAGES = {
  heft: ['@microsoft/spfx-web-build-rig', '@microsoft/spfx-heft-plugins'],
  gulp: ['@microsoft/sp-build-web']
};

const COMMON_REQUIRED_FILES = [
  'package.json',
  'tsconfig.json',
  'config/config.json',
  'config/package-solution.json',
  'config/write-manifests.json',
  'config/serve.json'
];

const TOOLCHAIN_REQUIRED_FILES = {
  gulp: ['gulpfile.js'],
  heft: ['config/rig.json', 'config/typescript.json']
};

export function detectSpfxToolchain(packageJson) {
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };

  const matches = Object.entries(TOOLCHAIN_PACKAGES)
    .filter(([, packages]) => packages.some((name) => dependencies[name]))
    .map(([toolchain]) => toolchain);

  if (matches.length > 1) {
    return 'ambiguous';
  }
  return matches[0] || 'unknown';
}

export function requiredSpfxFiles(toolchain) {
  if (toolchain === 'ambiguous') {
    return [...COMMON_REQUIRED_FILES, ...TOOLCHAIN_REQUIRED_FILES.gulp, ...TOOLCHAIN_REQUIRED_FILES.heft];
  }
  return [...COMMON_REQUIRED_FILES, ...(TOOLCHAIN_REQUIRED_FILES[toolchain] || [])];
}

export function spfxVersionFromPackage(packageJson) {
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };

  return (
    dependencies['@microsoft/sp-core-library'] ||
    dependencies['@microsoft/sp-webpart-base'] ||
    dependencies['@microsoft/spfx-web-build-rig'] ||
    dependencies['@microsoft/sp-build-web']
  );
}
