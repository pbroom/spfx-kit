export interface ManagedAppExportConfig {
  appName: string;
  fileName: string;
  description: string;
  longDescription: string;
  videoUrl: string;
  appIcon: string;
  catalogIconPath: string;
  screenshotPaths: string[];
  categories: string[];
  version: string;
  cdnUrl: string;
  developerName: string;
  developerWebsiteUrl: string;
  privacyUrl: string;
  termsOfUseUrl: string;
  partnerId: string;
}

export function validateExportConfig(appDir: string, value: unknown): Promise<ManagedAppExportConfig>;
