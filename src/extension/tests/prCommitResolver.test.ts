// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parsePrOrCommitUrl,
  resolvePrOrCommitFiles,
  type PrFileEntry,
} from '../utils/prCommitResolver'

describe('prCommitResolver', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  describe('parsePrOrCommitUrl', () => {
    it('detects and parses Pull Request URLs', () => {
      const pr = parsePrOrCommitUrl('https://github.com/facebook/react/pull/28000')
      expect(pr.isPrOrCommit).toBe(true)
      expect(pr.type).toBe('pr')
      expect(pr.owner).toBe('facebook')
      expect(pr.repo).toBe('react')
      expect(pr.pullNumber).toBe(28000)

      const prFiles = parsePrOrCommitUrl('https://github.com/facebook/react/pull/28000/files')
      expect(prFiles.isPrOrCommit).toBe(true)
      expect(prFiles.pullNumber).toBe(28000)
    })

    it('detects and parses Commit URLs', () => {
      const commit = parsePrOrCommitUrl('https://github.com/torvalds/linux/commit/a1b2c3d4e5f678901234')
      expect(commit.isPrOrCommit).toBe(true)
      expect(commit.type).toBe('commit')
      expect(commit.owner).toBe('torvalds')
      expect(commit.repo).toBe('linux')
      expect(commit.commitSha).toBe('a1b2c3d4e5f678901234')
    })

    it('returns isPrOrCommit=false for non-PR and non-commit URLs', () => {
      expect(parsePrOrCommitUrl('https://github.com/facebook/react').isPrOrCommit).toBe(false)
      expect(parsePrOrCommitUrl('https://github.com/facebook/react/tree/main/packages').isPrOrCommit).toBe(false)
      expect(parsePrOrCommitUrl('https://github.com/facebook/react/blob/main/README.md').isPrOrCommit).toBe(false)
      expect(parsePrOrCommitUrl('https://google.com').isPrOrCommit).toBe(false)
    })
  })

  describe('resolvePrOrCommitFiles', () => {
    it('fetches PR changed files via GitHub REST API', async () => {
      const mockFiles = [
        {
          filename: 'packages/react/src/React.js',
          status: 'modified',
          additions: 12,
          deletions: 3,
          changes: 15,
        },
        {
          filename: 'packages/react/src/NewFeature.ts',
          status: 'added',
          additions: 45,
          deletions: 0,
          changes: 45,
        },
      ]

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return new Response(JSON.stringify(mockFiles), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const target = parsePrOrCommitUrl('https://github.com/facebook/react/pull/28000')
      const result = await resolvePrOrCommitFiles(target, 'ghp_mock_token')

      expect(result.isPrOrCommit).toBe(true)
      expect(result.files).toHaveLength(2)
      expect(result.files[0]?.filename).toBe('packages/react/src/React.js')
      expect(result.files[0]?.status).toBe('modified')
      expect(result.files[0]?.additions).toBe(12)
      expect(result.files[0]?.deletions).toBe(3)
      expect(result.files[0]?.diffAnchor).toBeTruthy()
      expect(result.files[1]?.status).toBe('added')
    })

    it('fetches Commit changed files via GitHub REST API', async () => {
      const mockCommitData = {
        commit: { message: 'feat: add new feature\n\nDetailed explanation' },
        files: [
          {
            filename: 'src/main.rs',
            status: 'modified',
            additions: 8,
            deletions: 2,
            changes: 10,
          },
        ],
      }

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return new Response(JSON.stringify(mockCommitData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const target = parsePrOrCommitUrl('https://github.com/rust-lang/rust/commit/a1b2c3d')
      const result = await resolvePrOrCommitFiles(target)

      expect(result.isPrOrCommit).toBe(true)
      expect(result.title).toBe('feat: add new feature')
      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.filename).toBe('src/main.rs')
    })

    it('falls back to DOM scraping when API fetch fails (rate limit)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('API rate limit exceeded'))

      // Set up mock GitHub DOM for PR files
      document.body.innerHTML = `
        <div id="diff-1" class="file" data-tagsearch-path="packages/core/index.ts">
          <div class="file-header" data-path="packages/core/index.ts">
            <span class="diffstat">+15 -2</span>
          </div>
        </div>
      `

      const target = parsePrOrCommitUrl('https://github.com/facebook/react/pull/28000')
      const result = await resolvePrOrCommitFiles(target)

      expect(result.isPrOrCommit).toBe(true)
      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.filename).toBe('packages/core/index.ts')
      expect(result.files[0]?.diffAnchor).toBe('diff-1')
    })
  })
})
