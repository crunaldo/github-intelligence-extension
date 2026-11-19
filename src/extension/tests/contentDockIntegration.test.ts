import { describe, it, expect } from 'vitest'
import { parseGitHubRepo, shouldMountDock } from '../content'

describe('content script dock integration helpers', () => {
  it('correctly determines whether to mount code tree dock based on URL', () => {
    expect(shouldMountDock('https://github.com/facebook/react')).toBe(true)
    expect(shouldMountDock('https://github.com/facebook/react/tree/main/packages')).toBe(true)
    expect(shouldMountDock('https://github.com/facebook/react/blob/main/package.json')).toBe(true)
    expect(shouldMountDock('https://github.com/settings/profile')).toBe(false)
    expect(shouldMountDock('https://github.com/explore')).toBe(false)
    expect(shouldMountDock('https://google.com')).toBe(false)
  })

  it('parses repository details including ref branch correctly', () => {
    const parsed = parseGitHubRepo('https://github.com/facebook/react/tree/dev/src')
    expect(parsed).not.toBeNull()
    expect(parsed?.owner).toBe('facebook')
    expect(parsed?.repo).toBe('react')
    expect(parsed?.ref).toBe('dev')
    expect(parsed?.fullName).toBe('facebook/react')

    // Commit SHA ref
    const commitParsed = parseGitHubRepo('https://github.com/facebook/react/commit/a1b2c3d4e5')
    expect(commitParsed?.ref).toBe('a1b2c3d4e5')
  })
})
