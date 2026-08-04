import type { LabWebPart } from '@spfx-kit/spfx-lab-runtime';

export function cdnPackageSelectionKey(webPart: Pick<LabWebPart, 'id' | 'appId' | 'componentId'>): string {
  return JSON.stringify([webPart.id, webPart.appId, webPart.componentId || null]);
}
