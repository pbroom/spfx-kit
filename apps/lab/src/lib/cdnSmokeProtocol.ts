export const CDN_SMOKE_MESSAGE_SOURCE = 'spfx-kit-cdn-smoke-check';

export interface CdnSmokeRegistration {
  moduleId: string;
  dependencyCount: number;
}

export interface CdnSmokeAssetEvidence {
  path: string;
  registrationCount: number;
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
}

export type CdnSmokeMessage = CdnSmokeReadyMessage | CdnSmokeErrorMessage;

export function parseCdnSmokeMessage(value: unknown, requestId: string): CdnSmokeMessage | undefined {
  if (!isRecord(value) || value.source !== CDN_SMOKE_MESSAGE_SOURCE || value.requestId !== requestId) {
    return undefined;
  }
  if (value.status === 'error') {
    return typeof value.message === 'string' && value.message.trim()
      ? { source: CDN_SMOKE_MESSAGE_SOURCE, requestId, status: 'error', message: value.message.trim() }
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
  const assetEvidence: CdnSmokeAssetEvidence[] = [];
  for (const evidence of value.assetEvidence) {
    if (
      !isRecord(evidence) ||
      typeof evidence.path !== 'string' ||
      !evidence.path ||
      !Number.isSafeInteger(evidence.registrationCount) ||
      (evidence.registrationCount as number) < 0
    ) {
      return undefined;
    }
    assetEvidence.push({ path: evidence.path, registrationCount: evidence.registrationCount as number });
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
