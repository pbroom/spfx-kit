import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spfxAppApi } from './server/apps-api';
import { spfxExportApi } from './server/export-api';
import { spfxLabPackagesApi } from './server/lab-packages-api';
import { spfxLocalCdnAdminApi } from './server/local-cdn-admin-api';
import { rootDir } from './server/paths';

const labAllowedHost = String(process.env.SPFX_LAB_ALLOWED_HOST || '')
  .trim()
  .toLowerCase();

export default defineConfig({
  plugins: [react(), spfxAppApi(), spfxExportApi(), spfxLabPackagesApi(), spfxLocalCdnAdminApi()],
  resolve: {
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
