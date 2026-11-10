import { describe, expect, it } from 'vitest'
import {
  evaluateRuntimeCompatibility,
  extractRuntimeRequirements,
  parseGitHubUrl,
  parseFlexibleGitHubUrl,
  extractRepoReference,
  unwrapSocialRedirectUrl,
} from './github'

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

describe('extractRepoReference (Heuristic Social & Web Discovery)', () => {
  it('extracts repos from social formats like github/owner/repo or gh:owner/repo', () => {
    expect(extractRepoReference('mira este proyecto en github/shadcn-ui/ui para ver componentes')).toMatchObject({
      owner: 'shadcn-ui',
      repository: 'ui',
      originalUrl: 'https://github.com/shadcn-ui/ui',
    })

    expect(extractRepoReference('instala gh:astral-sh/uv')).toMatchObject({
      owner: 'astral-sh',
      repository: 'uv',
      originalUrl: 'https://github.com/astral-sh/uv',
    })
  })

  it('extracts standalone owner/repo mentions on Facebook, Reddit, etc.', () => {
    expect(extractRepoReference('Me encanta facebook/react por su ecosistema')).toMatchObject({
      owner: 'facebook',
      repository: 'react',
      originalUrl: 'https://github.com/facebook/react',
    })

    expect(extractRepoReference('"vercel/next.js"')).toMatchObject({
      owner: 'vercel',
      repository: 'next.js',
      originalUrl: 'https://github.com/vercel/next.js',
    })

    expect(extractRepoReference('@tailwindlabs/tailwindcss')).toMatchObject({
      owner: 'tailwindlabs',
      repository: 'tailwindcss',
    })
  })

  it('extracts repos from relative GitHub paths (e.g. on github.com navigation and lists)', () => {
    expect(extractRepoReference('/facebook/react')).toMatchObject({
      owner: 'facebook',
      repository: 'react',
      refKind: 'default',
      originalUrl: 'https://github.com/facebook/react',
    })

    expect(extractRepoReference('/shadcn-ui/ui/tree/main')).toMatchObject({
      owner: 'shadcn-ui',
      repository: 'ui',
      ref: 'main',
      refKind: 'branch',
      originalUrl: 'https://github.com/shadcn-ui/ui/tree/main',
    })

    // Rejects reserved GitHub paths
    expect(extractRepoReference('/settings/profile')).toBeNull()
    expect(extractRepoReference('/notifications')).toBeNull()
    expect(extractRepoReference('/marketplace')).toBeNull()
    expect(extractRepoReference('/pulls')).toBeNull()
    expect(extractRepoReference('/issues')).toBeNull()
  })

  it('rejects false positives like and/or, dates, and MIME types', () => {
    expect(extractRepoReference('Debes elegir and/or en la configuración')).toBeNull()
    expect(extractRepoReference('true/false')).toBeNull()
    expect(extractRepoReference('2024/05')).toBeNull()
    expect(extractRepoReference('text/html')).toBeNull()
    expect(extractRepoReference('image/png')).toBeNull()
    expect(extractRepoReference('about/pricing')).toBeNull()
  })
})

describe('parseFlexibleGitHubUrl', () => {
  it('handles github/owner/repo relaxed format', () => {
    expect(parseFlexibleGitHubUrl('github/facebook/react')).toMatchObject({
      owner: 'facebook',
      repository: 'react',
    })
  })

  it('handles @owner/repo and quotes', () => {
    expect(parseFlexibleGitHubUrl('  "@vuejs/core"  ')).toMatchObject({
      owner: 'vuejs',
      repository: 'core',
    })
  })

  it('unwraps Facebook Link Shim and tracking redirect URLs in parseFlexibleGitHubUrl', () => {
    expect(parseFlexibleGitHubUrl('https://l.facebook.com/l.php?u=https%3A%2F%2Fgithub.com%2Ffacebook%2Freact&h=AT12345')).toMatchObject({
      owner: 'facebook',
      repository: 'react',
    })

    expect(parseFlexibleGitHubUrl('https://github.com/facebook/react?fbclid=IwAR0xyz123')).toMatchObject({
      owner: 'facebook',
      repository: 'react',
    })
  })
})

describe('unwrapSocialRedirectUrl & Social Link Discovery', () => {
  it('unwraps Facebook l.facebook.com link shim correctly', () => {
    const fbShim = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fgithub.com%2Ffacebook%2Freact&h=AT3xyz'
    expect(unwrapSocialRedirectUrl(fbShim)).toBe('https://github.com/facebook/react')
  })

  it('unwraps Reddit outbound redirects', () => {
    const redditUrl = 'https://out.reddit.com/t3_xyz?url=https%3A%2F%2Fgithub.com%2Fastral-sh%2Fuv'
    expect(unwrapSocialRedirectUrl(redditUrl)).toBe('https://github.com/astral-sh/uv')
  })

  it('unwraps Google redirect URLs', () => {
    const googleUrl = 'https://www.google.com/url?q=https://github.com/shadcn-ui/ui&sa=D'
    expect(unwrapSocialRedirectUrl(googleUrl)).toBe('https://github.com/shadcn-ui/ui')
  })

  it('cleans tracking parameters like fbclid and utm_source from github URLs', () => {
    const dirtyUrl = 'https://github.com/tailwindlabs/tailwindcss?fbclid=IwAR123&utm_source=facebook'
    expect(unwrapSocialRedirectUrl(dirtyUrl)).toBe('https://github.com/tailwindlabs/tailwindcss')
  })

  it('extracts repo reference from right-clicked Facebook link shim', () => {
    const fbLinkUrl = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fgithub.com%2Ffacebook%2Freact%3Ffbclid%3DIwAR123&h=AT123'
    expect(extractRepoReference(fbLinkUrl)).toMatchObject({
      owner: 'facebook',
      repository: 'react',
      originalUrl: 'https://github.com/facebook/react',
    })
  })

  it('unwraps real Facebook link with heavy tracking payload (e.g. addyosmani/agent-skills)', () => {
    const userFbUrl = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fgithub.com%2Faddyosmani%2Fagent-skills%3Ffbclid%3DIwZXh0bgNhZW0CMTAAcGRvZgVicmlkETFnMTZ0Tk9HT0thdnJiNWVkc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABHzQUR-dFhNy1ksuyLh6Kx9gDDdyEOFwxogyqn0UFWkfC3ThSFSpWZzCJ1PAX_aem__SrvT1UX-1UOFPWjIxTVAg&h=AUBk4H2XYA7EKfmmseaeQxjbiABJKOcbNANpjwcpHxcjoqy-M5eNjv_8w8V4yhltEiLQt6G6hT3YdFbKzdg4QeP2FQFvQtehPUKl0NXTfQ_ICO2N21-BYlTWHG1NBnlrCpW0HF3zYEcm1w&__tn__=K'
    
    expect(unwrapSocialRedirectUrl(userFbUrl)).toBe('https://github.com/addyosmani/agent-skills')
    
    expect(parseFlexibleGitHubUrl(userFbUrl)).toMatchObject({
      owner: 'addyosmani',
      repository: 'agent-skills',
      originalUrl: 'https://github.com/addyosmani/agent-skills',
    })

    expect(extractRepoReference(userFbUrl)).toMatchObject({
      owner: 'addyosmani',
      repository: 'agent-skills',
      originalUrl: 'https://github.com/addyosmani/agent-skills',
    })
  })
})
