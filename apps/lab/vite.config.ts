import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spfxAppApi } from './server/apps-api';
import { spfxExportApi } from './server/export-api';
import { rootDir } from './server/paths';

export default defineConfig({
  plugins: [react(), spfxAppApi(), spfxExportApi()],
  server: {
    strictPort: false,
    fs: {
      allow: [rootDir]
    }
  }
});
