import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  build: { rolldownOptions: { input: { app: 'index.html', vocabulary: 'vocabulary/index.html' } } },
  test: {
    environment: 'jsdom',
    projects: [
      { extends: true, test: {
        name: 'logic', environment: 'node', setupFiles: [],
        include: ['src/core/**/*.test.ts', 'src/content/**/*.test.ts'],
        exclude: ['src/core/{packs,languages,voices,writing-fonts,spanish-packs}.test.ts'],
      } },
      { extends: true, test: {
        name: 'browser-ui', environment: 'jsdom',
        include: ['src/**/*.test.tsx', 'src/progress/**/*.test.ts', 'src/sync/**/*.test.ts',
          'src/core/{packs,languages,voices,writing-fonts,spanish-packs}.test.ts'],
      } },
    ],
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
