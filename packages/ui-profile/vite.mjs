import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spfxUiProfileDeliveryPlugin, UI_PROFILE_DELIVERY_MODULE_ID } from './scripts/lib/vite-delivery-plugin.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Returns the Vite delivery plugin and the reviewed Base UI compatibility alias.
 * Call the package's `profile:prepare:base-ui` script before starting Vite.
 */
export function spfxUiProfileVite(options = {}) {
  const resolvedPackageRoot = path.resolve(options.packageRoot || packageRoot);
  return Object.freeze({
    alias: Object.freeze({
      '@base-ui/react': path.join(resolvedPackageRoot, '.prepared', 'base-ui')
    }),
    deliveryPlugin: spfxUiProfileDeliveryPlugin({ packageRoot: resolvedPackageRoot })
  });
}

export { UI_PROFILE_DELIVERY_MODULE_ID };
