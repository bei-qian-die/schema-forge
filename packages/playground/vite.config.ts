import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: '@schema-forge/renderer-vue/style.css',
        replacement: resolvePath('../renderer-vue/src/styles/renderer.css'),
      },
      { find: /^@schema-forge\/core$/, replacement: resolvePath('../core/src/index.ts') },
      {
        find: /^@schema-forge\/renderer-vue$/,
        replacement: resolvePath('../renderer-vue/src/index.ts'),
      },
      {
        find: /^@schema-forge\/materials$/,
        replacement: resolvePath('../materials/src/index.ts'),
      },
      {
        find: /^@schema-forge\/designer$/,
        replacement: resolvePath('../designer/src/index.ts'),
      },
    ],
    dedupe: ['vue'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
  },
})
