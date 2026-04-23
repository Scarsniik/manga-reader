import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveAppIdentity } = require('./scripts/app-identity.cjs');

const appIdentity = resolveAppIdentity();

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'app-identity-html',
      transformIndexHtml: (html) => html.replace(/%APP_PRODUCT_NAME%/g, appIdentity.productName),
    },
    react(),
    svgr(),
  ],
  define: {
    __APP_PRODUCT_NAME__: JSON.stringify(appIdentity.productName),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false,
  },
  server: {
    port: 3000,
    open: true,
  },
});
