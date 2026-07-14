export const DEFAULT_SPFX_VERSION = '1.23.2';
export const DEFAULT_NODE_VERSION = '22.22.3';
export const DEFAULT_NODE_RANGE = '>=22.14.0 <23.0.0';
export const DEFAULT_REACT_VERSION = '17.0.1';
export const DEFAULT_TYPESCRIPT_VERSION = '~5.8.0';
export const DEFAULT_HEFT_VERSION = '1.2.17';

export const SPFX_RUNTIME_DEPENDENCIES = Object.freeze({
  '@microsoft/sp-component-base': DEFAULT_SPFX_VERSION,
  '@microsoft/sp-core-library': DEFAULT_SPFX_VERSION,
  '@microsoft/sp-lodash-subset': DEFAULT_SPFX_VERSION,
  '@microsoft/sp-office-ui-fabric-core': DEFAULT_SPFX_VERSION,
  '@microsoft/sp-property-pane': DEFAULT_SPFX_VERSION,
  '@microsoft/sp-webpart-base': DEFAULT_SPFX_VERSION
});

export const SPFX_HEFT_DEV_DEPENDENCIES = Object.freeze({
  '@microsoft/eslint-config-spfx': DEFAULT_SPFX_VERSION,
  '@microsoft/eslint-plugin-spfx': DEFAULT_SPFX_VERSION,
  '@microsoft/sp-module-interfaces': DEFAULT_SPFX_VERSION,
  '@microsoft/spfx-heft-plugins': DEFAULT_SPFX_VERSION,
  '@microsoft/spfx-web-build-rig': DEFAULT_SPFX_VERSION,
  '@rushstack/heft': DEFAULT_HEFT_VERSION,
  '@types/jest': '30.0.0',
  '@types/react': '17.0.45',
  '@types/react-dom': '17.0.17',
  '@types/webpack-env': '~1.15.2',
  'css-loader': '~7.1.2',
  eslint: '9.37.0',
  'eslint-plugin-react-hooks': '5.2.0',
  typescript: DEFAULT_TYPESCRIPT_VERSION
});

export function labAdapterTsconfig() {
  return {
    compilerOptions: {
      target: 'ES2020',
      lib: ['DOM', 'DOM.Iterable', 'ES2020'],
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      isolatedModules: true,
      noEmit: true,
      jsx: 'react'
    },
    include: ['./**/*.ts', './**/*.tsx']
  };
}
