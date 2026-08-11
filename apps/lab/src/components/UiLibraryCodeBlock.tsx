import * as React from 'react';

interface UiLibraryCodeBlockProps {
  code: string;
  label: string;
}

export function UiLibraryCodeBlock({ code, label }: UiLibraryCodeBlockProps): JSX.Element {
  return (
    <div className="ui-library-docs__code-shell">
      <div aria-hidden="true" className="ui-library-docs__code-toolbar">
        <span>TSX</span>
      </div>
      <pre aria-label={label} className="ui-library-docs__code">
        <code>{highlightTsx(code)}</code>
      </pre>
    </div>
  );
}

const tsxTokenPattern =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:as|const|default|export|from|function|import|interface|let|new|return|type|var)\b|\b(?:false|null|true|undefined)\b|\b\d+(?:\.\d+)?\b|<\/?[A-Z][A-Za-z0-9.]*)/gu;

function highlightTsx(code: string): React.ReactNode[] {
  return code.split(tsxTokenPattern).map((token, index) => {
    if (!token) return null;
    let kind: 'comment' | 'keyword' | 'literal' | 'number' | 'string' | 'tag' | undefined;
    if (token.startsWith('//') || token.startsWith('/*')) kind = 'comment';
    else if (/^["'`]/u.test(token)) kind = 'string';
    else if (/^(?:as|const|default|export|from|function|import|interface|let|new|return|type|var)$/u.test(token))
      kind = 'keyword';
    else if (/^(?:false|null|true|undefined)$/u.test(token)) kind = 'literal';
    else if (/^\d/u.test(token)) kind = 'number';
    else if (token.startsWith('<')) kind = 'tag';
    return kind ? (
      <span className={`ui-library-docs__syntax-token ui-library-docs__syntax-token--${kind}`} key={`${index}-${token}`}>
        {token}
      </span>
    ) : (
      token
    );
  });
}
