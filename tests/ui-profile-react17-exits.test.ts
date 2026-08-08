import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { assertReact17Source } from '../packages/ui-profile/scripts/lib/profile.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = path.join(repositoryRoot, 'packages/ui-profile');
const require = createRequire(import.meta.url);
const vitestRoot = path.dirname(require.resolve('vitest/package.json'));
const baseUiRoot = path.dirname(require.resolve('@base-ui/react/package.json'));
const EXIT_HARNESS_OUTER_TIMEOUT_MS = 60_000;

describe('normalized React 17 first-PR component exits', () => {
  it('derives unsupported named and namespace APIs from the pinned React 17 declaration surface', () => {
    for (const source of [
      'import { cache } from "react"\ncache(async () => null)\n',
      'import * as React from "react"\nReact.useEffectEvent(() => undefined)\n',
      'import React = require("react")\nReact.useId()\n'
    ]) {
      expect(() => assertReact17Source(source, 'unsupported-react-api.ts')).toThrow(
        'outside the pinned React 17 compiler surface'
      );
    }
  });

  it('rejects local React namespace re-exports', () => {
    expect(() =>
      assertReact17Source('import * as React from "react"\nexport { React as Runtime }\n', 'namespace-reexport.ts')
    ).toThrow('local react namespace re-exports are not accepted');
    expect(() =>
      assertReact17Source('export import React = require("react")\nReact.createElement("div")\n', 'export-import.ts')
    ).toThrow('exported react ImportEqualsDeclaration namespaces are not accepted');
  });

  it('fails closed on undeclared React-family entrypoints and post-React-17 subpath APIs', () => {
    expect(() =>
      assertReact17Source(
        'import { renderToPipeableStream } from "react-dom/server"\nrenderToPipeableStream(null)\n',
        'streaming-server.ts'
      )
    ).toThrow('outside the pinned React 17 compiler surface');
    expect(() =>
      assertReact17Source('import { prerender } from "react-dom/static"\nprerender(null)\n', 'static-server.ts')
    ).toThrow('react-dom/static is outside the pinned React 17 declaration entrypoint inventory');
    expect(() => assertReact17Source('import { useId } from "react/experimental"\nuseId()\n', 'experimental-react.ts')).toThrow(
      'react/experimental is outside the pinned React 17 declaration entrypoint inventory'
    );
    expect(() =>
      assertReact17Source(
        'import { renderToString } from "react-dom/server.js"\nrenderToString(null as never)\n',
        'server-js-alias.ts'
      )
    ).toThrow('react-dom/server.js is a non-canonical React 17 entrypoint; use react-dom/server without the .js suffix');
  });

  it('accepts declaration-inventoried React 17 server and test-utils subpaths', () => {
    for (const [label, source] of [
      [
        'server.ts',
        'import { renderToString } from "react-dom/server"\nexport { renderToStaticMarkup } from "react-dom/server"\nrenderToString(null as never)\n'
      ],
      [
        'server-import-equals.ts',
        'import ReactDOMServer = require("react-dom/server")\nReactDOMServer.renderToString(null as never)\n'
      ],
      ['test-utils.ts', 'import * as ReactTestUtils from "react-dom/test-utils"\nReactTestUtils.act(() => undefined)\n']
    ]) {
      expect(() => assertReact17Source(source, label)).not.toThrow();
    }
  });

  it('accepts declaration-backed React 17 value and type APIs with classic JSX bindings', () => {
    for (const [label, source] of [
      ['named.ts', 'import { useEffect } from "react"\nuseEffect(() => undefined, [])\n'],
      [
        'namespace.ts',
        'import * as React from "react"\ntype Props = React.ComponentProps<"button">\nReact.createElement("button")\n'
      ],
      [
        'import-equals.tsx',
        'import React = require("react")\nexport const Example = () => <div />\nReact.useEffect(() => undefined, [])\n'
      ]
    ]) {
      expect(() => assertReact17Source(source, label)).not.toThrow();
    }
  });

  it(
    'passes the prepared package-local exit and exact-scale DOM harness without mutating the installed package',
    async () => {
      const installedPaths = [
        'select/value/SelectValue.d.ts',
        'select/value/SelectValue.d.mts',
        'utils/popups/popupStoreUtils.mjs',
        'utils/popups/popupStoreUtils.js'
      ];
      const installedBefore = await Promise.all(
        installedPaths.map((relativePath) => readFile(path.join(baseUiRoot, relativePath)))
      );
      const preparation = spawnSync(process.execPath, [path.join(profileRoot, 'scripts/prepare-base-ui.mjs')], {
        cwd: profileRoot,
        encoding: 'utf8',
        env: { ...process.env, CI: '1' }
      });
      const preparationMessage = `${preparation.stdout ?? ''}${preparation.stderr ?? ''}`;
      expect(preparation.status, `Isolated Base UI preparation failed:\n${preparationMessage}`).toBe(0);
      const installedAfter = await Promise.all(
        installedPaths.map((relativePath) => readFile(path.join(baseUiRoot, relativePath)))
      );
      for (const [index, before] of installedBefore.entries()) {
        expect(installedAfter[index].equals(before), `${installedPaths[index]} changed in node_modules`).toBe(true);
      }

      const result = spawnSync(
        process.execPath,
        [
          path.join(vitestRoot, 'vitest.mjs'),
          'run',
          '--config',
          path.join(repositoryRoot, 'tests/fixtures/ui-profile/vitest-react17-exits.config.mjs')
        ],
        { cwd: repositoryRoot, encoding: 'utf8', env: { ...process.env, CI: '1' } }
      );
      const message = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      expect(result.status, message).toBe(0);
      expect(message).toMatch(/20 passed/);
    },
    EXIT_HARNESS_OUTER_TIMEOUT_MS
  );
});
