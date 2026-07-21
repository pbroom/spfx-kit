export type ExportPackageFormat = 'single' | 'cdn' | 'standalone';
export type ExportProgressPhase =
  'idle' | 'queued' | 'configuring' | 'preparing' | 'building' | 'assembling' | 'packaging' | 'complete' | 'error';

export interface AddSpfxAppApiResult {
  appId: string;
  message: string;
  syncedAdapters?: number;
}

export interface ManagedLabApp {
  id: string;
  packageName: string;
  relativeDir: string;
  status: 'connected' | 'disconnected' | 'missing';
  adapterPath?: string;
  disabledAdapterPath?: string;
  version: {
    autoUpdate: boolean;
    current: string;
    selected: string;
    options: Array<{ id: string; label: string }>;
    canAutoUpdate: boolean;
    canSelect: boolean;
    updateAvailable: boolean;
    source: 'clone' | 'import' | 'local';
    detail?: string;
  };
}

export interface ManagedLabAppsApiResult {
  apps: ManagedLabApp[];
}

export interface ManageAppsApiResult extends ManagedLabAppsApiResult {
  appId?: string;
  message: string;
  syncedAdapters?: number;
}

export interface ExportEstimate {
  totalSize?: string;
  packageFileName?: string;
  files?: Array<{ name: string; size: string }>;
}

export type ExportEstimates = Partial<Record<ExportPackageFormat, ExportEstimate>>;

export interface ExportApiSummary {
  archivePath: string;
  slug: string;
  targets: Array<{
    id: ExportPackageFormat;
    label: string;
    totalSize: string;
    files: Array<{ relativePath: string; size: string }>;
  }>;
}

export interface ExportStreamEvent {
  type: 'start' | 'target' | 'archive' | 'summary' | 'error';
  target?: ExportPackageFormat;
  targets?: ExportPackageFormat[];
  phase?: ExportProgressPhase;
  progress?: number;
  message?: string;
  summary?: ExportApiSummary;
}

export const labApiWriteHeaders = {
  'Content-Type': 'application/json',
  'X-SPFX-KIT-Lab-Intent': 'same-origin'
};

export async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const value = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof value.error === 'string' ? value.error : text || 'Request failed.';
    throw new Error(message);
  }
  return value as T;
}

export async function readExportStream(response: Response, onEvent: (event: ExportStreamEvent) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Export stream is unavailable.');
  }
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      handleExportStreamLine(line, onEvent);
    }
  }

  buffer += decoder.decode();
  handleExportStreamLine(buffer, onEvent);
}

function handleExportStreamLine(line: string, onEvent: (event: ExportStreamEvent) => void): void {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  onEvent(JSON.parse(trimmed) as ExportStreamEvent);
}
