import { describe, expect, it } from 'vitest'
import {
  evaluateRuntimeCompatibility,
  extractRuntimeRequirements,
  parseGitHubUrl,
  parseFlexibleGitHubUrl,
  extractRepoReference,
  extractRepoFromUrl,
  extractRepoFromAnchorData,
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

  it('requires allowRelativePath for leading-slash paths so non-GitHub site paths never false-positive', () => {
    // Default extraction MUST reject relative paths (prevents matching /r/programming, /groups/123, /news/tech)
    expect(extractRepoReference('/facebook/react')).toBeNull()
    expect(extractRepoReference('/r/programming')).toBeNull()
    expect(extractRepoReference('/groups/123456')).toBeNull()

    // Explicit github.com context opt-in still works
    expect(extractRepoReference('/facebook/react', { allowRelativePath: true })).toMatchObject({
      owner: 'facebook',
      repository: 'react',
      refKind: 'default',
      originalUrl: 'https://github.com/facebook/react',
    })

    expect(extractRepoReference('/shadcn-ui/ui/tree/main', { allowRelativePath: true })).toMatchObject({
      owner: 'shadcn-ui',
      repository: 'ui',
      ref: 'main',
      refKind: 'branch',
      originalUrl: 'https://github.com/shadcn-ui/ui/tree/main',
    })

    // Rejects reserved GitHub paths even with allowRelativePath
    expect(extractRepoReference('/settings/profile', { allowRelativePath: true })).toBeNull()
    expect(extractRepoReference('/notifications', { allowRelativePath: true })).toBeNull()
    expect(extractRepoReference('/marketplace', { allowRelativePath: true })).toBeNull()
    expect(extractRepoReference('/pulls', { allowRelativePath: true })).toBeNull()
    expect(extractRepoReference('/issues', { allowRelativePath: true })).toBeNull()
    expect(extractRepoReference('/apps/dependabot', { allowRelativePath: true })).toBeNull()
  })

  it('rejects false positives like and/or, dates, Reddit shortcuts, and MIME types', () => {
    expect(extractRepoReference('Debes elegir and/or en la configuración')).toBeNull()
    expect(extractRepoReference('true/false')).toBeNull()
    expect(extractRepoReference('2024/05')).toBeNull()
    expect(extractRepoReference('text/html')).toBeNull()
    expect(extractRepoReference('image/png')).toBeNull()
    expect(extractRepoReference('about/pricing')).toBeNull()
    expect(extractRepoReference('UI/UX')).toBeNull()
    expect(extractRepoReference('CI/CD')).toBeNull()
    expect(extractRepoReference('r/programming')).toBeNull()
    expect(extractRepoReference('u/someuser')).toBeNull()
  })

  it('rejects non-repo GitHub subdomains such as docs.github.com and gist.github.com', () => {
    expect(extractRepoReference('https://docs.github.com/en/copilot')).toBeNull()
    expect(extractRepoReference('https://gist.github.com/addyosmani/123456')).toBeNull()
    expect(extractRepoReference('https://skills.github.com/intro/course')).toBeNull()
    expect(extractRepoFromUrl('https://docs.github.com/en/actions')).toBeNull()
    expect(extractRepoFromUrl('https://gist.github.com/user/abcdef')).toBeNull()
  })
})

describe('extractRepoFromAnchorData (Tooltip & Hover Accuracy)', () => {
  it('NEVER triggers on non-GitHub relative URLs or generic slash link labels', () => {
    expect(extractRepoFromAnchorData({
      rawHref: '/r/technology/comments/abc123',
      fullHref: 'https://www.reddit.com/r/technology/comments/abc123',
      innerText: 'r/technology',
      pageHostname: 'www.reddit.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '/groups/987654/posts/123',
      fullHref: 'https://www.facebook.com/groups/987654/posts/123',
      innerText: 'UI/UX',
      pageHostname: 'www.facebook.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '/es/tecnologia/articulo',
      fullHref: 'https://elpais.com/es/tecnologia/articulo',
      innerText: 'España/Mundo',
      pageHostname: 'elpais.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '/search?q=ci/cd',
      fullHref: 'https://www.google.com/search?q=ci/cd',
      innerText: 'CI/CD tutorial',
      pageHostname: 'www.google.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fdev.to%2Fauthor%2Fpost',
      fullHref: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fdev.to%2Fauthor%2Fpost',
      innerText: 'Aprender UI/UX y AI/ML',
      pageHostname: 'www.facebook.com',
    })).toBeNull()
  })

  it('detects GitHub repository links on github.com while ignoring files, issues, anchors, and UI tabs', () => {
    expect(extractRepoFromAnchorData({
      rawHref: '/facebook/react',
      fullHref: 'https://github.com/facebook/react',
      innerText: 'facebook / react',
      pageHostname: 'github.com',
    })).toMatchObject({
      owner: 'facebook',
      repository: 'react',
      originalUrl: 'https://github.com/facebook/react',
    })

    expect(extractRepoFromAnchorData({
      rawHref: '/shadcn-ui/ui/tree/main',
      fullHref: 'https://github.com/shadcn-ui/ui/tree/main',
      innerText: 'main',
      pageHostname: 'github.com',
    })).toMatchObject({
      owner: 'shadcn-ui',
      repository: 'ui',
      ref: 'main',
      refKind: 'branch',
    })

    // Ignore code files, subfolder trees, issues, PRs, tabs, same-page hash links, and login redirects on GitHub
    expect(extractRepoFromAnchorData({
      rawHref: '/facebook/react/blob/main/package.json',
      fullHref: 'https://github.com/facebook/react/blob/main/package.json',
      innerText: 'package.json',
      pageHostname: 'github.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '/facebook/react/tree/main/packages/react',
      fullHref: 'https://github.com/facebook/react/tree/main/packages/react',
      innerText: 'packages/react',
      pageHostname: 'github.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '/facebook/react/issues',
      fullHref: 'https://github.com/facebook/react/issues',
      innerText: 'Issues',
      pageHostname: 'github.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '#installation',
      fullHref: 'https://github.com/facebook/react#installation',
      innerText: 'Installation',
      pageHostname: 'github.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '/facebook/react?tab=MIT-1-ov-file',
      fullHref: 'https://github.com/facebook/react?tab=MIT-1-ov-file',
      innerText: 'MIT license',
      pageHostname: 'github.com',
    })).toBeNull()

    expect(extractRepoFromAnchorData({
      rawHref: '/login?return_to=https%3A%2F%2Fgithub.com%2Ffacebook%2Freact',
      fullHref: 'https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Ffacebook%2Freact',
      innerText: 'Star',
      pageHostname: 'github.com',
    })).toBeNull()
  })

  it('detects social-wrapped GitHub URLs and explicit GitHub labels on Twitter t.co links', () => {
    expect(extractRepoFromAnchorData({
      rawHref: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fgithub.com%2Faddyosmani%2Fagent-skills%3Ffbclid%3D123',
      fullHref: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fgithub.com%2Faddyosmani%2Fagent-skills%3Ffbclid%3D123',
      innerText: 'Agent Skills',
      pageHostname: 'www.facebook.com',
    })).toMatchObject({
      owner: 'addyosmani',
      repository: 'agent-skills',
    })

    expect(extractRepoFromAnchorData({
      rawHref: 'https://t.co/AbCdEf123',
      fullHref: 'https://t.co/AbCdEf123',
      innerText: 'https://github.com/vercel/next.js',
      pageHostname: 'x.com',
    })).toMatchObject({
      owner: 'vercel',
      repository: 'next.js',
    })
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

  it('does NOT unwrap non-redirect search query URLs or GitHub login return_to URLs', () => {
    const googleSearch = 'https://www.google.com/search?q=custom/thing'
    expect(unwrapSocialRedirectUrl(googleSearch)).toBe(googleSearch)
    expect(extractRepoReference(googleSearch)).toBeNull()

    const redditSearch = 'https://www.reddit.com/search/?q=foo/bar'
    expect(unwrapSocialRedirectUrl(redditSearch)).toBe(redditSearch)
    expect(extractRepoReference(redditSearch)).toBeNull()

    const ghLoginReturn = 'https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Ffacebook%2Freact'
    expect(unwrapSocialRedirectUrl(ghLoginReturn)).toBe(ghLoginReturn)
    expect(extractRepoReference(ghLoginReturn)).toBeNull()
  })
})
