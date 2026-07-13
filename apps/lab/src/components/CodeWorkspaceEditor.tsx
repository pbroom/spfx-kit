import * as React from 'react';
import * as ReactDom from 'react-dom';
import * as FluentComponents from '@fluentui/react-components';
import * as ReactQuery from '@tanstack/react-query';
import * as ReactTable from '@tanstack/react-table';
import * as Zod from 'zod';
import * as Zustand from 'zustand';
import Editor, { loader } from '@monaco-editor/react';
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  FluentProvider,
  makeStyles,
  Option,
  Tab,
  TabList,
  Text,
  Textarea,
  tokens,
  webLightTheme
} from '@fluentui/react-components';
import {
  CodeWorkbenchDiagnostic,
  CodeWorkbenchModules,
  CodeWorkbenchSourceV1,
  compileCodeWorkbenchSource,
  getCodeWorkbenchSourceDiagnostics,
  measureCodeWorkbenchSource,
  serializeCodeWorkbenchSource
} from '@spfx-kit/code-workbench-runtime';

export interface CodeWorkspaceEditorProps {
  source: CodeWorkbenchSourceV1;
  modules: CodeWorkbenchModules;
  spfx: unknown;
  updatedAt?: string;
  updatedBy?: string;
  monacoBaseUrl?: string;
  onSourceChange: (source: CodeWorkbenchSourceV1, isValid: boolean) => void;
}

type SourceTab = 'tsx' | 'html' | 'css' | 'scss' | 'ts' | 'js';

const tabs: Array<{ id: SourceTab; label: string; language: string }> = [
  { id: 'tsx', label: 'TSX', language: 'typescript' },
  { id: 'html', label: 'HTML', language: 'html' },
  { id: 'css', label: 'CSS', language: 'css' },
  { id: 'scss', label: 'Sass', language: 'scss' },
  { id: 'ts', label: 'TS', language: 'typescript' },
  { id: 'js', label: 'JS', language: 'javascript' }
];

const renderModeOptions: Array<{ value: CodeWorkbenchSourceV1['mode']; label: string }> = [
  { value: 'react', label: 'React default export' },
  { value: 'html', label: 'HTML fallback' },
  { value: 'auto', label: 'Auto' }
];

export const approvedCodeWorkspaceModuleNames: string[] = [
  'react',
  'react-dom',
  '@fluentui/react-components',
  '@tanstack/react-query',
  '@tanstack/react-table',
  'zod',
  'zustand'
];

export function createApprovedCodeWorkspaceModules(): CodeWorkbenchModules {
  return {
    react: React,
    'react-dom': ReactDom,
    '@fluentui/react-components': FluentComponents,
    '@tanstack/react-query': ReactQuery,
    '@tanstack/react-table': ReactTable,
    zod: Zod,
    zustand: Zustand
  };
}

let configuredMonacoBaseUrl = '';
let configuredMonacoDiagnostics = false;

export const CodeWorkspaceEditor: React.FunctionComponent<CodeWorkspaceEditorProps> = (props) => {
  const monacoBaseUrl = normalizeBaseUrl(props.monacoBaseUrl);
  if (monacoBaseUrl) {
    configureMonaco(monacoBaseUrl);
  }
  const classes = useStyles();
  const [source, setSource] = React.useState<CodeWorkbenchSourceV1>(props.source);
  const [activeTab, setActiveTab] = React.useState<SourceTab>('tsx');
  const [expanded, setExpanded] = React.useState(false);
  const [editorReady, setEditorReady] = React.useState(false);

  React.useEffect(() => {
    setSource(props.source);
  }, [props.source]);

  const diagnostics = React.useMemo<CodeWorkbenchDiagnostic[]>(() => {
    const sizeDiagnostics = getCodeWorkbenchSourceDiagnostics(source);
    try {
      const compile = compileCodeWorkbenchSource({ source, modules: props.modules, spfx: props.spfx });
      return [...sizeDiagnostics, ...compile.diagnostics.filter((item) => item.level === 'error')];
    } catch (error) {
      return [
        ...sizeDiagnostics,
        {
          level: 'error',
          source: 'runtime',
          message: error instanceof Error ? error.message : 'Unable to compile authored code.'
        }
      ];
    }
  }, [props.modules, props.spfx, source]);

  const serialized = React.useMemo(() => serializeCodeWorkbenchSource(source), [source]);
  const isValid = !serialized.blocked && !diagnostics.some((item) => item.level === 'error');

  const updateSource = (field: SourceTab, value: string | undefined): void => {
    const next = { ...source, [field]: value || '' };
    setSource(next);
    const nextSerialized = serializeCodeWorkbenchSource(next);
    props.onSourceChange(next, !nextSerialized.blocked);
  };

  const switchMode = (mode: CodeWorkbenchSourceV1['mode']): void => {
    const next = { ...source, mode };
    setSource(next);
    props.onSourceChange(next, !serializeCodeWorkbenchSource(next).blocked);
  };

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const selectedModeOption = renderModeOptions.find((option) => option.value === source.mode) || renderModeOptions[0];
  const statusLabel = serialized.blocked ? 'Too large to save' : isValid ? 'Compiles' : 'Needs attention';

  return (
    <FluentProvider className={classes.provider} theme={webLightTheme}>
      <div className={classes.root}>
        <div className={classes.headerRow}>
          <div className={classes.headerCopy}>
            <Text size={200} weight="semibold">
              Source editor
            </Text>
            <Text className={classes.meta} size={100}>
              {Math.round(measureCodeWorkbenchSource(source) / 1024)} KB raw · {Math.round(serialized.compressedBytes / 1024)} KB
              stored
            </Text>
          </div>
          <Badge appearance="tint" color={isValid ? 'success' : 'danger'} size="small">
            {statusLabel}
          </Badge>
        </div>

        <Field label="Render mode" size="small">
          <Dropdown
            aria-label="Render mode"
            selectedOptions={[source.mode]}
            value={selectedModeOption.label}
            onOptionSelect={(_event, data) => {
              if (data.optionValue) {
                switchMode(data.optionValue as CodeWorkbenchSourceV1['mode']);
              }
            }}
          >
            {renderModeOptions.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <TabList
          aria-label="Code language"
          className={classes.tabs}
          reserveSelectedTabSpace={false}
          selectedValue={activeTab}
          size="small"
          onTabSelect={(_event, data) => setActiveTab(data.value as SourceTab)}
        >
          {tabs.map((tab) => (
            <Tab className={classes.tab} key={tab.id} value={tab.id} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </Tab>
          ))}
        </TabList>

        <div className={classes.editorFrame}>
          {!editorReady && (
            <Textarea
              aria-label={`${currentTab.label} code`}
              className={classes.fallbackEditor}
              resize="vertical"
              value={source[activeTab]}
              onChange={(event) => updateSource(activeTab, event.currentTarget.value)}
            />
          )}
          {monacoBaseUrl && (
            <Editor
              height="260px"
              language={currentTab.language}
              path={pathForTab(activeTab)}
              theme="vs"
              value={source[activeTab]}
              beforeMount={configureMonacoDiagnostics}
              onMount={() => setEditorReady(true)}
              onChange={(value) => updateSource(activeTab, value)}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 2
              }}
            />
          )}
        </div>

        <div className={classes.actions}>
          <Button size="small" onClick={() => setExpanded(true)}>
            Open larger editor
          </Button>
        </div>

        {diagnostics.length > 0 && (
          <div className={classes.messages}>
            {diagnostics.map((diagnostic, index) => (
              <div
                className={diagnostic.level === 'error' ? classes.errorMessage : classes.warningMessage}
                key={`${diagnostic.level}-${index}`}
              >
                <Text size={100}>{diagnostic.message}</Text>
              </div>
            ))}
          </div>
        )}

        <Text className={classes.moduleList} size={100}>
          Approved imports: {approvedCodeWorkspaceModuleNames.join(', ')}
        </Text>
        {(props.updatedAt || props.updatedBy) && (
          <Text className={classes.meta} size={100}>
            Last saved {props.updatedAt || 'unknown time'} {props.updatedBy ? `by ${props.updatedBy}` : ''}
          </Text>
        )}

        <Dialog open={expanded} onOpenChange={(_event, data) => setExpanded(data.open)}>
          <DialogSurface className={classes.overlayPanel}>
            <DialogBody>
              <DialogTitle
                action={
                  <Button appearance="subtle" size="small" onClick={() => setExpanded(false)}>
                    Close
                  </Button>
                }
              >
                {currentTab.label}
              </DialogTitle>
              <DialogContent className={classes.dialogContent}>
                {monacoBaseUrl ? (
                  <Editor
                    height="calc(80vh - 88px)"
                    language={currentTab.language}
                    path={pathForTab(activeTab)}
                    theme="vs"
                    value={source[activeTab]}
                    beforeMount={configureMonacoDiagnostics}
                    onChange={(value) => updateSource(activeTab, value)}
                    options={{
                      minimap: { enabled: true },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      tabSize: 2
                    }}
                  />
                ) : (
                  <Textarea
                    aria-label={`${currentTab.label} larger code editor`}
                    className={classes.fallbackEditorLarge}
                    resize="vertical"
                    value={source[activeTab]}
                    onChange={(event) => updateSource(activeTab, event.currentTarget.value)}
                  />
                )}
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>
    </FluentProvider>
  );
};

function configureMonaco(monacoBaseUrl: string): void {
  if (configuredMonacoBaseUrl === monacoBaseUrl) {
    return;
  }
  configuredMonacoBaseUrl = monacoBaseUrl;
  loader.config({
    paths: {
      vs: monacoBaseUrl
    }
  });
}

function configureMonacoDiagnostics(monaco: any): void {
  if (configuredMonacoDiagnostics) {
    return;
  }
  configuredMonacoDiagnostics = true;
  const diagnosticsOptions = {
    noSemanticValidation: true,
    noSuggestionDiagnostics: true
  };
  const typescript = monaco.languages?.typescript;
  typescript?.typescriptDefaults?.setDiagnosticsOptions(diagnosticsOptions);
  typescript?.javascriptDefaults?.setDiagnosticsOptions(diagnosticsOptions);
  typescript?.typescriptDefaults?.setCompilerOptions({
    allowJs: true,
    allowNonTsExtensions: true,
    jsx: typescript.JsxEmit?.React,
    target: typescript.ScriptTarget?.ES2020
  });
}

function normalizeBaseUrl(value: string | undefined): string {
  return value ? value.replace(/\/+$/, '') : '';
}

function pathForTab(tab: SourceTab): string {
  return `spfx-code-workbench.${tab === 'scss' ? 'scss' : tab}`;
}

const useStyles = makeStyles({
  provider: {
    backgroundColor: 'transparent'
  },
  root: {
    display: 'grid',
    rowGap: tokens.spacingVerticalS
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalS
  },
  headerCopy: {
    display: 'grid',
    rowGap: tokens.spacingVerticalXXS
  },
  meta: {
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase100
  },
  tabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalXXS
  },
  tab: {
    minWidth: 0
  },
  editorFrame: {
    minHeight: '260px',
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium
  },
  fallbackEditor: {
    width: '100%',
    minHeight: '260px',
    '& textarea': {
      minHeight: '250px',
      fontFamily: 'Menlo, Consolas, monospace',
      fontSize: tokens.fontSizeBase200,
      lineHeight: tokens.lineHeightBase200
    }
  },
  fallbackEditorLarge: {
    width: '100%',
    minHeight: 'calc(80vh - 88px)',
    '& textarea': {
      minHeight: 'calc(80vh - 96px)',
      fontFamily: 'Menlo, Consolas, monospace',
      fontSize: tokens.fontSizeBase200,
      lineHeight: tokens.lineHeightBase200
    }
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end'
  },
  messages: {
    display: 'grid',
    rowGap: tokens.spacingVerticalXS
  },
  errorMessage: {
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    color: tokens.colorPaletteRedForeground1,
    backgroundColor: tokens.colorPaletteRedBackground1
  },
  warningMessage: {
    border: `1px solid ${tokens.colorPaletteMarigoldBorder1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    color: tokens.colorPaletteMarigoldForeground2,
    backgroundColor: tokens.colorPaletteMarigoldBackground1
  },
  moduleList: {
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase100
  },
  overlayPanel: {
    width: 'min(1080px, 92vw)',
    height: '80vh',
    maxWidth: 'min(1080px, 92vw)',
    overflow: 'hidden'
  },
  dialogContent: {
    height: 'calc(80vh - 88px)',
    overflow: 'hidden'
  }
});
