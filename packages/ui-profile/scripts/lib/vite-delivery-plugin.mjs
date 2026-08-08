import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveUiProfileDeliveryArtifact } from './delivery-artifact.mjs';

export const UI_PROFILE_DELIVERY_MODULE_ID = 'virtual:spfx-ui-profile-delivery';
const RESOLVED_MODULE_ID = `\0${UI_PROFILE_DELIVERY_MODULE_ID}`;

export function spfxUiProfileDeliveryPlugin(options = {}) {
  const defaultPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const packageRoot = path.resolve(options.packageRoot || defaultPackageRoot);

  return {
    name: 'spfx-ui-profile-delivery',
    enforce: 'pre',
    resolveId(source) {
      return source === UI_PROFILE_DELIVERY_MODULE_ID ? RESOLVED_MODULE_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_MODULE_ID) return null;
      const artifact = await resolveUiProfileDeliveryArtifact({ packageRoot });
      return [
        `import ${JSON.stringify(artifact.cssPath)};`,
        `export const profileId = ${JSON.stringify(artifact.profileId)};`,
        `export const profileSha256 = ${JSON.stringify(artifact.profileSha256)};`,
        `export const provenanceSha256 = ${JSON.stringify(artifact.provenanceSha256)};`,
        `export const cssSha256 = ${JSON.stringify(artifact.cssSha256)};`,
        `export const scopeValue = ${JSON.stringify(artifact.scopeValue)};`,
        ''
      ].join('\n');
    }
  };
}
