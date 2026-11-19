export type FileCategory =
  | 'entrypoint'
  | 'config'
  | 'security'
  | 'test'
  | 'style'
  | 'doc'
  | 'general'

export interface FileBadgeInfo {
  category: FileCategory
  label?: string
  iconColor: string
  isCritical: boolean
}

const ENTRYPOINT_NAMES = new Set([
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'main.ts',
  'main.js',
  'main.py',
  'app.ts',
  'app.tsx',
  'app.js',
  'app.jsx',
  'server.ts',
  'server.js',
  'main.go',
  'main.rs',
  'lib.rs',
])

const CONFIG_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'cargo.toml',
  'pyproject.toml',
  'requirements.txt',
  'gemfile',
  'go.mod',
  'wrangler.json',
  'wrangler.jsonc',
  'wrangler.toml',
  '.gitignore',
])

export function classifyFile(filePath: string, vulnerableManifests: string[] = []): FileBadgeInfo {
  if (!filePath) {
    return { category: 'general', iconColor: '#94a3b8', isCritical: false }
  }

  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const fileName = normalized.split('/').pop() || ''

  // 1. Check if manifest is flagged with known vulnerabilities (CVEs)
  if (vulnerableManifests && vulnerableManifests.length > 0) {
    const isVulnerable = vulnerableManifests.some((v) => {
      const vNorm = v.replace(/\\/g, '/').toLowerCase()
      return normalized === vNorm || normalized.endsWith('/' + vNorm) || fileName === vNorm
    })
    if (isVulnerable) {
      return {
        category: 'security',
        label: 'Vulnerable (CVE)',
        iconColor: '#ef4444',
        isCritical: true,
      }
    }
  }

  // 2. Check security sensitive files
  if (
    fileName.startsWith('.env') ||
    fileName.includes('secret') ||
    normalized.includes('/auth/') ||
    normalized.includes('/security/') ||
    fileName === 'security.md'
  ) {
    return {
      category: 'security',
      label: 'Security',
      iconColor: '#f59e0b',
      isCritical: false,
    }
  }

  // 3. Tests
  if (
    fileName.includes('.test.') ||
    fileName.includes('.spec.') ||
    fileName.startsWith('test_') ||
    normalized.includes('/tests/') ||
    normalized.includes('/__tests__/')
  ) {
    return {
      category: 'test',
      label: 'Test',
      iconColor: '#a855f7',
      isCritical: false,
    }
  }

  // 4. Entrypoints
  if (ENTRYPOINT_NAMES.has(fileName)) {
    return {
      category: 'entrypoint',
      label: 'Entrypoint',
      iconColor: '#38bdf8',
      isCritical: true,
    }
  }

  // 5. Config files
  if (
    CONFIG_NAMES.has(fileName) ||
    fileName.endsWith('.config.js') ||
    fileName.endsWith('.config.ts') ||
    fileName.endsWith('.config.mjs')
  ) {
    return {
      category: 'config',
      label: 'Config',
      iconColor: '#eab308',
      isCritical: false,
    }
  }

  // 6. Styles
  if (
    fileName.endsWith('.css') ||
    fileName.endsWith('.scss') ||
    fileName.endsWith('.sass') ||
    fileName.endsWith('.less')
  ) {
    return {
      category: 'style',
      label: 'Style',
      iconColor: '#ec4899',
      isCritical: false,
    }
  }

  // 7. Docs
  if (fileName.endsWith('.md') || fileName.endsWith('.markdown') || fileName === 'license') {
    return {
      category: 'doc',
      label: 'Doc',
      iconColor: '#10b981',
      isCritical: false,
    }
  }

  return {
    category: 'general',
    iconColor: '#94a3b8',
    isCritical: false,
  }
}
