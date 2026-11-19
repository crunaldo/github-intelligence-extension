import { describe, it, expect } from 'vitest'
import { generateNativeArchitectureDiagram } from './nativeArchitectureGenerator'
import type { RepositoryReport } from '../../features/repository/types'

describe('generateNativeArchitectureDiagram', () => {
  const mockBaseReport: RepositoryReport = {
    target: {
      owner: 'facebook',
      repository: 'react',
      refKind: 'default',
      originalUrl: 'https://github.com/facebook/react',
    },
    repository: {
      id: 10270250,
      fullName: 'facebook/react',
      owner: 'facebook',
      name: 'react',
      description: 'The library for web and native user interfaces.',
      htmlUrl: 'https://github.com/facebook/react',
      homepage: 'https://react.dev',
      createdAt: '2013-05-24T16:15:54Z',
      updatedAt: '2026-11-19T00:00:00Z',
      pushedAt: '2026-11-19T00:00:00Z',
      defaultBranch: 'main',
      stars: 220000,
      forks: 45000,
      watchers: 6600,
      openIssues: 800,
      sizeKb: 350000,
      archived: false,
      disabled: false,
      topics: ['javascript', 'react', 'ui'],
      license: { name: 'MIT License', spdxId: 'MIT', url: 'https://spdx.org/licenses/MIT.html' },
    },
    resolvedRef: 'main',
    analyzedAt: new Date().toISOString(),
    languages: [{ name: 'JavaScript', bytes: 800000 }, { name: 'TypeScript', bytes: 200000 }],
    tree: [
      { path: 'packages/react/src/React.js', type: 'blob', size: 1200, sha: 'abc', url: '' },
      { path: 'packages/react-dom/src/client/ReactDOM.js', type: 'blob', size: 2400, sha: 'def', url: '' },
      { path: 'packages/react/components/Button.jsx', type: 'blob', size: 500, sha: 'ghi', url: '' },
    ],
    treeTruncated: false,
    treeCountReported: 3,
    rootDirectories: [{ name: 'packages', files: 3, directories: 2 }],
    importantFiles: [
      { path: 'package.json', type: 'blob', size: 1000, sha: '123', url: '' },
      { path: 'README.md', type: 'blob', size: 2000, sha: '456', url: '' },
    ],
    readme: { path: 'README.md', url: '', text: 'React' },
    manifests: [
      {
        path: 'package.json',
        ecosystem: 'npm',
        dependencies: [
          { name: 'scheduler', requirement: '^0.23.0', kind: 'runtime', manifest: 'package.json' },
          { name: 'loose-envify', requirement: '^1.1.0', kind: 'runtime', manifest: 'package.json' },
        ],
        runtimeRequirements: [],
        sourceUrl: '',
        status: 'read',
      },
    ],
    dependencies: [
      { name: 'scheduler', requirement: '^0.23.0', kind: 'runtime', manifest: 'package.json' },
      { name: 'loose-envify', requirement: '^1.1.0', kind: 'runtime', manifest: 'package.json' },
    ],
    latestCommit: { sha: 'a1b2c3d', message: 'Release v19.0.0', date: '2026-11-18', url: '' },
    latestRelease: null,
    simpleSummary: 'A declarative, efficient library for building user interfaces.',
    technicalSummary: 'React core packages and reconciler.',
    sources: [],
    apiRateLimit: { remaining: 5000, resetAt: null },
  }

  it('generates a valid Mermaid flowchart syntax for a frontend project', () => {
    const diagram = generateNativeArchitectureDiagram(mockBaseReport, 'es')
    expect(diagram).toContain('graph TD')
    expect(diagram).toContain('Root["🚀 react (JavaScript)"]')
    expect(diagram).toContain('UI["🎨 Capa Visual & UI')
    expect(diagram).toContain('Core["⚙️ Lógica Core & Estado')
    expect(diagram).toContain('Deps["📦 Dependencias Clave')
    expect(diagram).toContain('scheduler')
    expect(diagram).toContain('classDef rootNode')
  })

  it('generates English labels when locale is en', () => {
    const diagram = generateNativeArchitectureDiagram(mockBaseReport, 'en')
    expect(diagram).toContain('graph TD')
    expect(diagram).toContain('UI["🎨 UI & Presentation Layer')
    expect(diagram).toContain('Core["⚙️ Core Logic & State')
    expect(diagram).toContain('Deps["📦 Key Dependencies')
  })

  it('detects backend and database layers when api and prisma files exist', () => {
    const backendReport: RepositoryReport = {
      ...mockBaseReport,
      tree: [
        { path: 'src/api/routes.ts', type: 'blob', size: 1000, sha: '1', url: '' },
        { path: 'src/controllers/auth.ts', type: 'blob', size: 1000, sha: '2', url: '' },
        { path: 'prisma/schema.prisma', type: 'blob', size: 1000, sha: '3', url: '' },
        { path: 'src/models/User.ts', type: 'blob', size: 1000, sha: '4', url: '' },
      ],
      dependencies: [
        { name: 'express', requirement: '^4.19.0', kind: 'runtime', manifest: 'package.json' },
        { name: 'prisma', requirement: '^5.0.0', kind: 'runtime', manifest: 'package.json' },
        { name: 'pg', requirement: '^8.11.0', kind: 'runtime', manifest: 'package.json' },
      ],
    }

    const diagram = generateNativeArchitectureDiagram(backendReport, 'es')
    expect(diagram).toContain('API["🌐 Servicios & Rutas API')
    expect(diagram).toContain('Data["💾 Datos & Persistencia')
    expect(diagram).toContain('Express/Fastify')
    expect(diagram).toContain('Prisma ORM')
  })

  it('detects CLI tools when bin or cli files exist without UI', () => {
    const cliReport: RepositoryReport = {
      ...mockBaseReport,
      tree: [
        { path: 'bin/run.js', type: 'blob', size: 1000, sha: '1', url: '' },
        { path: 'src/cli.ts', type: 'blob', size: 1000, sha: '2', url: '' },
        { path: 'src/commands/build.ts', type: 'blob', size: 1000, sha: '3', url: '' },
      ],
      dependencies: [
        { name: 'commander', requirement: '^11.0.0', kind: 'runtime', manifest: 'package.json' },
      ],
    }

    const diagram = generateNativeArchitectureDiagram(cliReport, 'es')
    expect(diagram).toContain('CLI["⚡ Línea de Comandos (CLI)')
    expect(diagram).not.toContain('Capa Visual & UI')
  })
})
