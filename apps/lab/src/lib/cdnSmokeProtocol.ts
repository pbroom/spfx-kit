export const CDN_SMOKE_MESSAGE_SOURCE = 'spfx-kit-cdn-smoke-check';

export interface CdnSmokeRegistration {
  moduleId: string;
  dependencyCount: number;
}

export interface CdnSmokeAssetEvidence {
  path: string;
  status: 'loading' | 'loaded' | 'failed';
  registrationCount: number;
}

export interface CdnSmokeProgressMessage {
  source: typeof CDN_SMOKE_MESSAGE_SOURCE;
  requestId: string;
  status: 'progress';
  assetEvidence: CdnSmokeAssetEvidence[];
}

export interface CdnSmokeReadyMessage {
  source: typeof CDN_SMOKE_MESSAGE_SOURCE;
  requestId: string;
  status: 'ready';
  loadedAssetPaths: string[];
  assetEvidence: CdnSmokeAssetEvidence[];
  registrations: CdnSmokeRegistration[];
}

export interface CdnSmokeErrorMessage {
  source: typeof CDN_SMOKE_MESSAGE_SOURCE;
  requestId: string;
  status: 'error';
  message: string;
  assetEvidence: CdnSmokeAssetEvidence[];
}

export type CdnSmokeMessage = CdnSmokeProgressMessage | CdnSmokeReadyMessage | CdnSmokeErrorMessage;

export function parseCdnSmokeMessage(value: unknown, requestId: string): CdnSmokeMessage | undefined {
  if (!isRecord(value) || value.source !== CDN_SMOKE_MESSAGE_SOURCE || value.requestId !== requestId) {
    return undefined;
  }
  if (value.status === 'error') {
    const assetEvidence = parseAssetEvidence(value.assetEvidence);
    return typeof value.message === 'string' && value.message.trim() && assetEvidence
      ? {
          source: CDN_SMOKE_MESSAGE_SOURCE,
          requestId,
          status: 'error',
          message: value.message.trim(),
          assetEvidence
        }
      : undefined;
  }
  if (value.status === 'progress') {
    const assetEvidence = parseAssetEvidence(value.assetEvidence);
    return assetEvidence
      ? { source: CDN_SMOKE_MESSAGE_SOURCE, requestId, status: 'progress', assetEvidence }
      : undefined;
  }
  if (
    value.status !== 'ready' ||
    !isStringArray(value.loadedAssetPaths) ||
    !Array.isArray(value.assetEvidence) ||
    !Array.isArray(value.registrations)
  ) {
    return undefined;
  }
  const loadedAssetPaths = [...value.loadedAssetPaths];
  const assetEvidence = parseAssetEvidence(value.assetEvidence);
  if (!assetEvidence || assetEvidence.some((evidence) => evidence.status !== 'loaded')) {
    return undefined;
  }
  const registrations: CdnSmokeRegistration[] = [];
  for (const registration of value.registrations) {
    if (
      !isRecord(registration) ||
      typeof registration.moduleId !== 'string' ||
      !registration.moduleId ||
      !Number.isSafeInteger(registration.dependencyCount) ||
      (registration.dependencyCount as number) < 0
    ) {
      return undefined;
    }
    registrations.push({ moduleId: registration.moduleId, dependencyCount: registration.dependencyCount as number });
  }
  const evidenceMatchesLoadedPaths =
    assetEvidence.length === loadedAssetPaths.length &&
    assetEvidence.every((evidence, index) => evidence.path === loadedAssetPaths[index]);
  const recordedRegistrationCount = assetEvidence.reduce((total, evidence) => total + evidence.registrationCount, 0);
  if (
    registrations.length === 0 ||
    !evidenceMatchesLoadedPaths ||
    recordedRegistrationCount !== registrations.length ||
    assetEvidence[assetEvidence.length - 1]?.registrationCount === 0
  ) {
    return undefined;
  }
  return {
    source: CDN_SMOKE_MESSAGE_SOURCE,
    requestId,
    status: 'ready',
    loadedAssetPaths,
    assetEvidence,
    registrations
  };
}

function parseAssetEvidence(value: unknown): CdnSmokeAssetEvidence[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const paths = new Set<string>();
  const assetEvidence: CdnSmokeAssetEvidence[] = [];
  for (const evidence of value) {
    if (
      !isRecord(evidence) ||
      typeof evidence.path !== 'string' ||
      !evidence.path ||
      paths.has(evidence.path) ||
      (evidence.status !== 'loading' && evidence.status !== 'loaded' && evidence.status !== 'failed') ||
      !Number.isSafeInteger(evidence.registrationCount) ||
      (evidence.registrationCount as number) < 0
    ) {
      return undefined;
    }
    paths.add(evidence.path);
    assetEvidence.push({
      path: evidence.path,
      status: evidence.status,
      registrationCount: evidence.registrationCount as number
    });
  }
  return assetEvidence;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
