import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync, existsSync, cpSync } from 'node:fs'

const rootDir = process.cwd()

export default defineConfig({
  base: './',
  root: resolve(rootDir, 'src/extension'),
  plugins: [
    react(),
    {
      name: 'copy-extension-manifest-and-icons',
      closeBundle() {
        const outDir = resolve(rootDir, 'dist')
        if (!existsSync(outDir)) {
          mkdirSync(outDir, { recursive: true })
        }

        // Copy manifest.json
        const manifestSrc = resolve(rootDir, 'src/extension/manifest.json')
        const manifestDest = resolve(outDir, 'manifest.json')
        if (existsSync(manifestSrc)) {
          copyFileSync(manifestSrc, manifestDest)
          console.log('✓ Copied manifest.json to dist')
        }

        // Copy icons directory recursively
        const iconsSrcDir = resolve(rootDir, 'src/extension/icons')
        const iconsDestDir = resolve(outDir, 'icons')
        if (existsSync(iconsSrcDir)) {
          cpSync(iconsSrcDir, iconsDestDir, { recursive: true })
          console.log('✓ Copied icons recursively to dist/icons')
        }
      },
    },
  ],
  build: {
    minify: false,
    outDir: resolve(rootDir, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, 'src/extension/popup.html'),
        sidepanel: resolve(rootDir, 'src/extension/sidepanel.html'),
        background: resolve(rootDir, 'src/extension/background.ts'),
        content: resolve(rootDir, 'src/extension/content.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js'
          if (chunkInfo.name === 'content') return 'content.js'
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
