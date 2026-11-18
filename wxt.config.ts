import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'GitHub Project Intelligence Assistant',
    description: 'Analizador inteligente de repositorios de GitHub con diagramas de arquitectura interactivos, auditoría de seguridad & licencias.',
    version: '2.0.0',
    permissions: [
      'activeTab',
      'storage',
      'unlimitedStorage',
      'tabs',
      'sidePanel',
      'contextMenus',
      'clipboardWrite',
      'identity',
      'system.cpu',
      'system.memory',
      'system.storage',
    ],
    host_permissions: [
      'https://api.github.com/*',
      'https://github.com/*',
      'https://raw.githubusercontent.com/*',
      'https://api.osv.dev/*',
      'https://translate.googleapis.com/*',
      'https://api.mymemory.translated.net/*',
      'https://*.workers.dev/*',
      'https://*.supabase.co/*',
    ],
    icons: {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    action: {
      default_title: 'GitHub Intelligence Assistant',
    },
  },
})
