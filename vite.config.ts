import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { verifyPack1Build } from './scripts/content/contextual-pack1-build'

const logicTests = ['src/core/!(packs|languages|voices|writing-fonts|spanish-packs).test.ts', 'src/content/**/*.test.ts']
const pack1Digests = verifyPack1Build(new URL('./', import.meta.url))

export default defineConfig({
  plugins: [react()],
  define: {
    __PACK1_TEXT_APPROVAL_SHA256__: JSON.stringify(pack1Digests.textApproval),
    __PACK1_SOURCE_SHA256__: JSON.stringify(pack1Digests.source),
    __PACK1_GENERATED_MEDIA_SHA256__: JSON.stringify(pack1Digests.generatedMedia),
  },
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
