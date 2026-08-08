'use strict';

const path = require('node:path');

const configureSpfxUiProfileCss = require('../../../../packages/ui-profile/spfx-ui-webpack.cjs');

module.exports = function patchUiProfileCss(webpackConfiguration) {
  return configureSpfxUiProfileCss(webpackConfiguration, {
    packageRoot: path.resolve(__dirname, '../../../../packages/ui-profile')
  });
};
