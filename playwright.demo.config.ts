import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const port = Number(process.env.E2E_PORT ?? 4251);
if (process.env.VITE_STORAGE_NAMESPACE !== 'offline-demo') throw new Error('Build with VITE_STORAGE_NAMESPACE=offline-demo before running demo tests.');
export default defineConfig({
  ...base,
  testMatch: 'demo.spec.ts',
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}/offline-demo/` },
  webServer: { command: 'node e2e/demo-server.mjs', url: `http://127.0.0.1:${port}/`, reuseExistingServer: false },
});
