export interface SpfxUiProfileViteOptions {
  packageRoot?: string;
}

export interface SpfxUiProfileViteIntegration {
  readonly alias: Readonly<Record<'@base-ui/react', string>>;
  readonly deliveryPlugin: {
    readonly name: string;
    readonly enforce: 'pre';
    resolveId(source: string): string | null;
    load(id: string): Promise<string | null>;
  };
}

export const UI_PROFILE_DELIVERY_MODULE_ID: 'virtual:spfx-ui-profile-delivery';
export function spfxUiProfileVite(options?: SpfxUiProfileViteOptions): SpfxUiProfileViteIntegration;
