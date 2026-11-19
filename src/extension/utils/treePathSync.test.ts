// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  extractActivePathFromUrl,
  getAncestorPaths,
  saveOpenFolders,
  loadOpenFolders,
  mergeActiveAncestors,
} from './treePathSync'

describe('treePathSync utility', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear()
      localStorage.clear()
    } catch {}
  })

  describe('extractActivePathFromUrl', () => {
    it('extracts active file path and branch from GitHub blob URL', () => {
      const res = extractActivePathFromUrl(
        'https://github.com/facebook/react/blob/main/packages/react/src/React.js'
      )
      expect(res).toEqual({
        type: 'blob',
        branch: 'main',
        path: 'packages/react/src/React.js',
      })
    })

    it('extracts active directory path and branch from GitHub tree URL', () => {
      const res = extractActivePathFromUrl(
        'https://github.com/facebook/react/tree/v18.2.0/packages/react'
      )
      expect(res).toEqual({
        type: 'tree',
        branch: 'v18.2.0',
        path: 'packages/react',
      })
    })

    it('returns root for repository root URL', () => {
      const res = extractActivePathFromUrl('https://github.com/facebook/react')
      expect(res).toEqual({
        type: 'root',
        path: '',
      })
    })

    it('handles custom enterprise domains when passed', () => {
      const res = extractActivePathFromUrl(
        'https://github.corp.internal/org/project/blob/feature-x/src/api/client.ts',
        'github.corp.internal'
      )
      expect(res).toEqual({
        type: 'blob',
        branch: 'feature-x',
        path: 'src/api/client.ts',
      })
    })
  })

  describe('getAncestorPaths', () => {
    it('computes all ancestor directory paths for a nested file', () => {
      const ancestors = getAncestorPaths('packages/react/src/React.js')
      expect(ancestors).toEqual(['packages', 'packages/react', 'packages/react/src'])
    })

    it('computes ancestor for single folder nested file', () => {
      const ancestors = getAncestorPaths('src/index.ts')
      expect(ancestors).toEqual(['src'])
    })

    it('returns empty array for root level files', () => {
      expect(getAncestorPaths('package.json')).toEqual([])
      expect(getAncestorPaths('')).toEqual([])
    })
  })

  describe('saveOpenFolders and loadOpenFolders', () => {
    it('persists and restores open folder state for a repository', () => {
      const mockFolders = { src: true, 'src/components': true }
      saveOpenFolders('facebook', 'react', mockFolders)

      const loaded = loadOpenFolders('facebook', 'react')
      expect(loaded).toEqual(mockFolders)
    })

    it('returns default fallback when nothing is stored', () => {
      const loaded = loadOpenFolders('facebook', 'react')
      expect(loaded).toEqual({ src: true, app: true, lib: true })
    })
  })

  describe('mergeActiveAncestors', () => {
    it('auto-expands all ancestor folders of the active path', () => {
      const initial = { src: true }
      const merged = mergeActiveAncestors(initial, 'packages/core/utils/helper.ts')
      expect(merged).toEqual({
        src: true,
        packages: true,
        'packages/core': true,
        'packages/core/utils': true,
      })
    })

    it('returns identical state if ancestors are already open', () => {
      const initial = { src: true, 'src/components': true }
      const merged = mergeActiveAncestors(initial, 'src/components/Button.tsx')
      expect(merged).toEqual({ src: true, 'src/components': true })
    })
  })
})
