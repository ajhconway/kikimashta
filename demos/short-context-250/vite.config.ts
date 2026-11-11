import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demo = dirname(fileURLToPath(import.meta.url));
const repository = resolve(demo, '../..');
// Repository builds import the live production components. Portable Sites
// source uses a verified, byte-identical snapshot; no rewritten components.
const app = existsSync(resolve(repository, 'src/components/ContextualQuiz.tsx'))
  ? resolve(repository, 'src') : resolve(demo, 'shared-app/src');
export default defineConfig({
  root: demo,
  plugins: [react()],
  resolve: { alias: { '@app': app, '@content': resolve(app, '../content') }, dedupe: ['react', 'react-dom'] },
  build: { outDir: resolve(demo, 'dist'), emptyOutDir: true,
    rollupOptions: { input: { main: resolve(demo, 'index.html'), drafts: resolve(demo, 'drafts.html') } } },
  server: { host: '127.0.0.1', port: 5310, strictPort: true },
  preview: { host: '127.0.0.1', port: 5310, strictPort: true },
});
