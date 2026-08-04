import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spfxAppApi } from './server/apps-api';
import { spfxExportApi } from './server/export-api';
import { spfxLabPackagesApi } from './server/lab-packages-api';
import { rootDir } from './server/paths';

export default defineConfig({
  plugins: [react(), spfxAppApi(), spfxExportApi(), spfxLabPackagesApi()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  server: {
    strictPort: false,
    fs: {
      allow: [rootDir]
    }
  }
});
