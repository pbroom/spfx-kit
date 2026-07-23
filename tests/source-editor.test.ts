import { describe, expect, it } from 'vitest';
import { getSourceDiagnostics, shouldCommitSource } from '../packages/source-editor-core/src';
import {
  SourceEditor,
  appendCssTarget,
  constrainFloatingRect,
  createSourceEditorSuggestions,
  evaluateSourceTargetRename,
  getCssEditorTargetsForModel,
  isCloseShortcut,
  replaceCssTargetSelector,
  resizeFloatingRect,
  setCssEditorTargetsForModel,
  shouldCollapseShortcutToolbar,
  sourceEditorAcceptSuggestionOnEnter,
  sourceEditorCompletionTriggerCharacters,
  sourceEditorTabCompletion
} from '../apps/lab/src/components/SourceEditor';
import { SourceWorkspaceField as ProductionSourceWorkspace } from '../packages/source-editor-react/src/SourceWorkspaceField';
import {
  SourceEditorField as ProductionSourceEditor,
  createSourceEditorSuggestions as createProductionSourceEditorSuggestions,
  getCssEditorTargetsForModel as getProductionCssEditorTargetsForModel,
  setCssEditorTargetsForModel as setProductionCssEditorTargetsForModel,
  shouldCollapseShortcutToolbar as shouldCollapseProductionShortcutToolbar,
  sourceEditorAcceptSuggestionOnEnter as productionSourceEditorAcceptSuggestionOnEnter,
  sourceEditorCompletionTriggerCharacters as productionSourceEditorCompletionTriggerCharacters,
  sourceEditorTabCompletion as productionSourceEditorTabCompletion
} from '../packages/source-editor-react/src/SourceEditorField';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('source editor state', () => {
  it('collapses shortcut tokens only when their measured width exceeds the toolbar', () => {
    expect(shouldCollapseShortcutToolbar(640, 640)).toBe(false);
    expect(shouldCollapseShortcutToolbar(640, 641)).toBe(true);
    expect(shouldCollapseProductionShortcutToolbar(640, 641)).toBe(true);
  });

  it('adds a UTF-8 byte limit diagnostic', () => {
    expect(getSourceDiagnostics('éé', 3)).toEqual([
      {
        level: 'error',
        message: 'Source is larger than the 3 bytes limit.'
      }
    ]);
  });

  it('combines validator and byte-limit diagnostics', () => {
    const diagnostics = getSourceDiagnostics('hello', 4, () => [{ level: 'warning', message: 'Review the source.' }]);
    expect(diagnostics).toEqual([
      { level: 'warning', message: 'Review the source.' },
      { level: 'error', message: 'Source is larger than the 4 bytes limit.' }
    ]);
  });

  it('keeps valid-only drafts out of the committed value', () => {
    expect(shouldCommitSource('valid', [{ level: 'error', message: 'Invalid template.' }])).toBe(false);
    expect(shouldCommitSource('valid', [{ level: 'warning', message: 'Review this template.' }])).toBe(true);
    expect(shouldCommitSource('immediate', [{ level: 'error', message: 'Invalid template.' }])).toBe(true);
  });

  it('keeps the fallback textarea available until Monaco mounts', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SourceEditor, {
        label: 'Template HTML',
        language: 'html',
        placeholder: 'Add four template fragments',
        value: '<article>{{item.title}}</article>',
        onChange: () => undefined
      })
    );

    expect(markup).toContain('aria-label="Template HTML"');
    expect(markup).toContain('placeholder="Add four template fragments"');
    expect(markup).toContain('&lt;article&gt;{{item.title}}&lt;/article&gt;');
  });

  it('hides inline guidance when the editor is embedded in a floating workspace', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SourceEditor, {
        description: 'Inline-only guidance.',
        embedded: true,
        fillHeight: true,
        label: 'Template HTML',
        language: 'html',
        showShortcuts: true,
        value: '<article>{{item.title}}</article>',
        onChange: () => undefined
      })
    );

    expect(markup).not.toContain('Inline-only guidance.');
    expect(markup).toContain('css-editor-field--fill');

    const productionMarkup = renderToStaticMarkup(
      React.createElement(ProductionSourceEditor, {
        embedded: true,
        fillHeight: true,
        label: 'Template HTML',
        language: 'html',
        value: '<article>{{item.title}}</article>',
        onChange: () => undefined
      })
    );
    expect(productionMarkup).toContain('style="height:100%;width:100%"');
    expect(productionMarkup).toContain('.bt-floating-editor__toolbar-items-viewport {\n  min-width: 0;\n  overflow: hidden;');
    expect(productionMarkup).not.toContain('overflow-x: auto;');
    expect(productionMarkup).toContain('max-height: min(320px, calc(100vh - 32px));');
    expect(productionMarkup).toContain('overflow-y: auto;');
    expect(productionMarkup).toContain('overscroll-behavior: contain;');
    expect(productionMarkup).toContain('background: #0f172a;');
    expect(productionMarkup).toContain(
      '.bt-floating-editor__shortcut-menu-trigger {\n  min-width: 0;\n  min-height: 28px;\n  column-gap: 6px;'
    );
    expect(productionMarkup).toContain('border-radius: 6px;\n  padding: 4px 8px;');
    expect(productionMarkup).toContain('.bt-floating-editor__shortcut-menu-trigger.fui-MenuButton:hover:active,');
    expect(productionMarkup).toContain('border-radius: 4px;\n  padding: 4px 8px;\n  color: #f8fafc;');
    expect(productionMarkup).toContain('font-size: 12px;\n  line-height: 16px;\n  opacity: 1;');
  });

  it('recognizes the editor close shortcut without intercepting modified variants', () => {
    expect(isCloseShortcut({ altKey: false, ctrlKey: true, key: 's', metaKey: false, shiftKey: false })).toBe(true);
    expect(isCloseShortcut({ altKey: false, ctrlKey: false, key: 'S', metaKey: true, shiftKey: false })).toBe(true);
    expect(isCloseShortcut({ altKey: false, ctrlKey: true, key: 's', metaKey: false, shiftKey: true })).toBe(false);
  });

  it('accepts visible completions without triggering suggestions on every newline', () => {
    expect(sourceEditorAcceptSuggestionOnEnter).toBe('on');
    expect(sourceEditorCompletionTriggerCharacters).not.toContain('\n');
    expect(sourceEditorTabCompletion).toBe('on');
    expect(productionSourceEditorAcceptSuggestionOnEnter).toBe('on');
    expect(productionSourceEditorCompletionTriggerCharacters).not.toContain('\n');
    expect(productionSourceEditorTabCompletion).toBe('on');
  });

  it('inserts and renames SCSS targets without changing similarly named selectors', () => {
    const target = { label: 'Item', selector: '.item', snippet: '.item {\n  color: red;\n}' };
    const inserted = appendCssTarget('', target, '/* Better Divider SCSS targets */');

    expect(inserted).toContain(target.snippet);
    expect(replaceCssTargetSelector('.item {}\n.item-child {}', '.item', '.card')).toBe('.card {}\n.item-child {}');
  });

  it('deduplicates the configured SCSS target comment without relying on app-specific text', () => {
    const target = { label: 'Card', selector: '.card', snippet: '.card {\n  display: grid;\n}' };
    const comment = '/* Better Text SCSS targets */';
    const once = appendCssTarget('.existing {}', target, comment);
    const twice = appendCssTarget(once, { ...target, selector: '.card-2', snippet: '.card-2 {}' }, comment);

    expect(twice.match(/Better Text SCSS targets/g)).toHaveLength(1);
  });

  it('rejects a valid-only target rename atomically when the resulting source is invalid', () => {
    const source = '.card {}';
    const rejected = evaluateSourceTargetRename(source, '.card', '.renamed-card', 'valid', undefined, () => [
      { level: 'error', message: 'Invalid source.' }
    ]);
    const accepted = evaluateSourceTargetRename(source, '.card', '.renamed-card', 'valid');

    expect(rejected).toEqual({ value: '.renamed-card {}', shouldCommit: false });
    expect(accepted).toEqual({ value: '.renamed-card {}', shouldCommit: true });
  });

  it('keeps SCSS completion targets isolated by Monaco model', () => {
    const dividerModel = {};
    const textModel = {};
    const dividerTargets = [{ label: 'Line', selector: '.line', snippet: '.line {}' }];
    const textTargets = [{ label: 'Text', selector: '.text', snippet: '.text {}' }];
    const dividerTargetsRef = { current: dividerTargets };
    const textTargetsRef = { current: textTargets };

    setCssEditorTargetsForModel(dividerModel, dividerTargetsRef);
    setCssEditorTargetsForModel(textModel, textTargetsRef);

    expect(getCssEditorTargetsForModel(dividerModel)).toBe(dividerTargets);
    expect(getCssEditorTargetsForModel(textModel)).toBe(textTargets);
    expect(getCssEditorTargetsForModel({})).toEqual([]);

    const renamedTargets = [{ label: 'Line', selector: '.renamed-line', snippet: '.renamed-line {}' }];
    dividerTargetsRef.current = renamedTargets;
    expect(getCssEditorTargetsForModel(dividerModel)).toBe(renamedTargets);

    const productionModel = {};
    const productionTargetsRef = { current: textTargets };
    setProductionCssEditorTargetsForModel(productionModel, productionTargetsRef);
    expect(getProductionCssEditorTargetsForModel(productionModel)).toBe(textTargets);
    productionTargetsRef.current = renamedTargets;
    expect(getProductionCssEditorTargetsForModel(productionModel)).toBe(renamedTargets);
  });

  it('offers selector, property, and color completions for SCSS editing', () => {
    const monaco = {
      languages: {
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
        CompletionItemKind: { Class: 5, Property: 9, Value: 12 }
      }
    };
    const range = {
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 1,
      endColumn: 5
    };
    const suggestions = createSourceEditorSuggestions(monaco, range, [
      { label: 'Web part', selector: '.better-list', snippet: '.better-list {\n  $0\n}' }
    ]);

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '.better-list', kind: 5, range }),
        expect.objectContaining({ label: 'background', kind: 9, range }),
        expect.objectContaining({ label: '#0f6cbd', kind: 12, range })
      ])
    );
    expect(
      createProductionSourceEditorSuggestions(monaco, range, [
        { label: 'Web part', selector: '.better-list', snippet: '.better-list {\n  $0\n}' }
      ])
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '.better-list', kind: 5, range }),
        expect.objectContaining({ label: 'background', kind: 9, range }),
        expect.objectContaining({ label: '#0f6cbd', kind: 12, range })
      ])
    );
  });

  it('renders one inline source workspace without exposing the pop-out-only split view', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProductionSourceWorkspace, {
        label: 'Styles & template',
        description: 'Edit both sources together.',
        documents: [
          {
            id: 'scss',
            label: 'CSS/SCSS',
            language: 'scss',
            value: '.better-list {}',
            onChange: () => undefined
          },
          {
            id: 'html',
            label: 'HTML template',
            language: 'html',
            value: '<template data-bl-fragment="item"></template>',
            onChange: () => undefined
          }
        ]
      })
    );

    expect(markup.match(/>Pop out</g)).toHaveLength(1);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('>CSS/SCSS</button>');
    expect(markup).toContain('>HTML template</button>');
    expect(markup).not.toContain('aria-label="Split"');
    expect(markup).not.toContain('title="Split view"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('justify-self: start;');
    expect(markup).toContain('width: fit-content;');
    expect(markup).toContain('.bt-source-workspace--floating .bt-source-workspace__tabs {');
    expect(markup).toContain('border: 0;');
    expect(markup).toContain('background: transparent;');
    expect(markup).toContain(
      '.bt-source-workspace--floating .bt-css-editor--fill &gt; .bt-floating-editor__toolbar {\n  margin-block-end: -6px;'
    );
    expect(markup).toContain('.bt-source-workspace__pane {\n  display: grid;\n  grid-template-rows: minmax(0, 1fr);');
    expect(markup).toContain(
      '.bt-source-workspace__body--split .bt-source-workspace__pane {\n  grid-template-rows: auto minmax(0, 1fr);'
    );
  });

  it('keeps floating drag and resize geometry inside viewport bounds', () => {
    expect(
      constrainFloatingRect({
        left: -50,
        top: -20,
        width: 2000,
        height: 1200
      })
    ).toEqual({ left: 8, top: 8, width: 1264, height: 784 });

    const resized = resizeFloatingRect({ left: 100, top: 100, width: 500, height: 400 }, 1000, 1000, 'se');
    expect(resized).toEqual({ left: 8, top: 8, width: 1264, height: 784 });
  });
});
