import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function offlineShell(): Plugin {
  return {
    name: 'mpkpb-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const worker = readFileSync(new URL('./src/service-worker.js', import.meta.url), 'utf8')
      const iconsAndManifest = ['app-192.png', 'app-512.png', 'manifest.webmanifest']
      const files = Object.keys(bundle).filter((name) => name !== 'index.html' && !name.endsWith('.map'))
      const hash = createHash('sha256').update(worker).update(JSON.stringify(files))
        .update(readFileSync(new URL('./index.html', import.meta.url)))
      for (const file of iconsAndManifest) hash.update(readFileSync(new URL('./public/' + file, import.meta.url)))
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: worker.replace('__BUILD_ID__', hash.digest('hex').slice(0, 20))
          .replace('__APP_FILES__', JSON.stringify([...files, ...iconsAndManifest])),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), offlineShell()],
})
