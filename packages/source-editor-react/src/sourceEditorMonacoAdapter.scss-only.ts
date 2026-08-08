import type * as BundledMonaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { SourceEditorLanguage } from './sourceEditorCore';

type MonacoApi = typeof BundledMonaco;

export interface SourceEditorMonacoAdapter {
  load: (language: SourceEditorLanguage) => Promise<MonacoApi>;
}

export const defaultSourceEditorMonacoAdapter: SourceEditorMonacoAdapter = {
  async load(language) {
    if (language !== 'scss') {
      throw new Error('The SCSS-only source editor profile does not include HTML language support.');
    }
    await import(
      /* webpackChunkName: "source-editor-monaco" */
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore Monaco's ESM core-feature entrypoint is runtime-only and has no declaration file.
      'monaco-editor/esm/vs/editor/edcore.main.js'
    );
    const monaco = await import(
      /* webpackChunkName: "source-editor-monaco" */
      'monaco-editor/esm/vs/editor/editor.api'
    );
    await import(
      /* webpackChunkName: "source-editor-monaco" */
      'monaco-editor/esm/vs/basic-languages/scss/scss.contribution'
    );
    return monaco;
  }
};
