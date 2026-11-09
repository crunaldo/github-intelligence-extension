import { useState } from 'react'
import type { RepositoryReport } from '../../features/repository/types'
import type { ActiveLocale } from '../i18n'
import { TerminalSnippet, type TerminalOption } from './TerminalSnippet'

type PackageInstallCommandProps = {
  report: RepositoryReport
  locale?: ActiveLocale
}

type InstallOption = {
  label: string
  command: string
  tool: string
}

export function detectInstallCommands(report: RepositoryReport): {
  ecosystem: string
  options: InstallOption[]
} {
  const manifests = report.manifests || []
  const manifestPaths = manifests.map((m) => (m.path || '').toLowerCase())
  const languages = report.languages || []
  const topLang = languages[0]?.name || ''
  const repoName = report.repository.name
  const fullName = report.repository.fullName

  // 1. Node.js / JavaScript / TypeScript
  const hasNodeManifest = manifestPaths.some((p) => p.endsWith('package.json'))
  const isNodeLang = ['TypeScript', 'JavaScript'].includes(topLang)
  if (hasNodeManifest || isNodeLang) {
    const pkg = repoName.toLowerCase()
    return {
      ecosystem: 'Node.js',
      options: [
        { tool: 'npm', label: 'npm', command: `npm i ${pkg}` },
        { tool: 'pnpm', label: 'pnpm', command: `pnpm add ${pkg}` },
        { tool: 'yarn', label: 'yarn', command: `yarn add ${pkg}` },
        { tool: 'bun', label: 'bun', command: `bun add ${pkg}` },
      ],
    }
  }

  // 2. Python
  const hasPythonManifest = manifestPaths.some(
    (p) => p.endsWith('pyproject.toml') || p.endsWith('requirements.txt') || p.endsWith('setup.py')
  )
  if (hasPythonManifest || topLang === 'Python') {
    const pkg = repoName.toLowerCase().replace(/_/g, '-')
    return {
      ecosystem: 'Python',
      options: [
        { tool: 'pip', label: 'pip', command: `pip install ${pkg}` },
        { tool: 'uv', label: 'uv', command: `uv add ${pkg}` },
        { tool: 'poetry', label: 'poetry', command: `poetry add ${pkg}` },
      ],
    }
  }

  // 3. Rust
  const hasRustManifest = manifestPaths.some((p) => p.endsWith('cargo.toml'))
  if (hasRustManifest || topLang === 'Rust') {
    const pkg = repoName.toLowerCase().replace(/_/g, '-')
    return {
      ecosystem: 'Rust',
      options: [
        { tool: 'cargo', label: 'cargo', command: `cargo add ${pkg}` },
      ],
    }
  }

  // 4. Go
  const hasGoManifest = manifestPaths.some((p) => p.endsWith('go.mod'))
  if (hasGoManifest || topLang === 'Go') {
    return {
      ecosystem: 'Go',
      options: [
        { tool: 'go', label: 'go get', command: `go get github.com/${fullName}` },
      ],
    }
  }

  // 5. PHP
  const hasComposerManifest = manifestPaths.some((p) => p.endsWith('composer.json'))
  if (hasComposerManifest || topLang === 'PHP') {
    return {
      ecosystem: 'PHP',
      options: [
        { tool: 'composer', label: 'composer', command: `composer require ${fullName.toLowerCase()}` },
      ],
    }
  }

  // 6. Generic Git Clone fallback
  return {
    ecosystem: 'Git',
    options: [
      { tool: 'git', label: 'clone', command: `git clone https://github.com/${fullName}.git` },
      { tool: 'gh', label: 'gh cli', command: `gh repo clone ${fullName}` },
    ],
  }
}

export function PackageInstallCommand({ report, locale = 'es' }: PackageInstallCommandProps) {
  const { ecosystem, options } = detectInstallCommands(report)
  const [selectedTool, setSelectedTool] = useState(options[0]?.tool || 'npm')

  if (!options || options.length === 0) return null

  const terminalOptions: TerminalOption[] = options.map((opt) => ({
    id: opt.tool,
    label: opt.label,
    command: opt.command,
  }))

  return (
    <div className="package-install-box" style={{ padding: 0, border: 'none', background: 'transparent' }}>
      <TerminalSnippet
        title={`install — ${ecosystem}`}
        options={terminalOptions}
        selectedOptionId={selectedTool}
        onOptionChange={setSelectedTool}
        locale={locale}
      />
    </div>
  )
}
