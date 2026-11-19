# Design Specification: Octotree-Style Hybrid Code Tree with AI Superpowers

**Date**: 2026-11-18  
**Topic**: `octotree-hybrid-code-tree`  
**Status**: Approved by User  
**Target Project**: `github-intelligence-extension` (Chrome Extension MV3)

---

## 1. Intent & The "Why"
Navigating large GitHub repositories natively requires dozens of page reloads, back-and-forth browser history jumps, and slow visual directory discovery. Popular extensions like Octotree solved directory navigation with an in-page tree sidebar. 

However, existing code-tree extensions are passive directory viewers: they have no architectural understanding, cannot explain code or files on demand, and operate in isolation from modern browser side panels.

By integrating an **Octotree-style in-page collapsible dock directly on `github.com`** combined with our **Chrome Sidepanel** and powered by **AI file explanations and architectural badging**, GitHub Project Intelligence Assistant provides an unprecedented, fast, and intelligent repository browsing experience.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. **In-Page Collapsible Dock (Octotree Style)**:
   - Provide an expandable/collapsible sidebar dock attached to the left edge of `github.com/owner/repo` pages.
   - Pinned toggle handle/tab button on the left screen edge with smooth slide-in/slide-out animations.
   - Resizable width via a draggable vertical border with min/max clamps (220px to 600px, default ~320px), saving width and collapsed state in `chrome.storage.local`.
   - Complete file tree rendering with folder expand/collapse, instant search/filter, and file size formatting.
   - Instant file navigation: Clicking any folder or file navigates to the target path without a full page reload by leveraging GitHub's native Turbo/PJAX navigation engine (falling back to SPA history push).

2. **Full Synchronization with Sidepanel**:
   - The in-page dock and Sidepanel share the same cached repository tree data (`git/trees/:sha?recursive=1`) and repo intelligence report.
   - Actions in the dock (e.g., "Abrir en Sidepanel", "Analizar repositorio", "Explicar archivo") synchronize state bidirectionally via `chrome.runtime.sendMessage` and `chrome.storage.local`.

3. **AI Superpowers & Monetization Model**:
   - **"Explicar archivo con IA" (Freemium Model)**:
     - Free tier: **3 explicaciones de archivo gratuitas por día** (tracked in `chrome.storage.local` daily quota).
     - Pro tier: **Explicaciones ilimitadas**.
     - When free quota is reached, displays an upgrade hint to Pro.
     - Explains: 1) Propósito principal, 2) Exportaciones y responsabilidades clave, 3) Relación con la arquitectura global.
   - **Architectural Badges & Highlights**: Visual icons/badges tagging key files:
     - 🚀 *Entrypoints*: `index.ts`, `main.py`, `App.tsx`, `server.js`, etc.
     - ⚙️ *Configuration*: `package.json`, `tsconfig.json`, `Dockerfile`, `vite.config.ts`, etc.
     - 🛡️ *Security & Vulnerabilities*: Highlighting dependency manifests with known CVEs detected by the OSV scanner.
   - **New / Unanalyzed Repositories Handling**:
     - When visiting an unanalyzed repo on `github.com`, the dock displays an inviting CTA card: *"⚡ Analizar repositorio para explorar árbol y arquitectura (1 clic)"*.
     - Prevents unwanted background quota consumption; analysis runs only on explicit user request.
   - **Quick Pinning**: Bookmark frequently visited files in the current repo for instant jump.

### Non-Goals
- **In-browser IDE / Code Editor**: We will not provide a full monaco/code editing environment inside the tree; files will open in GitHub's native file viewer.
- **Local Git Clone Operations**: We will not attempt to run git binary operations client-side in the content script; all tree data uses GitHub REST/Git Tree APIs.
- **Replacing GitHub's Entire UI**: The dock cleanly slides over or gently shifts GitHub's main container without breaking GitHub's native layouts, responsive design, or Turbo events.

### Anti-Goals
- **CSS Contamination**: Injecting un-isolated styles that pollute `github.com`'s native Primer CSS or break GitHub's UI. (Mitigated strictly via Shadow DOM).
- **GitHub API Rate Limit Exhaustion**: Fetching full file contents for every file in the tree. (Mitigated by only fetching file content on-demand when the user explicitly triggers "Explicar con IA").

---

## 3. Approaches Considered & Trade-Offs

During brainstorming, three implementation options were evaluated:

1. **Option 1: In-Page Dock Only (Octotree Pure Clone)**
   - *Pros*: Matches classic Octotree UX directly inside the tab.
   - *Cons*: Ignores our powerful MV3 Side Panel; leaves users with duplicate UIs if they open both.
2. **Option 2: Side Panel Only (Deepening Chrome Side Panel)**
   - *Pros*: Zero DOM injection into GitHub; clean isolation.
   - *Cons*: Requires keeping the browser's side panel open; not accessible with a single click inside the GitHub canvas; lacks the instant edge-docked feel of Octotree.
3. **Option 3: Hybrid Approach (In-Page Dock + Sidepanel Sync + AI Superpowers) [SELECTED]**
   - *Pros*: Best of both worlds. Casual browsing happens in the lightweight in-page dock on GitHub; deep analysis, architecture diagrams, and security audits live in the Sidepanel. The dock has direct shortcuts to launch the Sidepanel, and both share the tree cache and AI insights.
   - *Cons*: Requires coordinating two UI surfaces. Mitigated by sharing core components (`DirectoryTree`, `TreeEntry` types) and single-source-of-truth storage.

---

## 4. Architecture & Component Design

```
+---------------------------------------------------------------------------------------+
|                                    GITHUB.COM                                         |
|                                                                                       |
|  +----------------------------+   [Toggle Handle]                                     |
|  | #gpi-code-tree-host (Host) |       [ > ]                                           |
|  |  +-----------------------+ |                                                       |
|  |  | Shadow Root (Open)    | |                                                       |
|  |  |  <InPageCodeTreeDock> | |   +------------------------------------------------+  |
|  |  |   - Dock Header       | |   | GitHub Page Content (Repo code, PR, commits)   |  |
|  |  |   - Filter / Search   | |   |                                                |  |
|  |  |   - Tree Hierarchy    | |   |                                                |  |
|  |  |     + File Badges     | |   |                                                |  |
|  |  |     + AI Explain Pop  | |   |                                                |  |
|  |  |   - Resize Border     | |   |                                                |  |
|  |  +-----------------------+ |   +------------------------------------------------+  |
|  +----------------------------+                                                       |
+---------------------------------------------------------------------------------------+
              |                                            |
              | (chrome.storage.local & runtime messages)  |
              v                                            v
+-----------------------------+             +-------------------------------+
| Chrome MV3 Background SW    | <=========> | Chrome Sidepanel (Archivos)   |
| - Session Repo Tracker      |             | - Full DirectoryTree View     |
| - API Rate-limit cache      |             | - Deep Architecture Audit     |
| - AI Explanation Dispatch   |             | - Multi-tab repo intelligence |
+-----------------------------+             +-------------------------------+
```

### 4.1 Builder Decisions & Architecture Calls
1. **GitHub Page Layout Strategy (Builder Call)**:
   - Default mode is **Floating Overlay (Drawer)**: The dock is rendered inside the isolated Shadow DOM with `position: fixed; top: 0; left: 0; height: 100vh; z-index: 9999999`. This guarantees zero mutation of GitHub's DOM, zero CSS contamination, and rock-solid stability during GitHub Turbo page swaps.
   - For ultra-wide viewports (>1440px), the user can toggle an optional "Pin & Push" mode that sets `margin-left` on GitHub's primary container (`.application-main` / `#js-repo-pjax-container`).

2. **Turbo Navigation Bridge (Builder Call)**:
   - Since MV3 content scripts run in an Isolated World where `window.Turbo` is inaccessible, navigation links inside the dock will use standard `<a href="...">` elements styled to match the tree.
   - When clicked, because GitHub listens on the document for navigation events, clicking standard anchors triggers GitHub's native Turbo/PJAX PJAX router automatically without requiring risky Main World script injections that violate GitHub CSP.

3. **Private Repository Scope (Builder Call)**:
   - Phase 1 focuses on public repositories and repositories where a personal GitHub token is configured in extension settings. If a file cannot be fetched via raw content (404/401), the AI popover displays an informative hint: *"Repositorio privado o sin permisos de lectura"*.

### 4.1 Component Breakdown

1. **Shadow DOM Injection Host (`#gpi-code-tree-host`)**:
   - Created and appended to `document.documentElement` by `src/extension/content.ts`.
   - `mode: 'open'` with an encapsulated stylesheet containing all dock styles and animations, preventing GitHub CSS leakage.
   - Mounts a React 19 root (`createRoot`) rendering `<InPageCodeTreeDock />`.

2. **`<InPageCodeTreeDock />` (`src/extension/components/InPageCodeTreeDock.tsx`)**:
   - **Collapsible State**: Managed via `isOpen` boolean state, animated with CSS `transform: translateX()`.
   - **Toggle Handle**: Pinned to the left screen edge (or configurable right edge), shows a mini mascot or code-fork icon, accessible anytime. Keyboard shortcut support (`Alt + W` / `Option + W` to toggle).
   - **Resize Border**: An interactive 4px border handle on the right edge. On `mousedown`, attaches window mousemove/mouseup listeners to calculate and clamp new width (240px to 600px), stored in `chrome.storage.local`.
   - **Header Controls**:
     - Current repo badge (`owner/repo @ branch`).
     - Branch selector or indicator.
     - "Abrir Sidepanel" action button (`OPEN_SIDEPANEL`).
     - "Recargar árbol" button.
     - Close button (`X`).
   - **Search & Filter Bar**: Instant client-side fuzzy filtering across all recursive paths.
   - **Tree Body**: Renders virtualized or optimized recursive node tree reusing the proven logic from `DirectoryTree.tsx`.

3. **`<FileAiExplainerPopover />` (`src/extension/components/FileAiExplainerPopover.tsx`)**:
   - Floats beside the hovered/selected file row.
   - Shows cached explanation if already generated for that file SHA/path.
   - If not cached, shows "✨ Explicar qué hace este archivo" button with a one-click trigger.
   - Displays 2–3 concise Spanish bullet points explaining:
     - 1. Propósito principal del archivo.
     - 2. Funciones/clases clave exportadas.
     - 3. Cómo se conecta con el resto del proyecto.

4. **GitHub PJAX / Turbo Navigation Bridge**:
   - When a user clicks a file or folder in the tree:
     - Check if GitHub's `window.Turbo` or PJAX is active.
     - Create a synthetic link or call `window.history.pushState` + dispatch `turbo:visit` or click an existing DOM element with `data-turbo-frame` to preserve SPA fluidity without reloading the entire tab.
     - Fallback: Standard `window.location.assign(url)` if Turbo is not responsive.

---

## 5. Data Flow & State Management

1. **Detection & Initialization**:
   - Content script detects GitHub repository page (`owner/repo`).
   - Checks `chrome.storage.local` for existing analyzed repository tree for `${owner}/${repo}`.
   - If present, immediately populates the in-page tree dock (0ms delay).
   - If absent, loads tree lazily via lightweight GitHub API call `GET /repos/:owner/:repo/git/trees/:branch?recursive=1` or triggers background analysis.

2. **AI Explanation Request Flow**:
   - User clicks ✨ on `src/core/auth.ts`.
   - Message sent to background/worker: `{ type: 'EXPLAIN_FILE', owner, repo, path, ref }`.
   - Background worker:
     - Checks cache for file explanation.
     - If uncached, fetches file contents via `https://raw.githubusercontent.com/:owner/:repo/:ref/:path` (or GitHub REST contents API).
     - Limits prompt to first 300 lines / 12KB to save tokens.
     - Calls Cloudflare Worker backend `/api/explain-file`.
     - Returns summary `{ path, summary, keyExports, architectureRole }`.
     - Caches result in `chrome.storage.local`.
   - Popover updates with nice fade-in animation.

---

## 6. Risk Analysis & Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **GitHub DOM Changes / Style Conflicts** | In-page dock visual distortion or broken layout | Strict encapsulation inside `ShadowRoot`. Zero styles injected into GitHub's `document.head`. |
| **GitHub Dark/Light Theme Mismatch** | Dock looks jarring against GitHub's theme | Read GitHub's `data-color-mode` and `data-dark-theme` on `<html>` and adapt CSS variables automatically (`var(--bgColor-default)`, etc.) or support explicit Dark/Light/Auto mode. |
| **Giant Repositories (10,000+ files)** | Slow DOM rendering or tree freezing | Lazy folder rendering (only render children when parent is expanded). Deep subtrees remain collapsed by default. |
| **GitHub Turbo / PJAX Page Swapping** | Dock disappears on internal navigation | Dock host is appended to `document.documentElement` outside GitHub's PJAX/Turbo container containers (`#js-repo-pjax-container`). It stays permanently mounted across Turbo page loads. |
| **GitHub API Rate Limits for unauthenticated users** | Tree fails to load on large repos | Use the cached tree from `report.tree` already fetched during repo analysis; support user personal access token (PAT) stored in options if needed. |

---

## 7. Testing Strategy

1. **Unit Tests (`vitest`)**:
   - Tree builder logic tests: transforming flat `TreeEntry[]` into nested tree hierarchy, sorting directories first, handling deep nesting.
   - Search/filter matching algorithm.
   - File badge detector: tests verifying correct classification of entrypoints (`main.ts`, `index.js`), configs (`package.json`, `vite.config.js`), and vulnerability tags.
   - Mermaid sanitizer tests (already in place and verified).

2. **Integration / DOM Tests**:
   - Verify Shadow DOM creation and mounting without mutating parent `document.body` classes.
   - Verify keyboard shortcut (`Alt + W`) toggles open/close state.
   - Verify width resizing clamps within min (220px) and max (600px).
   - Verify storage sync: changing width or open state saves to `chrome.storage.local`.

3. **E2E / Extension Build Verification**:
   - `npm run compile`: Type checking and bundle creation for both extension scripts.
   - Package verification: Chrome MV3 extension loads without CSP errors or permissions warnings.

---

## 8. Success Criteria

1. On any `github.com/:owner/:repo` page, a sleek, semi-transparent toggle tab appears on the left screen edge.
2. Clicking the toggle (or pressing `Alt+W`) smoothly slides out the code tree sidebar.
3. Tree displays all folders and files with proper icons, folder counts, and file sizes.
4. Clicking a file navigates directly to that file on GitHub without breaking the in-page dock.
5. Users can filter files in real time using the search bar.
6. Users can click "Explicar archivo con IA" to receive a concise, accurate Spanish summary of the file's role in the architecture.
7. Users can drag the dock border to resize the sidebar and have the width remembered across page visits.
8. 100% of automated tests pass with 0 TypeScript/ESLint errors.
