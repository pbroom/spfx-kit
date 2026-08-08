import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { spfxUiProfileDeliveryPlugin } from '../../packages/ui-profile/scripts/lib/vite-delivery-plugin.mjs';
import { spfxAppApi } from './server/apps-api';
import { spfxExportApi } from './server/export-api';
import { spfxLabPackagesApi } from './server/lab-packages-api';
import { spfxLocalCdnAdminApi } from './server/local-cdn-admin-api';
import { rootDir } from './server/paths';

const labAllowedHost = String(process.env.SPFX_LAB_ALLOWED_HOST || '')
  .trim()
  .toLowerCase();

export default defineConfig({
  plugins: [spfxUiProfileDeliveryPlugin(), react(), spfxAppApi(), spfxExportApi(), spfxLabPackagesApi(), spfxLocalCdnAdminApi()],
  resolve: {
    alias: {
      '@base-ui/react': path.resolve(rootDir, 'packages/ui-profile/.prepared/base-ui')
    },
    dedupe: ['react', 'react-dom']
  },
  server: {
    strictPort: true,
    ...(labAllowedHost ? { allowedHosts: [labAllowedHost] } : {}),
    fs: {
      allow: [rootDir]
    }
  }
});
