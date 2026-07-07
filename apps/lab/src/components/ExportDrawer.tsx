import * as React from 'react';
import {
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Dropdown,
  Option
} from '@fluentui/react-components';
import { Check, Download, X } from 'lucide-react';
import type { LabWebPart } from '@spfx-kit/spfx-lab-runtime';
import {
  labApiWriteHeaders,
  readExportStream,
  ExportApiSummary,
  ExportEstimates,
  ExportPackageFormat,
  ExportProgressPhase
} from '../api/labApi';
import { slugify } from '../lib/text';

type ExportSelections = Record<ExportPackageFormat, boolean>;

interface ExportProgressState {
  phase: ExportProgressPhase;
  value?: number;
  message: string;
  detail?: string;
}

interface ExportTargetProgressState {
  phase: ExportProgressPhase;
  value: number;
  status: string;
}

type ExportTargetProgressMap = Partial<Record<ExportPackageFormat, ExportTargetProgressState>>;

interface ExportPackageOption {
  id: ExportPackageFormat;
  label: string;
  description: string;
  totalSize: string;
  files: Array<{ name: string; size: string }>;
}

interface ExportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webParts: LabWebPart[];
  selected: LabWebPart | undefined;
  onSelectApp: (id: string) => void;
}

export function ExportDrawer(props: ExportDrawerProps): JSX.Element {
  const { open, onOpenChange, webParts, selected, onSelectApp } = props;
  const [exportSelections, setExportSelections] = React.useState<ExportSelections>({ single: true, cdn: true, standalone: false });
  const [exportEstimates, setExportEstimates] = React.useState<ExportEstimates>({});
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState('');
  const [exportProgress, setExportProgress] = React.useState<ExportProgressState>({ phase: 'idle', message: '' });
  const [exportTargetProgress, setExportTargetProgress] = React.useState<ExportTargetProgressMap>({});

  const exportSlug = selected?.appId || slugify(selected?.title || selected?.id || 'spfx-web-part');
  const exportOptions = React.useMemo(() => createExportPackageOptions(exportSlug, exportEstimates), [exportEstimates, exportSlug]);
  const selectedExportOptions = exportOptions.filter((option) => exportSelections[option.id]);
  const exportAppName = selected?.title || 'selected app';
  const exportCardMode = exportProgress.phase !== 'idle';
  const canDownloadExport = selectedExportOptions.length > 0 && !exporting;

  React.useEffect(() => {
    if (open && !exporting) {
      setExportProgress({ phase: 'idle', message: '' });
      setExportTargetProgress({});
      setExportError('');
    }
    // Reset transient progress whenever the drawer is (re)opened while no
    // export is running, matching the previous inline drawer behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!selected?.appId) {
      setExportEstimates({});
      return;
    }
    let disposed = false;
    fetch(`/api/export-spfx-app/estimate?app=${encodeURIComponent(selected.appId)}`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: ExportEstimates | undefined) => {
        if (!disposed && value) {
          setExportEstimates(value);
        }
      })
      .catch(() => {
        if (!disposed) {
          setExportEstimates({});
        }
      });
    return () => {
      disposed = true;
    };
  }, [selected?.appId]);

  const setExportSelection = (id: ExportPackageFormat, checked: boolean): void => {
    setExportSelections((prev) => ({ ...prev, [id]: checked }));
    if (!exporting) {
      setExportProgress({ phase: 'idle', message: '' });
      setExportTargetProgress({});
      setExportError('');
    }
  };

  const selectExportApp = (nextId: string): void => {
    if (exporting) {
      return;
    }
    onSelectApp(nextId);
    setExportProgress({ phase: 'idle', message: '' });
    setExportTargetProgress({});
    setExportError('');
  };

  const downloadExportSelection = async (): Promise<void> => {
    if (!canDownloadExport || !selected?.appId) {
      return;
    }
    const selectedTargets = selectedExportOptions.map((option) => option.id);
    const targetLabels = selectedExportOptions.map((option) => option.label).join(', ');
    let exportSummary: ExportApiSummary | undefined;
    setExporting(true);
    setExportError('');
    setExportTargetProgress(createQueuedExportProgress(selectedExportOptions));
    setExportProgress({
      phase: 'queued',
      value: 0.03,
      message: 'Starting export',
      detail: targetLabels
    });
    try {
      const response = await fetch('/api/export-spfx-app/stream', {
        method: 'POST',
        headers: labApiWriteHeaders,
        body: JSON.stringify({
          app: selected.appId,
          targets: selectedTargets
        })
      });
      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || 'Export failed.');
      }

      await readExportStream(response, (event) => {
        if (event.type === 'error') {
          throw new Error(event.message || 'Export failed.');
        }

        if (event.type === 'target' && event.target) {
          const phase = normalizeExportPhase(event.phase);
          const value = clampProgress(event.progress);
          const status = event.message || getDefaultProgressStatus(phase);
          setExportProgress({ phase, value, message: status, detail: event.target });
          setExportTargetProgress((prev) => ({
            ...prev,
            [event.target as ExportPackageFormat]: { phase, value, status }
          }));
          return;
        }

        if (event.type === 'archive') {
          const phase = normalizeExportPhase(event.phase);
          const value = clampProgress(event.progress);
          const status = event.message || getDefaultProgressStatus(phase);
          setExportProgress({ phase, value, message: status, detail: targetLabels });
          setExportTargetProgress((prev) => updateAllActiveExportTargets(prev, selectedTargets, phase, value, status));
          return;
        }

        if (event.type === 'summary' && event.summary) {
          exportSummary = event.summary;
          setExportProgress({
            phase: 'complete',
            value: 1,
            message: 'Export ready',
            detail: 'Archive ready to download.'
          });
          setExportTargetProgress((prev) =>
            updateAllActiveExportTargets(prev, selectedTargets, 'complete', 1, 'Ready to download.')
          );
        }
      });

      if (!exportSummary) {
        throw new Error('Export completed without a summary.');
      }

      const url = `/api/export-spfx-app/archive?path=${encodeURIComponent(exportSummary.archivePath)}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = exportSummary.archivePath.split('/').pop() || `${exportSummary.slug}-export.tar.gz`;
      document.body.append(link);
      link.click();
      link.remove();
      setExportProgress({
        phase: 'complete',
        value: 1,
        message: 'Export ready',
        detail: `Download started for ${link.download}.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed.';
      setExportError(message);
      setExportProgress({
        phase: 'error',
        value: 1,
        message: 'Export failed',
        detail: message
      });
      setExportTargetProgress((prev) =>
        updateAllActiveExportTargets(prev, selectedTargets, 'error', 1, message)
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <Drawer
      className="export-drawer"
      modalType="modal"
      onOpenChange={(_event, data) => onOpenChange(data.open)}
      open={open}
      position="start"
      size="medium"
      type="overlay"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={(
            <Button
              appearance="subtle"
              aria-label="Close export package drawer"
              icon={<X size={16} />}
              onClick={() => onOpenChange(false)}
            />
          )}
        >
          <span className="export-drawer__title">
            <span>Export</span>
            <Dropdown
              aria-label="Select app to export"
              className="export-app-select"
              disabled={exporting}
              selectedOptions={selected?.id ? [selected.id] : []}
              value={exportAppName}
              onOptionSelect={(_event, data) => {
                if (data.optionValue) {
                  selectExportApp(data.optionValue);
                }
              }}
            >
              {webParts.map((webPart) => (
                <Option key={webPart.id} value={webPart.id}>
                  {webPart.title}
                </Option>
              ))}
            </Dropdown>
          </span>
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody className="export-drawer__body">
        <p className="export-drawer__description">
          Select one or more package formats to include in the download.
        </p>
        <div className="export-drawer__options">
          {exportOptions.map((option) => {
            const selectedForExport = exportSelections[option.id];
            const hiddenDuringExport = exportCardMode && !selectedForExport;
            const targetProgress = exportTargetProgress[option.id];
            const optionPhase = targetProgress?.phase || exportProgress.phase;
            const progressPercent = Math.round((targetProgress?.value ?? exportProgress.value ?? 0) * 100);
            const optionInFlight = exportCardMode && selectedForExport && isExportPhaseInFlight(optionPhase);
            const statusText = exportCardMode ? getExportOptionStatus(option, targetProgress, exportProgress, exportError) : option.description;

            return (
              <section
                aria-hidden={hiddenDuringExport}
                className={[
                  'export-option',
                  selectedForExport ? 'export-option--selected' : '',
                  hiddenDuringExport ? 'export-option--hidden' : '',
                  optionInFlight ? 'export-option--running' : '',
                  optionPhase === 'complete' && selectedForExport ? 'export-option--complete' : '',
                  optionPhase === 'error' && selectedForExport ? 'export-option--error' : ''
                ].filter(Boolean).join(' ')}
                key={option.id}
              >
                <div className="export-option__header">
                  {exportCardMode && selectedForExport ? (
                    <div className="export-option__state-label">
                      <ExportOptionStateIcon
                        phase={optionPhase}
                        progress={progressPercent}
                      />
                      <span>{option.label}</span>
                    </div>
                  ) : (
                    <Checkbox
                      aria-label={`Include ${option.label}`}
                      checked={selectedForExport}
                      label={option.label}
                      onChange={(_event, data) => setExportSelection(option.id, data.checked === true)}
                    />
                  )}
                  <span className="export-option__total">{option.totalSize}</span>
                </div>
                <p
                  aria-live={exportCardMode && selectedForExport ? 'polite' : undefined}
                  className={`export-option__description ${exportCardMode ? 'export-option__description--status' : ''}`}
                >
                  {statusText}
                </p>
                {!exportCardMode && (
                  <details className="export-option__details">
                    <summary className="export-option__summary">
                      <span>{option.files.length} files</span>
                    </summary>
                    <ul className="export-option__files" aria-label={`${option.label} estimated files`}>
                      {option.files.map((file) => (
                        <li className="export-option__file" key={file.name}>
                          <span>{file.name}</span>
                          <strong>{file.size}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      </DrawerBody>
      <DrawerFooter className="export-drawer__footer">
        <Button appearance="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          appearance="primary"
          aria-label="Download selected export packages"
          disabled={!canDownloadExport}
          icon={<Download size={14} />}
          onClick={downloadExportSelection}
        >
          {exporting ? 'Exporting...' : 'Download'}
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}

interface ExportOptionStateIconProps {
  phase: ExportProgressPhase;
  progress: number;
}

function ExportOptionStateIcon(props: ExportOptionStateIconProps): JSX.Element {
  if (props.phase === 'complete') {
    return (
      <span className="export-option__state-icon export-option__state-icon--complete" aria-hidden="true">
        <Check size={12} />
      </span>
    );
  }

  if (props.phase === 'error') {
    return (
      <span className="export-option__state-icon export-option__state-icon--error" aria-hidden="true">
        <X size={12} />
      </span>
    );
  }

  return (
    <span
      className="export-option__state-icon export-option__state-icon--progress"
      aria-hidden="true"
      style={{ '--export-progress': `${props.progress}%` } as React.CSSProperties}
    />
  );
}

function createQueuedExportProgress(options: ExportPackageOption[]): ExportTargetProgressMap {
  return Object.fromEntries(
    options.map((option) => [
      option.id,
      {
        phase: 'queued' as ExportProgressPhase,
        value: 0.02,
        status: 'Waiting to start.'
      }
    ])
  );
}

function updateAllActiveExportTargets(
  previous: ExportTargetProgressMap,
  targets: ExportPackageFormat[],
  phase: ExportProgressPhase,
  value: number,
  status: string
): ExportTargetProgressMap {
  const next: ExportTargetProgressMap = { ...previous };
  for (const target of targets) {
    const existing = next[target];
    const canOverrideSettledPhase =
      phase === 'packaging' ||
      phase === 'complete' ||
      phase === 'error';
    if ((existing?.phase === 'complete' || existing?.phase === 'error') && !canOverrideSettledPhase) {
      continue;
    }
    next[target] = {
      phase,
      value: Math.max(existing?.value || 0, value),
      status
    };
  }
  return next;
}

function normalizeExportPhase(phase: ExportProgressPhase | undefined): ExportProgressPhase {
  switch (phase) {
    case 'queued':
    case 'configuring':
    case 'preparing':
    case 'building':
    case 'assembling':
    case 'packaging':
    case 'complete':
    case 'error':
      return phase;
    case 'idle':
    default:
      return 'preparing';
  }
}

function clampProgress(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.02;
  }
  return Math.max(0.02, Math.min(1, value));
}

function isExportPhaseInFlight(phase: ExportProgressPhase): boolean {
  return phase !== 'idle' && phase !== 'complete' && phase !== 'error';
}

function getDefaultProgressStatus(phase: ExportProgressPhase): string {
  switch (phase) {
    case 'queued':
      return 'Waiting to start.';
    case 'configuring':
      return 'Configuring export.';
    case 'building':
      return 'Running ship build.';
    case 'assembling':
      return 'Assembling files.';
    case 'packaging':
      return 'Packaging archive.';
    case 'complete':
      return 'Ready to download.';
    case 'error':
      return 'Export failed.';
    case 'preparing':
    case 'idle':
    default:
      return 'Preparing export.';
  }
}

function getExportOptionStatus(
  option: ExportPackageOption,
  targetProgress: ExportTargetProgressState | undefined,
  progress: ExportProgressState,
  fallbackError: string
): string {
  if (targetProgress) {
    return targetProgress.status;
  }

  switch (progress.phase) {
    case 'queued':
      return `${option.label} is waiting to start.`;
    case 'configuring':
      return `Configuring ${option.label}.`;
    case 'preparing':
      return `Preparing ${option.label}.`;
    case 'building':
      return `Running ship build for ${option.label}.`;
    case 'assembling':
      return `Assembling ${option.label}.`;
    case 'packaging':
      return `Packaging ${option.label}.`;
    case 'complete':
      return `${option.label} ready.`;
    case 'error':
      return progress.detail || fallbackError || `${option.label} export failed.`;
    case 'idle':
    default:
      return option.description;
  }
}

function createExportPackageOptions(slug: string, estimates: ExportEstimates): ExportPackageOption[] {
  return [
    {
      id: 'single',
      label: `${slug}-standalone`,
      description: 'Exports one SharePoint package with the web part bundle embedded for tenant app catalog upload.',
      totalSize: estimates.single?.totalSize || 'Calculated on export',
      files: estimates.single?.files?.length ? estimates.single.files : [
        { name: `${slug}-standalone/${slug}-standalone.sppkg`, size: '~420 KB' },
        { name: `${slug}-standalone/README.md`, size: 'generated' }
      ]
    },
    {
      id: 'cdn',
      label: 'SPFx + CDN JS package',
      description: 'Exports a small SharePoint package plus JavaScript and CSS assets intended for your configured CDN path.',
      totalSize: estimates.cdn?.totalSize || 'Calculated on export',
      files: estimates.cdn?.files?.length ? estimates.cdn.files : [
        { name: 'cdn/README.md', size: 'generated' },
        { name: `cdn/sharepoint/solution/${slug}.cdn.sppkg`, size: '~34 KB' },
        { name: 'cdn/release/assets', size: 'from latest build' },
        { name: 'cdn/cdn-handoff', size: 'from latest build' }
      ]
    },
    {
      id: 'standalone',
      label: `${slug}-repo`,
      description: 'Exports a clean house-standard SPFx repo that can run by itself or be imported into another SPFx Kit lab.',
      totalSize: estimates.standalone?.totalSize || 'Calculated on export',
      files: estimates.standalone?.files?.length ? estimates.standalone.files : [
        { name: `${slug}-repo/package.json`, size: 'generated' },
        { name: `${slug}-repo/package-lock.json`, size: 'generated' },
        { name: `${slug}-repo/SPFX-KIT-EXPORT-README.md`, size: 'upload instructions' }
      ]
    }
  ];
}
