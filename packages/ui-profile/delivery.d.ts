export interface UiProfileDeliveryArtifact {
  readonly profileId: string;
  readonly profilePath: string;
  readonly profileSha256: string;
  readonly provenanceSha256: string;
  readonly cssPath: string;
  readonly cssRelativePath: string;
  readonly cssSha256: string;
  readonly scopeValue: string;
  readonly scopeSelector: string;
}

export function resolveUiProfileDeliveryArtifact(options?: { packageRoot?: string }): UiProfileDeliveryArtifact;
