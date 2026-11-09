import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const logicTests = ['src/core/!(packs|languages|voices|writing-fonts|spanish-packs).test.ts', 'src/content/**/*.test.ts']

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  build: { rolldownOptions: { input: { app: 'index.html', vocabulary: 'vocabulary/index.html' } } },
  test: {
    environment: 'jsdom',
    projects: [
      { extends: true, test: {
        name: 'logic', environment: 'node', setupFiles: [],
        include: logicTests,
      } },
      { extends: true, test: {
        name: 'browser-ui', environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'], exclude: logicTests,
      } },
    ],
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
