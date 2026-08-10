'use strict';

const path = require('node:path');
const { resolveUiProfileDeliveryArtifact: resolveArtifact } = require('./scripts/lib/delivery-artifact.cjs');

function resolveUiProfileDeliveryArtifact(options = {}) {
  return resolveArtifact({ packageRoot: path.resolve(options.packageRoot || __dirname) });
}

module.exports = { resolveUiProfileDeliveryArtifact };
