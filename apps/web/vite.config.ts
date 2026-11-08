import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defaultServerConditions, defineConfig, type Plugin } from 'vite';

/**
 * Sirve las fuentes de Excalidraw desde la propia web (en /excalidraw/fonts) en vez de su CDN.
 * Sin Xiaolai (chino, japonés y coreano, 12 MB): esa la sigue pidiendo a su CDN si hace falta.
 */
function excalidrawFonts(): Plugin {
  const require = createRequire(import.meta.url);
  // dist/prod/index.js → dist/prod/fonts
  const fonts = join(dirname(require.resolve('@excalidraw/excalidraw')), 'fonts');
  const skip = (path: string) => path.includes('Xiaolai');
  let outDir = 'dist';
  return {
    name: 'excalidraw-fonts',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts', (req, res, next) => {
        const file = normalize(join(fonts, decodeURIComponent((req.url ?? '').split('?')[0]!)));
        if (!file.startsWith(fonts) || skip(file) || !existsSync(file) || !statSync(file).isFile())
          return next();
        res.setHeader(
          'Content-Type',
          file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream',
        );
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      cpSync(fonts, join(outDir, 'excalidraw', 'fonts'), {
        recursive: true,
        filter: (src) => !skip(src),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), excalidrawFonts()],
  // Lee el .env de la raíz del monorepo (solo las variables VITE_* llegan al navegador).
  envDir: '../..',
  // Usa el código fuente de @pixels/shared sin compilarlo antes.
  resolve: { conditions: ['source', ...defaultClientConditions] },
  // Vitest (pruebas en Node) resuelve como servidor.
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  server: { port: 5173, strictPort: true },
});
