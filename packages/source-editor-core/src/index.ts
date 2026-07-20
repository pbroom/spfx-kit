export type SourceEditorLanguage = 'scss' | 'html';
export type SourceEditorCommitMode = 'immediate' | 'valid';

export interface SourceEditorDiagnostic {
  level: 'warning' | 'error';
  message: string;
}

export interface SourceEditorSnippet {
  label: string;
  snippet: string;
  searchText?: string;
}

export type SourceEditorValidator = (value: string) => SourceEditorDiagnostic[];

export function measureSourceBytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function getSourceDiagnostics(
  value: string,
  maxBytes: number | undefined,
  validate?: SourceEditorValidator
): SourceEditorDiagnostic[] {
  const diagnostics = validate ? validate(value) : [];
  if (maxBytes && measureSourceBytes(value) > maxBytes) {
    return [
      ...diagnostics,
      {
        level: 'error',
        message: `Source is larger than the ${formatByteLimit(maxBytes)} limit.`
      }
    ];
  }
  return diagnostics;
}

export function shouldCommitSource(
  commitMode: SourceEditorCommitMode | undefined,
  diagnostics: readonly SourceEditorDiagnostic[]
): boolean {
  return commitMode !== 'valid' || !diagnostics.some((diagnostic) => diagnostic.level === 'error');
}

function formatByteLimit(value: number): string {
  if (value < 1024) {
    return `${value} byte${value === 1 ? '' : 's'}`;
  }
  return `${Math.round(value / 1024)} KB`;
}
