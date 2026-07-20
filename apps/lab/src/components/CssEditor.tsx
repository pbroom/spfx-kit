import * as React from 'react';
import { CssEditorTarget, SourceEditor } from './SourceEditor';

const defaultCssTargetComment = `/*
Better Divider SCSS targets:
:host - web part host element.
.better-divider - wrapper for alignment and vertical spacing.
.better-divider__line - visible divider line, width, color, stroke, and rounded ends.
*/`;

const defaultCssEditorTargets: CssEditorTarget[] = [
  {
    label: ':host',
    selector: ':host',
    snippet: ':host {\n  display: block;\n}'
  },
  {
    label: '.better-divider',
    selector: '.better-divider',
    snippet: '.better-divider {\n  justify-content: center;\n  padding-block: 16px;\n}'
  },
  {
    label: '.better-divider__line',
    selector: '.better-divider__line',
    snippet:
      '.better-divider__line {\n  width: 100%;\n  height: 1px;\n  background: #8a8886;\n  border-radius: 0;\n  border: 0;\n}'
  }
];

interface CssEditorProps {
  label: string;
  value: string;
  description?: string;
  placeholder?: string;
  minHeight?: number;
  monacoBaseUrl?: string;
  targets?: CssEditorTarget[];
  targetComment?: string;
  onChange: (value: string) => void;
  onTargetRename?: (target: CssEditorTarget, nextSelector: string, nextValue: string) => void;
}

export function CssEditor(props: CssEditorProps): JSX.Element {
  return (
    <SourceEditor
      {...props}
      language="scss"
      targetComment={props.targetComment ?? defaultCssTargetComment}
      targets={props.targets ?? defaultCssEditorTargets}
    />
  );
}
