import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  worker: {
    // Module workers (all current browsers). satellite.js's optional WASM
    // entry uses top-level await, which the default iife format rejects.
    format: 'es',
  },
  build: {
    // The three.js chunk alone is ~560 kB minified (~140 kB gzip); that is expected.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // three.js changes far less often than app code; a separate chunk
        // keeps it cached across deploys.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
