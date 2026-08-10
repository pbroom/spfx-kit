import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveUiProfileDeliveryArtifact as resolveArtifact } from './scripts/lib/delivery-artifact.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export function resolveUiProfileDeliveryArtifact(options = {}) {
  return resolveArtifact({ packageRoot: path.resolve(options.packageRoot || packageRoot) });
}
