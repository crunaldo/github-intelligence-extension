# Octotree-Style Hybrid Code Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Octotree-style in-page collapsible code tree sidebar dock on `github.com` with real-time Sidepanel synchronization, architectural file badges, and AI-powered file explanations with freemium quotas.

**Architecture:** Encapsulated Shadow DOM host mounted on `document.documentElement` hosting a React 19 `<InPageCodeTreeDock />`. Shared repository tree and cache in `chrome.storage.local`. Non-blocking AI file explanations with daily limits (3/day for Free, unlimited for Pro). Seamless Turbo SPA navigation via standard anchor tags.

**Tech Stack:** React 19, TypeScript, Lucide Icons, Chrome Extension Manifest V3, Shadow DOM CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-octotree-hybrid-code-tree-design.md`

---

## Global Constraints

- Must run inside a Shadow DOM root (`mode: 'open'`) to guarantee zero style pollution on `github.com`.
- Tree width must clamp between 240px and 600px (default 320px) and persist in `chrome.storage.local`.
- Unanalyzed repositories must display the 1-click CTA card *"⚡ Analizar repositorio para explorar árbol y arquitectura"* without auto-depleting analysis quotas.
- Free users receive 3 file explanations per day; Pro users receive unlimited explanations.
- Keyboard shortcut `Alt+W` (or `Option+W` on macOS) must toggle dock visibility.
- 100% of tests must pass with 0 TypeScript compile errors.

---

## Review Focus

1. **Large repositories (5,000+ files)**: Tree rendering must not freeze GitHub; subdirectories must remain collapsed by default until clicked.
2. **GitHub Turbo page changes**: Navigating between commits, branches, or PR files must update the dock or preserve state without duplicate DOM injections.
3. **Daily quota rollover**: Free file explanations counter must reset to 0 at midnight local time.
4. **Dark / Light theme syncing**: The dock must inspect `data-color-mode` and `data-dark-theme` on GitHub's `<html>` element and adapt its theme variables cleanly.
5. **Private or restricted repositories**: If file contents cannot be fetched, the AI popover must show an informative message rather than crash or hang in loading state.

---

## File Structure

```
src/extension/
├── content/
│   ├── dockHost.ts                # Shadow DOM injection, mounting & theme detection
│   ├── dockHost.test.ts           # Tests for mount/unmount and Shadow DOM creation
│   └── dockStyles.ts              # Encapsulated CSS string for in-page dock
├── utils/
│   ├── fileClassifier.ts          # Badges for entrypoints, config, security, CVEs
│   ├── fileClassifier.test.ts     # Classification unit tests
│   ├── fileExplanationService.ts  # AI file explanation dispatcher & daily quota tracker
│   └── fileExplanationService.test.ts # Quota & service unit tests
├── components/
│   ├── FileAiExplainerPopover.tsx      # Floating popover with AI summary & quota badge
│   ├── FileAiExplainerPopover.test.tsx  # Popover tests
│   ├── InPageCodeTreeDock.tsx          # Full collapsible/resizable dock component
│   └── InPageCodeTreeDock.test.tsx      # Dock unit & interaction tests
└── content.ts                     # Main content script entrypoint hooking dockHost
```

---

### Task 1: File Badges & Architectural Classification Engine

**Files:**
- Create: `src/extension/utils/fileClassifier.ts`
- Create: `src/extension/utils/fileClassifier.test.ts`

**Interfaces:**
- Consumes: `TreeEntry` from `src/features/repository/types.ts`
- Produces:
  ```ts
  export type FileCategory = 'entrypoint' | 'config' | 'security' | 'test' | 'style' | 'doc' | 'general'
  export interface FileBadgeInfo {
    category: FileCategory
    label?: string
    iconColor: string
    isCritical: boolean
  }
  export function classifyFile(filePath: string, vulnerableManifests?: string[]): FileBadgeInfo
  ```

- [ ] **Step 1: Write failing tests in `src/extension/utils/fileClassifier.test.ts`**
  - Test entrypoint detection (`src/index.ts`, `main.py`, `app.jsx` -> `'entrypoint'`).
  - Test config detection (`package.json`, `tsconfig.json`, `Dockerfile` -> `'config'`).
  - Test security / vulnerability detection when manifest has known CVEs.
  - Test default fallback.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/extension/utils/fileClassifier.test.ts`
  Expected: FAIL (file not found).

- [ ] **Step 3: Implement `classifyFile` in `src/extension/utils/fileClassifier.ts`**
  Inspect path basename and extension, match against known entrypoint patterns, config regex, test patterns, and vulnerable manifest list.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/extension/utils/fileClassifier.test.ts`
  Expected: PASS (4 tests passing).

- [ ] **Step 5: Commit**
  ```bash
  git add src/extension/utils/fileClassifier.ts src/extension/utils/fileClassifier.test.ts
  git commit -m "feat(tree): add file classification and architectural badge engine"
  ```

---

### Task 2: AI File Explanation & Freemium Quota Service

**Files:**
- Create: `src/extension/utils/fileExplanationService.ts`
- Create: `src/extension/utils/fileExplanationService.test.ts`

**Interfaces:**
- Consumes: `chrome.storage.local`, `backendClient.ts`
- Produces:
  ```ts
  export interface FileExplanation {
    summary: string
    keyResponsibilities: string[]
    architectureRole: string
  }
  export interface QuotaStatus {
    canExplain: boolean
    remainingToday: number
    isPro: boolean
  }
  export async function checkFileExplanationQuota(isPro: boolean): Promise<QuotaStatus>
  export async function explainFileWithAi(params: {
    owner: string
    repo: string
    path: string
    ref?: string
    isPro: boolean
  }): Promise<{ explanation: FileExplanation; remainingToday: number }>
  ```

- [ ] **Step 1: Write failing tests in `src/extension/utils/fileExplanationService.test.ts`**
  - Test free user gets 3 explanations on day 1.
  - Test 4th request is blocked with `canExplain: false`.
  - Test Pro user always gets `canExplain: true` with `remainingToday: Infinity`.
  - Test date rollover: changing date resets counter.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/extension/utils/fileExplanationService.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `fileExplanationService.ts`**
  Implement storage-backed quota counter using `chrome.storage.local` with date key `YYYY-MM-DD`. Call backend or return structured summary, caching by file SHA/path.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/extension/utils/fileExplanationService.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/extension/utils/fileExplanationService.ts src/extension/utils/fileExplanationService.test.ts
  git commit -m "feat(ai): add file explanation service with freemium daily quota tracker"
  ```

---

### Task 3: Encapsulated Dock Styles & Shadow DOM Host

**Files:**
- Create: `src/extension/content/dockStyles.ts`
- Create: `src/extension/content/dockHost.ts`
- Create: `src/extension/content/dockHost.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function injectCodeTreeHost(): {
    host: HTMLElement
    shadowRoot: ShadowRoot
    cleanup: () => void
  }
  export function getGitHubTheme(): 'dark' | 'light'
  ```

- [ ] **Step 1: Write failing tests in `src/extension/content/dockHost.test.ts`**
  - Test `injectCodeTreeHost()` appends `#gpi-code-tree-host` to `document.documentElement`.
  - Test `shadowRoot` is created in mode `'open'`.
  - Test repeated calls don't create duplicate host elements.
  - Test `cleanup()` removes the host cleanly.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/extension/content/dockHost.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `dockStyles.ts` and `dockHost.ts`**
  Provide comprehensive CSS string: `.dock-container`, `.toggle-handle`, `.resize-border`, `.tree-node`, `.ai-popover`, transitions, theme variables. Implement singleton DOM mounting with theme detection.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/extension/content/dockHost.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/extension/content/dockStyles.ts src/extension/content/dockHost.ts src/extension/content/dockHost.test.ts
  git commit -m "feat(content): add Shadow DOM dock host and encapsulated styles"
  ```

---

### Task 4: `<FileAiExplainerPopover />` Component

**Files:**
- Create: `src/extension/components/FileAiExplainerPopover.tsx`
- Create: `src/extension/components/FileAiExplainerPopover.test.tsx`

**Interfaces:**
- Consumes: `FileExplanation`, `QuotaStatus`, `explainFileWithAi` from `fileExplanationService.ts`
- Produces:
  ```tsx
  export function FileAiExplainerPopover(props: {
    filePath: string
    owner: string
    repo: string
    ref?: string
    isPro: boolean
    onClose: () => void
  }): React.ReactElement
  ```

- [ ] **Step 1: Write failing tests in `src/extension/components/FileAiExplainerPopover.test.tsx`**
  - Test renders loading skeleton when fetching explanation.
  - Test renders explanation content (summary, responsibilities, architecture role).
  - Test renders quota badge ("2/3 restantes hoy" or "PRO").
  - Test renders Pro upgrade card when quota reached.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/extension/components/FileAiExplainerPopover.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement `<FileAiExplainerPopover />`**
  Render floating card with Lucide icons (Sparkles, CheckCircle, ShieldAlert), close button, and crisp typography.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/extension/components/FileAiExplainerPopover.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/extension/components/FileAiExplainerPopover.tsx src/extension/components/FileAiExplainerPopover.test.tsx
  git commit -m "feat(ui): add FileAiExplainerPopover with streaming loading and Pro gates"
  ```

---

### Task 5: `<InPageCodeTreeDock />` Component

**Files:**
- Create: `src/extension/components/InPageCodeTreeDock.tsx`
- Create: `src/extension/components/InPageCodeTreeDock.test.tsx`

**Interfaces:**
- Consumes: `TreeEntry`, `classifyFile`, `FileAiExplainerPopover`, `chrome.storage.local`
- Produces:
  ```tsx
  export function InPageCodeTreeDock(props: {
    owner: string
    repo: string
    ref?: string
    onOpenSidepanel?: () => void
  }): React.ReactElement
  ```

- [ ] **Step 1: Write failing tests in `src/extension/components/InPageCodeTreeDock.test.tsx`**
  - Test renders toggle handle button on edge.
  - Test clicking toggle handle expands/collapses dock.
  - Test renders CTA card when repository has not been analyzed yet.
  - Test renders file hierarchy and filters files on search input.
  - Test drag resize event updates dock width within bounds [240, 600].

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/extension/components/InPageCodeTreeDock.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement `<InPageCodeTreeDock />`**
  - Pinned sidebar tab handle with badge and icon.
  - Draggable border with `onMouseDown` resize handler clamped [240, 600] and saved to storage.
  - Header with repo name, branch, search input, "Abrir Sidepanel", and close button.
  - Recursive tree nodes with folder expand/collapse and badges from `classifyFile`.
  - Sparkle action button next to files triggering `FileAiExplainerPopover`.
  - Native Turbo `<a href="...">` links for seamless navigation.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/extension/components/InPageCodeTreeDock.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/extension/components/InPageCodeTreeDock.tsx src/extension/components/InPageCodeTreeDock.test.tsx
  git commit -m "feat(ui): add InPageCodeTreeDock component with resize handle and search"
  ```

---

### Task 6: Content Script Mounting & Sidepanel Sync

**Files:**
- Modify: `src/extension/content.ts`
- Modify: `src/extension/sidepanel/SidepanelApp.tsx` (ensure "Archivos" tab reacts to storage updates)

**Interfaces:**
- Consumes: `injectCodeTreeHost`, `<InPageCodeTreeDock />`
- Produces: Live in-page dock on all `github.com/:owner/:repo` pages.

- [ ] **Step 1: Write integration test in `src/extension/tests/contentDockIntegration.test.ts`**
  Verify content script mounts dock on repo URLs, skips non-repo URLs (like `/pricing`, `/settings`), and handles `Alt+W` shortcut.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/extension/tests/contentDockIntegration.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Wire dock mounting in `src/extension/content.ts`**
  - On page load / Turbo navigation: check `parseGitHubRepo`.
  - If valid repo, mount `InPageCodeTreeDock` via `injectCodeTreeHost()`.
  - Listen for `OPEN_SIDEPANEL` click and forward to background worker.
  - Listen for `Alt+W` keydown to toggle dock visibility.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/extension/tests/contentDockIntegration.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/extension/content.ts src/extension/tests/contentDockIntegration.test.ts
  git commit -m "feat(content): mount InPageCodeTreeDock on GitHub pages with shortcut support"
  ```

---

### Task 7: Full Verification, Compilation & Extension Packaging

**Files:**
- Verify all existing tests: `src/extension/**/*.test.ts*`
- Build package: `dist/` and `C:\Users\moder\Downloads\github-intelligence-extension-v2.0.0-wxt.zip`

- [ ] **Step 1: Run full Vitest test suite**
  Run: `npm run test`
  Expected: ALL tests pass (142+ tests).

- [ ] **Step 2: Run TypeScript build & Vite compile**
  Run: `npm run compile`
  Expected: Exit code 0, 0 errors.

- [ ] **Step 3: Update extension distribution ZIP**
  Run packaging script or powershell archive to update `C:\Users\moder\Downloads\github-intelligence-extension-v2.0.0-wxt.zip`.

- [ ] **Step 4: Final verification commit**
  ```bash
  git commit -m "chore(release): verify tests, build and package v2.1.0 with hybrid code tree"
  ```
