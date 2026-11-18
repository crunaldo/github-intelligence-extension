import { build } from 'esbuild'

await build({
  entryPoints: ['src/pages-worker.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: 'dist/_worker.js'
})
console.log('Built dist/_worker.js for Cloudflare Pages')
