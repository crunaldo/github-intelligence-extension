export type GitHubTarget = {
  owner: string
  repository: string
  ref?: string
  refKind: 'default' | 'branch' | 'commit'
  originalUrl: string
}

export type GitHubLicense = {
  name: string
  spdxId: string | null
  url: string | null
}

export type RepositoryMetadata = {
  id: number
  fullName: string
  owner: string
  name: string
  description: string | null
  htmlUrl: string
  homepage: string | null
  createdAt: string
  updatedAt: string
  pushedAt: string | null
  defaultBranch: string
  stars: number
  forks: number
  watchers: number
  openIssues: number
  sizeKb: number
  archived: boolean
  disabled: boolean
  topics: string[]
  license: GitHubLicense | null
}

export type TreeEntry = {
  path: string
  type: 'blob' | 'tree'
  size: number | null
  sha: string
  url: string
}

export type Dependency = {
  name: string
  requirement: string
  kind: 'runtime' | 'development' | 'optional' | 'unknown'
  manifest: string
}

export type ManifestSummary = {
  path: string
  ecosystem: string
  dependencies: Dependency[]
  runtimeRequirements: RuntimeRequirement[]
  sourceUrl: string
  status: 'read' | 'too-large' | 'unavailable'
}

export type RuntimeRequirement = {
  runtime: string
  requirement: string
  manifest: string
  sourceUrl: string
}

export type EvidenceSource = {
  label: string
  url: string
  status: 'verified' | 'not-found' | 'partial' | 'unavailable'
  detail?: string
}

export type LatestCommit = {
  sha: string
  message: string
  date: string | null
  url: string
}

export type ReleaseAsset = {
  name: string
  size: number
  downloadUrl: string
  contentType: string | null
}

export type LatestRelease = {
  name: string | null
  tagName: string
  publishedAt: string | null
  url: string
  assets: ReleaseAsset[]
} | null

export type RepositoryReport = {
  target: GitHubTarget
  repository: RepositoryMetadata
  resolvedRef: string
  analyzedAt: string
  languages: Array<{ name: string; bytes: number }>
  tree: TreeEntry[]
  treeTruncated: boolean
  treeCountReported: number
  rootDirectories: Array<{ name: string; files: number; directories: number }>
  importantFiles: TreeEntry[]
  readme: { path: string; url: string; text: string } | null
  manifests: ManifestSummary[]
  dependencies: Dependency[]
  runtimeRequirements?: RuntimeRequirement[]
  latestCommit: LatestCommit | null
  latestRelease: LatestRelease
  simpleSummary: string | null
  technicalSummary: string
  sources: EvidenceSource[]
  apiRateLimit: { remaining: number | null; resetAt: string | null }
}

export type RecentAnalysis = {
  fullName: string
  url: string
  analyzedAt: string
  defaultBranch: string
  stars: number
  description: string | null
  languages: Array<{ name: string; bytes: number }>
}

export type AgentStatus = {
  id: string
  name: string
  available: boolean
  version: string | null
  path: string | null
}

export type SystemInformation = {
  platform: string
  osName: string
  osVersion: string
  architecture: string
  cpuName: string | null
  logicalCores: number
  memoryTotalBytes: number
  memoryAvailableBytes: number
  disks: Array<{ name: string; mountPoint: string; totalBytes: number; availableBytes: number }>
  runtimes: Array<{ name: string; available: boolean; version: string | null; path: string | null }>
}
