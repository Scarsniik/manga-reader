import { readFile, writeFile } from "node:fs/promises";
import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveAppIdentity } = require('./scripts/app-identity.cjs');

const appIdentity = resolveAppIdentity();

const normalizeSvgForJsx = (source: string): string => source
  .replace(/\bclass=/g, "className=")
  .replace(/\bstroke-width=/g, "strokeWidth=")
  .replace(/\bstroke-linecap=/g, "strokeLinecap=")
  .replace(/\bstroke-linejoin=/g, "strokeLinejoin=");

const svgReactComponentPlugin = (): Plugin => ({
  name: "svg-react-component",
  enforce: "pre",
  async load(id) {
    const queryStart = id.indexOf("?");
    if (queryStart < 0) return null;

    const filePath = id.slice(0, queryStart);
    const query = new URLSearchParams(id.slice(queryStart + 1));
    if (!filePath.endsWith(".svg") || !query.has("react")) return null;

    this.addWatchFile(filePath);
    const svgSource = normalizeSvgForJsx(await readFile(filePath, "utf8"));
    const svgWithProps = svgSource.replace(/<svg\b([^>]*)>/i, "<svg$1 {...props}>");
    if (svgWithProps === svgSource) {
      throw new Error(`Invalid SVG component: ${filePath}`);
    }

    return transformWithEsbuild(
      `const SvgComponent = (props) => (${svgWithProps});\nexport default SvgComponent;`,
      `${filePath}.jsx`,
      {
        loader: "jsx",
        jsx: "automatic",
      },
    );
  },
});

const rendererBuildSignalPlugin = (enabled: boolean): Plugin => ({
  name: "renderer-build-signal",
  apply: "build",
  async writeBundle() {
    if (!enabled) return;

    await writeFile(resolve(__dirname, "dist/renderer/.dev-ready"), `${Date.now()}\n`, "utf8");
  },
});

const developmentParentMonitorPlugin = (enabled: boolean): Plugin => ({
  name: "development-parent-monitor",
  apply: "build",
  configResolved() {
    if (!enabled) return;

    const parentProcessId = Number(process.env.SCARAMANGA_DEV_PARENT_PID);
    if (!Number.isInteger(parentProcessId) || parentProcessId <= 0) return;

    setInterval(() => {
      try {
        process.kill(parentProcessId, 0);
      } catch {
        process.exit(0);
      }
    }, 1000);
  },
});

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    {
      name: 'app-identity-html',
      transformIndexHtml: (html) => html.replace(/%APP_PRODUCT_NAME%/g, appIdentity.productName),
    },
    react(),
    svgReactComponentPlugin(),
    rendererBuildSignalPlugin(mode === "development"),
    developmentParentMonitorPlugin(mode === "development"),
  ],
  define: {
    __APP_PRODUCT_NAME__: JSON.stringify(appIdentity.productName),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // Do not block initial module responses while Vite crawls the full renderer graph.
    holdUntilCrawlEnd: false,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: false,
  },
}));
