import React from 'react'
import {
  FileCode,
  FileJson,
  FileText,
  Palette,
  Database,
  Terminal,
  Image,
  FileArchive,
  File,
} from 'lucide-react'

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

// =============================================================================
// File Icon Themes (VS Code Material, Seti UI, GitHub Native)
// =============================================================================
export type IconTheme = 'vscode' | 'seti' | 'github'

export interface FileIconDescriptor {
  iconType: 'code' | 'json' | 'text' | 'style' | 'database' | 'terminal' | 'image' | 'archive' | 'config' | 'default'
  color: string
  language: string
}

type LanguageDef = {
  language: string
  iconType: FileIconDescriptor['iconType']
  colors: Record<IconTheme, string>
}

const THEME_PALETTES: Record<string, LanguageDef> = {
  python: {
    language: 'python',
    iconType: 'code',
    colors: { vscode: '#3776ab', seti: '#3572a5', github: '#3fb950' },
  },
  rust: {
    language: 'rust',
    iconType: 'code',
    colors: { vscode: '#dea584', seti: '#d36135', github: '#bc8cff' },
  },
  typescript: {
    language: 'typescript',
    iconType: 'code',
    colors: { vscode: '#3178c6', seti: '#519aba', github: '#58a6ff' },
  },
  typescriptreact: {
    language: 'typescriptreact',
    iconType: 'code',
    colors: { vscode: '#3178c6', seti: '#519aba', github: '#58a6ff' },
  },
  javascript: {
    language: 'javascript',
    iconType: 'code',
    colors: { vscode: '#f7df1e', seti: '#cbcb41', github: '#d29922' },
  },
  javascriptreact: {
    language: 'javascriptreact',
    iconType: 'code',
    colors: { vscode: '#61dafb', seti: '#519aba', github: '#58a6ff' },
  },
  go: {
    language: 'go',
    iconType: 'code',
    colors: { vscode: '#00add8', seti: '#519aba', github: '#3fb950' },
  },
  java: {
    language: 'java',
    iconType: 'code',
    colors: { vscode: '#b07219', seti: '#cc3e44', github: '#d29922' },
  },
  kotlin: {
    language: 'kotlin',
    iconType: 'code',
    colors: { vscode: '#7f52ff', seti: '#f18e33', github: '#bc8cff' },
  },
  c: {
    language: 'c',
    iconType: 'code',
    colors: { vscode: '#a8b9cc', seti: '#519aba', github: '#7d8590' },
  },
  cpp: {
    language: 'cpp',
    iconType: 'code',
    colors: { vscode: '#f34b7d', seti: '#519aba', github: '#f78166' },
  },
  csharp: {
    language: 'csharp',
    iconType: 'code',
    colors: { vscode: '#178600', seti: '#178600', github: '#3fb950' },
  },
  ruby: {
    language: 'ruby',
    iconType: 'code',
    colors: { vscode: '#701516', seti: '#cc3e44', github: '#f78166' },
  },
  php: {
    language: 'php',
    iconType: 'code',
    colors: { vscode: '#4f5d95', seti: '#a074c4', github: '#bc8cff' },
  },
  swift: {
    language: 'swift',
    iconType: 'code',
    colors: { vscode: '#f05138', seti: '#e37933', github: '#f78166' },
  },
  shell: {
    language: 'shell',
    iconType: 'terminal',
    colors: { vscode: '#89e051', seti: '#4d5a5e', github: '#3fb950' },
  },
  sql: {
    language: 'sql',
    iconType: 'database',
    colors: { vscode: '#e38c00', seti: '#f1e05a', github: '#58a6ff' },
  },
  html: {
    language: 'html',
    iconType: 'code',
    colors: { vscode: '#e34c26', seti: '#e44d26', github: '#f78166' },
  },
  css: {
    language: 'css',
    iconType: 'style',
    colors: { vscode: '#563d7c', seti: '#42a5f5', github: '#58a6ff' },
  },
  json: {
    language: 'json',
    iconType: 'json',
    colors: { vscode: '#cb171e', seti: '#cbcb41', github: '#d29922' },
  },
  yaml: {
    language: 'yaml',
    iconType: 'json',
    colors: { vscode: '#cb171e', seti: '#8dc149', github: '#d29922' },
  },
  toml: {
    language: 'toml',
    iconType: 'config',
    colors: { vscode: '#9c4221', seti: '#8dc149', github: '#d29922' },
  },
  docker: {
    language: 'docker',
    iconType: 'code',
    colors: { vscode: '#2496ed', seti: '#388e3c', github: '#58a6ff' },
  },
  markdown: {
    language: 'markdown',
    iconType: 'text',
    colors: { vscode: '#083fa1', seti: '#4d5a5e', github: '#7d8590' },
  },
  text: {
    language: 'text',
    iconType: 'text',
    colors: { vscode: '#94a3b8', seti: '#6d8086', github: '#7d8590' },
  },
  image: {
    language: 'image',
    iconType: 'image',
    colors: { vscode: '#a855f7', seti: '#a074c4', github: '#bc8cff' },
  },
  archive: {
    language: 'archive',
    iconType: 'archive',
    colors: { vscode: '#eab308', seti: '#e69f00', github: '#d29922' },
  },
  git: {
    language: 'git',
    iconType: 'config',
    colors: { vscode: '#f05032', seti: '#cc3e44', github: '#f78166' },
  },
  default: {
    language: 'unknown',
    iconType: 'default',
    colors: { vscode: '#94a3b8', seti: '#6d8086', github: '#7d8590' },
  },
}

function resolveLanguage(fileName: string): string {
  const lower = fileName.toLowerCase()

  if (lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower.includes('docker-compose')) return 'docker'
  if (lower.startsWith('.git') || lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') return 'git'
  if (lower === 'gemfile') return 'ruby'

  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''

  switch (ext) {
    case 'py':
    case 'ipynb':
    case 'pyw':
      return 'python'
    case 'rs':
      return 'rust'
    case 'tsx':
      return 'typescriptreact'
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'jsx':
      return 'javascriptreact'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'go':
      return 'go'
    case 'java':
      return 'java'
    case 'kt':
    case 'kts':
      return 'kotlin'
    case 'c':
    case 'h':
      return 'c'
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'cpp'
    case 'cs':
      return 'csharp'
    case 'rb':
      return 'ruby'
    case 'php':
      return 'php'
    case 'swift':
      return 'swift'
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell'
    case 'sql':
    case 'prisma':
      return 'sql'
    case 'html':
    case 'htm':
      return 'html'
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css'
    case 'json':
      return 'json'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'toml':
    case 'ini':
      return 'toml'
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'txt':
    case 'log':
      return 'text'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return 'image'
    case 'zip':
    case 'tar':
    case 'gz':
    case '7z':
    case 'rar':
      return 'archive'
    default:
      return 'default'
  }
}

export function getFileIconDescriptor(fileName: string, theme: IconTheme = 'vscode'): FileIconDescriptor {
  const langKey = resolveLanguage(fileName)
  const def = THEME_PALETTES[langKey] || THEME_PALETTES.default
  const color = def.colors[theme] || def.colors.vscode

  return {
    iconType: def.iconType,
    color,
    language: def.language,
  }
}

export function getFileIcon(fileName: string, theme: IconTheme = 'vscode', size: number = 13): React.ReactNode {
  const desc = getFileIconDescriptor(fileName, theme)
  const style = { color: desc.color, flexShrink: 0 }

  switch (desc.iconType) {
    case 'code':
      return React.createElement(FileCode, { size, style })
    case 'json':
      return React.createElement(FileJson, { size, style })
    case 'database':
      return React.createElement(Database, { size, style })
    case 'terminal':
      return React.createElement(Terminal, { size, style })
    case 'style':
      return React.createElement(Palette, { size, style })
    case 'text':
      return React.createElement(FileText, { size, style })
    case 'image':
      return React.createElement(Image, { size, style })
    case 'archive':
      return React.createElement(FileArchive, { size, style })
    case 'config':
      return React.createElement(FileCode, { size, style })
    default:
      return React.createElement(File, { size, style })
  }
}
