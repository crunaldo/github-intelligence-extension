# Octotree Pro Features Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Octotree Pro features into GitHub Intelligence Assistant: PR & Commit changed files code tree, custom code fonts with ligatures, file icon themes, and multi-token/enterprise domain support.

**Architecture:** Extend storage model with font, icon theme, token profiles, and enterprise domains. Inject scoped typography stylesheet into GitHub code views. Introduce PR/Commit file resolver that loads changed files and renders diff badges in the in-page dock. Add controls to Sidepanel Settings and in-dock quick settings.

**Tech Stack:** React 19, TypeScript, Vite/WXT, Chrome Extensions MV3, Vitest, Lucide React.

**Spec:** `docs/superpowers/specs/2026-11-18-octotree-pro-features-design.md`

## Global Constraints
- All in-page UI must remain inside Shadow DOM (`mode: 'open'`).
- Injected code font styles must be scoped strictly to GitHub code view elements and must not break GitHub's layout.
- Bookmarks feature is explicitly excluded per user requirement.
- Existing 172 tests must continue to pass with 0 regressions.

## Review Focus
1. PR files when user is not logged in / no token: must handle rate-limit gracefully and fallback to DOM parsing.
2. Code font injection on pages without code view: must not crash or cause layout shift on non-code pages.
3. Multiple token profiles: switching profile must update GitHub API client token immediately.
4. Large PRs (100+ files): tree rendering must handle large lists smoothly without freezing.
5. Custom Enterprise domains: URL matching must support both standard `github.com` and configured enterprise domains.

---

### Task 1: Preferences & Storage Extensions
**Files:**
- Modify: `src/extension/storage.ts`
- Test: `src/extension/tests/storage.test.ts`

**Interfaces:**
- Produces: Updated `CodeTreePreferences` with `iconTheme`, `codeFontFamily`, `codeFontSize`, `codeFontLigatures`, `customEnterpriseDomains`. Updated `ExtensionPreferences` with `tokenProfiles` and `activeProfileId`.

- [ ] **Step 1: Write the failing test for new storage preferences**
Add tests asserting default values for `codeFontFamily`, `iconTheme`, `tokenProfiles`, etc.
- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- src/extension/tests/storage.test.ts`
- [ ] **Step 3: Update `src/extension/storage.ts`**
Add new preference fields and update defaults in `DEFAULT_CODE_TREE_PREFERENCES` and `DEFAULT_EXTENSION_PREFERENCES`.
- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- src/extension/tests/storage.test.ts`
- [ ] **Step 5: Commit**
`git commit -m "feat(storage): extend preferences for code fonts, icon themes, and multi-tokens"`

---

### Task 2: Code Fonts & Typography Injector
**Files:**
- Create: `src/extension/content/codeFontInjector.ts`
- Test: `src/extension/tests/codeFontInjector.test.ts`
- Modify: `entrypoints/content.ts` & `src/extension/content.ts`

**Interfaces:**
- Produces: `applyCodeFontSettings(prefs: CodeTreePreferences): void` and `removeCodeFontSettings(): void`.

- [ ] **Step 1: Write failing tests for font injector**
Test applying font family (JetBrains Mono, Fira Code, etc.), font size, ligatures, and removal when set to 'default'.
- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- src/extension/tests/codeFontInjector.test.ts`
- [ ] **Step 3: Implement `codeFontInjector.ts`**
Generate scoped CSS targeting `.blob-code, .blob-code-inner, .react-code-text, table.highlight td, pre, code, .diff-table td` with `@import` for Google Fonts (JetBrains Mono, Fira Code, etc.).
- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- src/extension/tests/codeFontInjector.test.ts`
- [ ] **Step 5: Wire into `entrypoints/content.ts` on load and storage changes**
- [ ] **Step 6: Commit**
`git commit -m "feat(fonts): add custom code fonts and typography injector for GitHub"`

---

### Task 3: File Icon Themes & Rich Language Classification
**Files:**
- Modify: `src/extension/utils/fileClassifier.ts`
- Modify: `src/extension/components/InPageCodeTreeDock.tsx`
- Test: `src/extension/tests/fileClassifier.test.ts`

**Interfaces:**
- Produces: `getFileIcon(fileName: string, theme?: 'vscode' | 'seti' | 'github'): React.ReactNode`

- [ ] **Step 1: Write failing tests for icon themes**
Test file icon generation across themes ('vscode', 'seti', 'github') for multiple languages (Rust, Go, Python, Docker, SQL, etc.).
- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- src/extension/tests/fileClassifier.test.ts`
- [ ] **Step 3: Implement rich icon classification and themes in `fileClassifier.ts`**
Support 40+ languages and file extensions with colored icons for VS Code, Seti, and GitHub Native styles.
- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- src/extension/tests/fileClassifier.test.ts`
- [ ] **Step 5: Commit**
`git commit -m "feat(icons): add VS Code Material, Seti, and GitHub icon themes"`

---

### Task 4: Pull Request & Commit Code Tree Resolver
**Files:**
- Create: `src/extension/utils/prCommitResolver.ts`
- Modify: `src/extension/components/InPageCodeTreeDock.tsx`
- Modify: `entrypoints/content.ts` & `src/extension/content.ts`
- Test: `src/extension/tests/prCommitResolver.test.ts`

**Interfaces:**
- Produces: `resolvePrOrCommit(url: string, token?: string): Promise<{ isPrOrCommit: boolean; title?: string; files: PrFileEntry[] }>`

- [ ] **Step 1: Write failing tests for PR and Commit detection & parsing**
Test detection of `/owner/repo/pull/123`, `/owner/repo/pull/123/files`, and `/owner/repo/commit/abc1234`.
- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- src/extension/tests/prCommitResolver.test.ts`
- [ ] **Step 3: Implement `prCommitResolver.ts`**
Implement GitHub REST API fetch with token for PR files and commit files, plus DOM parsing fallback.
- [ ] **Step 4: Update `InPageCodeTreeDock.tsx` to display PR files with diff line counts (`+X -Y`) and jump-to-diff links**
- [ ] **Step 5: Run tests to verify all pass**
Run: `npm test`
- [ ] **Step 6: Commit**
`git commit -m "feat(pr-tree): add pull request and commit changed files code tree"`

---

### Task 5: Settings UI & Enterprise Multi-Account Integration
**Files:**
- Modify: `src/extension/components/SettingsView.tsx`
- Modify: `src/extension/components/InPageCodeTreeDock.tsx` (in-dock quick settings)
- Modify: `src/extension/i18n.ts`
- Test: `src/extension/components/SettingsView.test.tsx`

**Interfaces:**
- Produces: Settings controls for Code Font, Font Size, Ligatures, Icon Theme, Token Profiles, and Enterprise Domains.

- [ ] **Step 1: Update i18n with Spanish & English translation keys**
- [ ] **Step 2: Update `SettingsView.tsx` with Font, Icon Theme, and Multi-Token UI cards**
- [ ] **Step 3: Update In-Dock Quick Settings View in `InPageCodeTreeDock.tsx`**
- [ ] **Step 4: Run test suite to verify 0 regressions and new tests pass**
Run: `npm test`
- [ ] **Step 5: Run compile and build**
Run: `npm run compile && npm run build`
- [ ] **Step 6: Commit and package extension ZIP**
`git commit -m "feat(settings): add font, icon theme, enterprise, and multi-token settings UI"`
