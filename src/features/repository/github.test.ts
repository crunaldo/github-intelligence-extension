import { describe, expect, it } from 'vitest'
import { evaluateRuntimeCompatibility, extractRuntimeRequirements, parseGitHubUrl } from './github'

describe('parseGitHubUrl', () => {
  it('accepts a repository URL and normalizes a trailing slash and .git suffix', () => {
    expect(parseGitHubUrl(' https://github.com/rust-lang/rust.git/ ')).toMatchObject({
      owner: 'rust-lang',
      repository: 'rust',
      refKind: 'default',
      originalUrl: 'https://github.com/rust-lang/rust',
    })
  })

  it('preserves nested branch names from GitHub tree URLs', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/tree/release/stable')).toMatchObject({
      owner: 'owner',
      repository: 'repo',
      ref: 'release/stable',
      refKind: 'branch',
    })
  })

  it('accepts a commit URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/commit/0123456789abcdef')).toMatchObject({
      ref: '0123456789abcdef',
      refKind: 'commit',
    })
  })

  it.each([
    'http://github.com/owner/repo',
    'https://github.com.evil.test/owner/repo',
    'https://user:secret@github.com/owner/repo',
    'https://github.com/owner/repo?tab=readme',
    'https://github.com/owner/repo/issues',
    'https://github.com/owner',
  ])('rejects unsupported or ambiguous URL %s', (url) => {
    expect(() => parseGitHubUrl(url)).toThrow()
  })
})

describe('extractRuntimeRequirements', () => {
  it('reads runtime constraints from supported manifests and keeps their source', () => {
    expect(extractRuntimeRequirements('package.json', '{"engines":{"node":">=20"}}', 'https://github.com/owner/repo/blob/main/package.json')).toEqual([
      { runtime: 'Node.js', requirement: '>=20', manifest: 'package.json', sourceUrl: 'https://github.com/owner/repo/blob/main/package.json' },
    ])
    expect(extractRuntimeRequirements('Cargo.toml', 'rust-version = "1.86"', 'https://github.com/owner/repo/blob/main/Cargo.toml')[0]).toMatchObject({
      runtime: 'Rust',
      requirement: '1.86',
    })
  })
})

describe('evaluateRuntimeCompatibility', () => {
  it('compares installed runtime versions against manifest constraints', () => {
    expect(evaluateRuntimeCompatibility('22.14.0', '>=20')).toBe('compatible')
    expect(evaluateRuntimeCompatibility('18.19.0', '>=20')).toBe('incompatible')
    expect(evaluateRuntimeCompatibility('1.90.0', '1.86')).toBe('compatible')
    expect(evaluateRuntimeCompatibility('8.0.404', 'net8.0')).toBe('compatible')
    expect(evaluateRuntimeCompatibility(null, '>=20')).toBe('unverified')
  })
})
