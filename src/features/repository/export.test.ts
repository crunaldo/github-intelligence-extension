import { describe, expect, it } from 'vitest'
import { createReportExport } from './export'
import type { RepositoryReport } from './types'

const report: RepositoryReport = {
  target: { owner: 'sample', repository: 'project', refKind: 'default', originalUrl: 'https://github.com/sample/project' },
  repository: {
    id: 1,
    fullName: 'sample/project',
    owner: 'sample',
    name: 'project',
    description: 'A useful project | with notes',
    htmlUrl: 'https://github.com/sample/project',
    homepage: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    pushedAt: '2025-01-02T00:00:00Z',
    defaultBranch: 'main',
    stars: 42,
    forks: 3,
    watchers: 7,
    openIssues: 2,
    sizeKb: 100,
    archived: false,
    disabled: false,
    topics: [],
    license: { name: 'MIT License', spdxId: 'MIT', url: null },
  },
  resolvedRef: 'main',
  analyzedAt: '2025-01-03T00:00:00Z',
  languages: [{ name: 'Rust', bytes: 1200 }],
  tree: [],
  treeTruncated: false,
  treeCountReported: 0,
  rootDirectories: [],
  importantFiles: [],
  readme: null,
  manifests: [],
  dependencies: [],
  latestCommit: null,
  latestRelease: null,
  simpleSummary: null,
  technicalSummary: 'GitHub repository metadata was read.',
  sources: [{ label: 'Repository metadata', url: 'https://api.github.com/repos/sample/project', status: 'verified' }],
  apiRateLimit: { remaining: 60, resetAt: null },
}

describe('createReportExport', () => {
  it('creates a source-linked Markdown report and escapes inline description characters', () => {
    const output = createReportExport(report, 'markdown')
    expect(output.name).toBe('sample-project-report.md')
    expect(output.mimeType).toContain('text/markdown')
    expect(output.contents).toContain('https://github.com/sample/project')
    expect(output.contents).toContain('A useful project \\| with notes')
    expect(output.contents).toContain('No GitHub release was found.')
  })

  it('creates complete structured JSON without injecting local computer details', () => {
    const output = createReportExport(report, 'json')
    expect(output.name).toBe('sample-project-report.json')
    expect(JSON.parse(output.contents)).toMatchObject({ repository: { fullName: 'sample/project' }, resolvedRef: 'main' })
    expect(output.contents).not.toContain('cpuName')
    expect(output.contents).not.toContain('memoryTotalBytes')
  })

  it('includes sourced runtime requirements without exporting local compatibility data', () => {
    const enriched = { ...report, runtimeRequirements: [{ runtime: 'Node.js', requirement: '>=20', manifest: 'package.json', sourceUrl: 'https://github.com/sample/project/blob/main/package.json' }] }
    const output = createReportExport(enriched, 'markdown')
    expect(output.contents).toContain('\\>=20')
    expect(output.contents).toContain('package.json')
    expect(output.contents).not.toContain('Windows 11')
  })
})
