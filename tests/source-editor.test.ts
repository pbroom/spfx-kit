import { describe, expect, it } from 'vitest';
import { getSourceDiagnostics, shouldCommitSource } from '../packages/source-editor-core/src';
import {
  SourceEditor,
  appendCssTarget,
  constrainFloatingRect,
  evaluateSourceTargetRename,
  getCssEditorTargetsForModel,
  isCloseShortcut,
  replaceCssTargetSelector,
  resizeFloatingRect,
  setCssEditorTargetsForModel
} from '../apps/lab/src/components/SourceEditor';
import {
  getCssEditorTargetsForModel as getProductionCssEditorTargetsForModel,
  setCssEditorTargetsForModel as setProductionCssEditorTargetsForModel
} from '../packages/source-editor-react/src/SourceEditorField';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('source editor state', () => {
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

  it('recognizes the editor close shortcut without intercepting modified variants', () => {
    expect(isCloseShortcut({ altKey: false, ctrlKey: true, key: 's', metaKey: false, shiftKey: false })).toBe(true);
    expect(isCloseShortcut({ altKey: false, ctrlKey: false, key: 'S', metaKey: true, shiftKey: false })).toBe(true);
    expect(isCloseShortcut({ altKey: false, ctrlKey: true, key: 's', metaKey: false, shiftKey: true })).toBe(false);
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
