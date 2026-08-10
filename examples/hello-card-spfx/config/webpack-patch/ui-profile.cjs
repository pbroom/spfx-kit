'use strict';

const configureSpfxUiProfileCss = require('@spfx-kit/ui-profile/spfx-webpack');

module.exports = function patchUiProfileCss(webpackConfiguration) {
  return configureSpfxUiProfileCss(webpackConfiguration);
};
