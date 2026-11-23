// Configuración de Vitest para pruebas unitarias y de integración secuenciales sobre BD compartida.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from 'vitest/config'

const testDir = path.dirname(fileURLToPath(import.meta.url))
// Alias @ apunta al código fuente del frontend hermano (../abc_inversiones_app/src)
const appSrcDir = path.resolve(testDir, "..", "abc_inversiones_app", "src")

export default defineConfig({
  cache: false,
  execArgv: ['--no-warnings'],
  test: {
    globals: true,
    environment: 'node',
    include: ['unit/**/*.test.ts', 'integration/**/*.test.ts'],
    setupFiles: ['./helpers/load-env.ts', './helpers/ensure-api-hook.ts'],
    env: { NODE_ENV: 'test', VITE_API_URL: 'http://localhost:3000' },
    testTimeout: 30000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    fileParallelism: false,
    sequence: { concurrent: false, shuffle: false },
    reporter: 'verbose',
  },
  resolve: {
    alias: {
      "@": appSrcDir,
    },
  },
})
