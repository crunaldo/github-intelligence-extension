import type { RepositoryReport } from './types'

export type ReportExportFormat = 'markdown' | 'json'

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'repository'
}

function markdownText(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+.!|>])/g, '\\$1').replace(/\r?\n/g, ' ')
}

function codeText(value: string): string {
  return `\`${value.replaceAll('`', '\\`')}\``
}

export function createReportExport(report: RepositoryReport, format: ReportExportFormat): { name: string; mimeType: string; contents: string } {
  const outputName = safeName(report.repository.fullName)
  const runtimeRequirements = report.runtimeRequirements ?? []
  if (format === 'json') {
    return {
      name: `${outputName}-report.json`,
      mimeType: 'application/json;charset=utf-8',
      contents: `${JSON.stringify(report, null, 2)}\n`,
    }
  }

  const repository = report.repository
  const lines = [
    `# ${markdownText(repository.fullName)}`,
    '',
    `Source: ${repository.htmlUrl}`,
    `Analyzed: ${report.analyzedAt}`,
    `Reference: ${codeText(report.resolvedRef)}`,
    `Latest commit: ${report.latestCommit ? `${codeText(report.latestCommit.sha.slice(0, 12))} — ${markdownText(report.latestCommit.message)}` : 'Not available'}`,
    '',
    '## Overview',
    '',
    `- Description: ${markdownText(repository.description ?? 'Not available')}`,
    `- Default branch: ${codeText(repository.defaultBranch || 'Not identified')}`,
    `- Last pushed: ${repository.pushedAt ?? 'Not available'}`,
    `- Stars / forks / watchers: ${repository.stars.toLocaleString()} / ${repository.forks.toLocaleString()} / ${repository.watchers.toLocaleString()}`,
    `- Open issues: ${repository.openIssues.toLocaleString()}`,
    `- Archived: ${repository.archived ? 'Yes' : 'No'}`,
    `- License: ${repository.license ? markdownText(repository.license.name) : 'Not identified'}`,
    '',
    '## Languages',
    '',
    ...(report.languages.length ? report.languages.map(({ name, bytes }) => `- ${markdownText(name)}: ${bytes.toLocaleString()} bytes`) : ['- Not available from GitHub.']),
    '',
    '## Architecture evidence',
    '',
    `Repository tree entries: ${report.treeCountReported.toLocaleString()}${report.treeTruncated ? ' (truncated; this view is incomplete)' : ''}.`,
    ...report.rootDirectories.map((entry) => `- ${codeText(entry.name + '/')} — ${entry.files.toLocaleString()} files and ${entry.directories.toLocaleString()} nested folders`),
    ...(report.rootDirectories.length === 0 ? ['- Root directory summary is unavailable.'] : []),
    '',
    '## Key files',
    '',
    ...(report.importantFiles.length ? report.importantFiles.map((file) => `- [${codeText(file.path)}](${file.url || repository.htmlUrl})`) : ['- No key files were identified in the available tree.']),
    '',
    '## Dependencies',
    '',
    ...(report.manifests.length ? report.manifests.flatMap((manifest) => [
      `### ${codeText(manifest.path)} (${markdownText(manifest.ecosystem)})`,
      '',
      manifest.status === 'read' && manifest.dependencies.length ? manifest.dependencies.map((dependency) => `- ${codeText(dependency.name)} — ${markdownText(dependency.requirement)} (${dependency.kind})`) : `- ${manifest.status === 'read' ? 'No direct dependencies were parsed.' : `Manifest status: ${manifest.status}.`}`,
      '',
    ].flat()) : ['- No supported manifests were identified in the available tree.']),
    '## Compatibility',
    '',
    '- Windows support: Not confirmed from repository metadata.',
    '- Minimum CPU / memory: Not identified in inspected manifests.',
    ...(runtimeRequirements.length
      ? runtimeRequirements.map((requirement) => `- ${markdownText(requirement.runtime)} ${markdownText(requirement.requirement)} — declared in [${codeText(requirement.manifest)}](${requirement.sourceUrl})`)
      : ['- No supported runtime version requirement was found in the inspected manifests.']),
    '- Local computer details are excluded from this export.',
    '',
    '## Installation',
    '',
    ...(report.latestRelease ? [
      `Latest release: [${markdownText(report.latestRelease.name || report.latestRelease.tagName)}](${report.latestRelease.url}) (${codeText(report.latestRelease.tagName)}).`,
      ...(report.latestRelease.assets.length ? report.latestRelease.assets.map((asset) => `- [${markdownText(asset.name)}](${asset.downloadUrl}) — ${asset.size.toLocaleString()} bytes`) : ['- No downloadable assets were attached to this release.']),
    ] : ['No GitHub release was found. Check the source repository for project-specific installation guidance.']),
    '',
    '## Sources',
    '',
    ...report.sources.map((source) => `- [${markdownText(source.label)}](${source.url}) — ${source.status}${source.detail ? `; ${markdownText(source.detail)}` : ''}`),
    '',
    '> Repository content is untrusted. No code, scripts, or installers were executed during analysis.',
    '',
  ]

  return { name: `${outputName}-report.md`, mimeType: 'text/markdown;charset=utf-8', contents: lines.join('\n') }
}

export async function downloadReport(report: RepositoryReport, format: ReportExportFormat): Promise<boolean> {
  const file = createReportExport(report, format)
  const blob = new Blob([file.contents], { type: file.mimeType })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = file.name
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000)
  return true
}
