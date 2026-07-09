#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs, required } from '../lib/args.mjs';
import { writeAppRepoFiles } from '../lib/app-repo-files.mjs';
import { exists, managedAppDir, writeJson } from '../lib/fs.mjs';
import { cdnBasePathForSlug } from '../lib/spfx.mjs';

const usage = `Usage:
  create-spfx-app --name <slug> --title <title> --webpart <name> [--force]`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = required(args, 'name', usage);
  const title = required(args, 'title', usage);
  const webpart = required(args, 'webpart', usage);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('--name must be a lowercase slug using letters, numbers, and hyphens.');
  }
  const slug = name.endsWith('-spfx') ? name : `${name}-spfx`;
  const webPartName = toPascal(webpart);
  const rootDir = process.cwd();
  const appDir = managedAppDir(rootDir, slug);
  if ((await exists(appDir)) && !args.force) {
    throw new Error(`Refusing to overwrite existing app: ${appDir}. Pass --force to replace it.`);
  }
  if (args.force) {
    await rm(appDir, { recursive: true, force: true });
  }

  await mkdir(path.join(appDir, 'config'), { recursive: true });
  await mkdir(path.join(appDir, 'src', 'webparts', camel(webPartName), 'loc'), { recursive: true });
  await mkdir(path.join(appDir, '.spfx-kit', 'lab'), { recursive: true });
  await mkdir(path.join(appDir, 'cdn-handoff'), { recursive: true });
  await mkdir(path.join(appDir, 'release'), { recursive: true });
  await mkdir(path.join(appDir, 'sharepoint', 'solution'), { recursive: true });

  const solutionId = cryptoRandomUuid();
  const featureId = cryptoRandomUuid();
  const componentId = cryptoRandomUuid();
  const bundleName = kebab(webPartName);
  const webPartDir = `src/webparts/${camel(webPartName)}`;

  await writeJson(path.join(appDir, 'package.json'), packageJson(slug));
  await writeJson(path.join(appDir, '.yo-rc.json'), yoRc(slug, title, solutionId));
  await writeJson(path.join(appDir, 'config', 'config.json'), configJson(bundleName, webPartName));
  await writeJson(path.join(appDir, 'config', 'package-solution.json'), packageSolution(title, solutionId, featureId, slug));
  await writeJson(path.join(appDir, 'config', 'write-manifests.json'), { $schema: 'https://developer.microsoft.com/json-schemas/spfx-build/write-manifests.schema.json', cdnBasePath: cdnBasePathForSlug(slug) });
  await writeJson(path.join(appDir, 'config', 'serve.json'), serveJson());
  await writeJson(path.join(appDir, 'config', 'deploy-azure-storage.json'), deployJson());
  await writeJson(path.join(appDir, 'tsconfig.json'), tsconfig());
  await writeFile(path.join(appDir, 'gulpfile.js'), "'use strict';\nconst build = require('@microsoft/sp-build-web');\nbuild.initialize(require('gulp'));\n");
  await writeFile(path.join(appDir, 'CLAUDE.md'), claude(slug));
  await writeFile(path.join(appDir, 'cdn-handoff', 'README.md'), cdnReadme(slug));
  await writeFile(path.join(appDir, 'release', 'README.md'), releaseReadme(slug));
  await writeFile(path.join(appDir, 'README.md'), `# ${title}\n\nSPFx 1.21.1 web part project managed by SPFx Kit.\n`);
  await writeJson(path.join(appDir, `${webPartDir}/${webPartName}.manifest.json`), manifest(componentId, title, webPartName));
  await writeFile(path.join(appDir, `${webPartDir}/${webPartName}.ts`), webPartSource(webPartName, title));
  await writeFile(path.join(appDir, `${webPartDir}/loc/en-us.js`), "define([], function() { return { PropertyPaneDescription: 'Configure this web part.', TitleFieldLabel: 'Title' }; });\n");
  await writeFile(path.join(appDir, `${webPartDir}/loc/mystrings.d.ts`), "declare interface IWebPartStrings { PropertyPaneDescription: string; TitleFieldLabel: string; }\ndeclare module 'WebPartStrings' { const strings: IWebPartStrings; export = strings; }\n");
  await writeFile(path.join(appDir, '.spfx-kit', 'lab', 'register.tsx'), labAdapter(slug, title, webPartName));
  await writeFile(path.join(appDir, '.spfx-kit', 'lab', `${camel(webPartName)}Lab.css`), `.spfx-kit-created-webpart { font-family: "Segoe UI", sans-serif; }\n`);
  await writeAppRepoFiles(appDir);

  console.log(`Created ${path.relative(rootDir, appDir).replace(/\\/g, '/')}`);
}

function packageJson(slug) {
  return {
    name: `@spfx-kit/${slug}`,
    version: '0.1.0',
    private: true,
    engines: { node: '>=22.14.0 <23.0.0' },
    main: 'lib/index.js',
    scripts: {
      build: 'gulp bundle',
      clean: 'gulp clean',
      test: 'gulp test',
      serve: 'gulp serve',
      ship: 'gulp clean && gulp bundle --ship && gulp package-solution --ship'
    },
    dependencies: {
      '@fluentui/react-components': '9.74.1',
      '@microsoft/sp-core-library': '1.21.1',
      '@microsoft/sp-property-pane': '1.21.1',
      '@microsoft/sp-webpart-base': '1.21.1',
      react: '17.0.1',
      'react-dom': '17.0.1',
      tslib: '2.3.1'
    },
    devDependencies: {
      '@microsoft/eslint-config-spfx': '1.21.1',
      '@microsoft/eslint-plugin-spfx': '1.21.1',
      '@microsoft/rush-stack-compiler-5.3': '0.1.0',
      '@microsoft/sp-build-web': '1.21.1',
      '@microsoft/sp-module-interfaces': '1.21.1',
      '@rushstack/eslint-config': '4.3.0',
      '@types/react': '17.0.45',
      '@types/react-dom': '17.0.17',
      '@types/webpack-env': '1.18.8',
      ajv: '6.15.0',
      eslint: '8.57.1',
      'eslint-plugin-react-hooks': '4.6.2',
      gulp: '4.0.2',
      typescript: '5.3.3'
    }
  };
}

function yoRc(slug, title, id) {
  return {
    '@microsoft/generator-sharepoint': {
      plusBeta: false,
      isCreatingSolution: true,
      nodeVersion: '22.14.0',
      version: '1.21.1',
      libraryName: slug,
      libraryId: id,
      environment: 'spo',
      packageManager: 'npm',
      solutionName: title,
      solutionShortDescription: title,
      skipFeatureDeployment: false,
      isDomainIsolated: false,
      componentType: 'webpart'
    }
  };
}

function configJson(bundleName, webPartName) {
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/spfx-build/config.2.0.schema.json',
    version: '2.0',
    bundles: {
      [bundleName]: {
        components: [
          {
            entrypoint: `./lib/webparts/${camel(webPartName)}/${webPartName}.js`,
            manifest: `./src/webparts/${camel(webPartName)}/${webPartName}.manifest.json`
          }
        ]
      }
    },
    externals: {},
    localizedResources: {
      WebPartStrings: `lib/webparts/${camel(webPartName)}/loc/{locale}.js`
    }
  };
}

function packageSolution(title, solutionId, featureId, slug) {
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/spfx-build/package-solution.schema.json',
    solution: {
      name: title,
      id: solutionId,
      version: '0.1.0.0',
      includeClientSideAssets: false,
      skipFeatureDeployment: false,
      isDomainIsolated: false,
      features: [{ title: `${title} Feature`, description: `Activates ${title}.`, id: featureId, version: '0.1.0.0' }]
    },
    paths: { zippedPackage: `solution/${slug.replace(/-spfx$/, '')}.sppkg` }
  };
}

function serveJson() {
  return { $schema: 'https://developer.microsoft.com/json-schemas/core-build/serve.schema.json', port: 4321, https: true, initialPage: 'https://{tenantDomain}/_layouts/workbench.aspx' };
}

function deployJson() {
  return { $schema: 'https://developer.microsoft.com/json-schemas/core-build/deploy-azure-storage.schema.json', workingDir: './release/assets/', account: '', container: '', accessKey: '' };
}

function tsconfig() {
  return {
    extends: './node_modules/@microsoft/rush-stack-compiler-5.3/includes/tsconfig-web.json',
    compilerOptions: {
      target: 'es2017',
      forceConsistentCasingInFileNames: true,
      module: 'esnext',
      moduleResolution: 'node',
      jsx: 'react',
      declaration: true,
      sourceMap: true,
      experimentalDecorators: true,
      skipLibCheck: true,
      outDir: 'lib',
      rootDir: 'src',
      inlineSources: false,
      noImplicitAny: true,
      typeRoots: ['./node_modules/@types', './node_modules/@microsoft'],
      types: ['webpack-env'],
      lib: ['es2017', 'dom', 'dom.iterable', 'esnext']
    },
    include: ['src/**/*.ts', 'src/**/*.tsx']
  };
}

function manifest(id, title, webPartName) {
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/spfx/client-side-web-part-manifest.schema.json',
    id,
    alias: webPartName,
    componentType: 'WebPart',
    version: '*',
    manifestVersion: 2,
    requiresCustomScript: false,
    supportedHosts: ['SharePointWebPart'],
    supportsThemeVariants: true,
    preconfiguredEntries: [
      {
        groupId: '5c03119e-3074-46fd-976b-c60198311f70',
        group: { default: 'Advanced' },
        title: { default: title },
        description: { default: title },
        officeFabricIconFontName: 'Page',
        properties: { title }
      }
    ]
  };
}

function webPartSource(webPartName, title) {
  return `import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { FluentProvider, Text, webLightTheme } from '@fluentui/react-components';
import * as strings from 'WebPartStrings';

export interface I${webPartName}Props { title: string; }

const ${webPartName}: React.FunctionComponent<I${webPartName}Props> = ({ title }) =>
  React.createElement(
    FluentProvider,
    { theme: webLightTheme },
    React.createElement(
      'section',
      { style: { fontFamily: '"Segoe UI", sans-serif', padding: 16 } },
      React.createElement(Text, { as: 'h2', size: 500, weight: 'semibold' }, title || ${JSON.stringify(title)})
    )
  );

export default class ${webPartName}WebPart extends BaseClientSideWebPart<I${webPartName}Props> {
  public render(): void {
    ReactDom.render(React.createElement(${webPartName}, { title: this.properties.title }), this.domElement);
  }
  protected onDispose(): void { ReactDom.unmountComponentAtNode(this.domElement); }
  protected get dataVersion(): Version { return Version.parse('1.0'); }
  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return { pages: [{ header: { description: strings.PropertyPaneDescription }, groups: [{ groupName: 'Display', groupFields: [PropertyPaneTextField('title', { label: strings.TitleFieldLabel })] }] }] };
  }
}
`;
}

function labAdapter(slug, title, webPartName) {
  return `import * as React from 'react';
import type { LabPropertyBag, LabRenderProps, LabWebPart, LabWebPartRegistry } from '@spfx-kit/spfx-lab-runtime';
import './${camel(webPartName)}Lab.css';

type CreatedLabProps = LabPropertyBag & { title: string };

const defaultProps: CreatedLabProps = { title: ${JSON.stringify(title)} };

const Preview: React.FunctionComponent<LabRenderProps<CreatedLabProps>> = ({ props }) => (
  <section className="spfx-kit-created-webpart">
    <h2>{props.title}</h2>
  </section>
);

const webPart: LabWebPart<CreatedLabProps> = {
  id: '${slug}:default',
  appId: '${slug}',
  title: ${JSON.stringify(title)},
  description: 'New SPFx web part.',
  defaultProps,
  controls: [{ type: 'text', name: 'title', label: 'Title' }],
  render: Preview
};

export function register(registry: LabWebPartRegistry): void {
  registry.register(webPart);
}
`;
}

function claude(slug) {
  return `# ${slug} SPFx Project Rules

- Use Node >=22.14.0 <23.0.0, npm 10, SPFx 1.21.1, React 17, TypeScript 5.3.3, and gulp 4.
- Keep production-consumed code under src/.
- CDN production packages use includeClientSideAssets=false and ${cdnBasePathForSlug(slug)}.
- Provision SharePoint lists manually; do not add hidden PnP provisioning.
`;
}

function cdnReadme(slug) {
  return `# ${slug} CDN Handoff

Upload release assets to ${cdnBasePathForSlug(slug)}.
`;
}

function releaseReadme(slug) {
  return `# ${slug} Release

Generated ship output is copied here by SPFx Kit exports.

CDN base path: ${cdnBasePathForSlug(slug)}
`;
}

function toPascal(value) {
  return value.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('') || 'SpfxWebPart';
}

function camel(value) {
  const pascal = toPascal(value);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

function kebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function cryptoRandomUuid() {
  return randomUUID();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
