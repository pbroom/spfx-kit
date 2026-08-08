'use strict';

const configureSpfxUiProfileCss = require('./spfx-ui-webpack.cjs');

module.exports = function registerSpfxUiProfileGulp(build, options = {}) {
  const mergeConfig = build && build.configureWebpack && build.configureWebpack.mergeConfig;
  if (typeof mergeConfig !== 'function') {
    throw new Error('SPFx Gulp build does not expose configureWebpack.mergeConfig.');
  }
  mergeConfig.call(build.configureWebpack, {
    additionalConfiguration(webpackConfiguration) {
      return configureSpfxUiProfileCss(webpackConfiguration, options);
    }
  });
};
