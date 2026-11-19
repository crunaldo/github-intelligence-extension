# Octotree Pro Features Integration Design Spec

**Date:** 2026-11-18  
**Status:** Approved by User  
**Scope:** Integration of key Octotree Pro & Team capabilities into GitHub Intelligence Assistant (excluding Bookmarks per user instruction).

## 1. Intent & Goals
Empower GitHub Project Intelligence Assistant with the most requested and productive developer capabilities from Octotree Pro & Team:
1. **Pull Request & Commit Code Tree**: Browse changed files in PRs and commits inside the tree explorer with line additions/deletions and diff navigation.
2. **Code Fonts & Typography Injection**: Enable custom developer fonts (JetBrains Mono, Fira Code with ligatures, Cascadia Code, Source Code Pro) on GitHub's native code viewers.
3. **File Icon Themes**: Provide selectable icon themes (VS Code Material, Seti UI, GitHub Native) with rich support for 40+ programming languages.
4. **Multi-Account & GitHub Enterprise Support**: Support multiple Personal Access Tokens (e.g. Personal vs Work) and custom GitHub Enterprise hostnames.

**Non-Goals:**
- Bookmarks feature (explicitly excluded by user).

---

## 2. Technical Architecture

### 2.1 Storage & Preferences Model (`storage.ts`)
```ts
export type CodeTreePreferences = {
  hoverToOpen: boolean
  openFoldersOnClick: boolean
  pinPerWindow: boolean
  tabPosition: 'left' | 'right'
  tabVerticalPos: number
  hideWhenUrlMatches: string
  shortcut: string
  iconTheme: 'vscode' | 'seti' | 'github'
  codeFontFamily: 'default' | 'jetbrains' | 'fira' | 'cascadia' | 'source-code'
  codeFontSize: number
  codeFontLigatures: boolean
  customEnterpriseDomains: string
}

export type GitHubTokenProfile = {
  id: string
  label: string
  token: string
}

export type ExtensionPreferences = {
  // ... existing fields
  codeTree: CodeTreePreferences
  tokenProfiles: GitHubTokenProfile[]
  activeProfileId: string
}
```

### 2.2 Pull Request & Commit Tree Detection & Resolution
- Parse URLs matching:
  - `https://github.com/:owner/:repo/pull/:id` and `.../pull/:id/files`
  - `https://github.com/:owner/:repo/commit/:sha`
- Query changed files via GitHub API (`/repos/:owner/:repo/pulls/:id/files` or `/repos/:owner/:repo/commits/:sha`) with DOM fallback.
- Render tree entries with:
  - Additions/deletions badge (e.g., `+18 -4`)
  - Status marker (A: Added, M: Modified, D: Deleted)
  - Anchor link to `#diff-...` to jump directly to file diff on the page.

### 2.3 Code Font & Typography Injector
- Dynamic style element injected in `document.head` (`id="gpi-code-font-style"`).
- Injects font definitions (Web font imports or system fallbacks) for JetBrains Mono, Fira Code, Cascadia Code, Source Code Pro.
- Scoped strictly to GitHub's code elements:
  - `.blob-code`, `.blob-code-inner`, `.react-code-text`
  - `table.highlight td`, `pre`, `code`, `.diff-table td`
- Handles font-variant-ligatures for programming ligatures (`!=`, `===`, `=>`).

### 2.4 File Icon Themes
- Support 3 distinct icon sets:
  - `vscode`: VS Code Material style (colorful, modern file icons)
  - `seti`: Classic Dark Seti UI theme
  - `github`: Minimal GitHub native icons
- Dynamic classification mapping over 40 file extensions and names.

### 2.5 Multi-Account & Enterprise Support
- Allows adding/removing multiple tokens with user-defined labels (*Personal*, *Work*, *Consulting*).
- Allows specifying enterprise domains (e.g., `github.mycompany.com`) so the extension recognizes them as valid GitHub hosts.
