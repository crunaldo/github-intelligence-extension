export const DOCK_CSS = `
:host {
  --gpi-bg: #0d1117;
  --gpi-bg-secondary: #161b22;
  --gpi-border: #30363d;
  --gpi-text: #e6edf3;
  --gpi-text-muted: #8b949e;
  --gpi-accent: #38bdf8;
  --gpi-accent-hover: #0284c7;
  --gpi-tab-bg: #1f2937;
  --gpi-tab-text: #38bdf8;
  --gpi-row-hover: #21262d;
  --gpi-badge-bg: rgba(56, 189, 248, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gpi-text);
  box-sizing: border-box;
}

:host([data-theme="light"]) {
  --gpi-bg: #ffffff;
  --gpi-bg-secondary: #f6f8fa;
  --gpi-border: #d0d7de;
  --gpi-text: #1f2328;
  --gpi-text-muted: #656d76;
  --gpi-accent: #0969da;
  --gpi-accent-hover: #0856b5;
  --gpi-tab-bg: #ffffff;
  --gpi-tab-text: #0969da;
  --gpi-row-hover: #f3f4f6;
  --gpi-badge-bg: rgba(9, 105, 218, 0.1);
}

*, *::before, *::after {
  box-sizing: inherit;
}

.gpi-dock-container {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 2147483647;
  pointer-events: none;
}

.gpi-dock-drawer {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--gpi-bg);
  border-right: 1px solid var(--gpi-border);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: visible;
}

.gpi-dock-drawer.closed {
  transform: translateX(-100%);
}

.gpi-dock-drawer.open {
  transform: translateX(0);
}

.gpi-toggle-tab {
  position: absolute;
  top: 140px;
  right: -36px;
  width: 36px;
  height: 40px;
  background: var(--gpi-tab-bg);
  border: 1px solid var(--gpi-border);
  border-left: none;
  border-radius: 0 8px 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--gpi-tab-text);
  box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.15);
  transition: background 0.15s ease, transform 0.15s ease;
  pointer-events: auto;
  z-index: 100;
}

.gpi-toggle-tab:hover {
  background: var(--gpi-row-hover);
  transform: scale(1.05);
}

.gpi-resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 50;
  background: transparent;
  transition: background 0.15s ease;
}

.gpi-resize-handle:hover,
.gpi-resize-handle.active {
  background: var(--gpi-accent);
}

/* Header */
.gpi-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--gpi-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--gpi-bg-secondary);
  flex-shrink: 0;
}

.gpi-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  color: var(--gpi-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gpi-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gpi-btn-icon {
  background: transparent;
  border: none;
  color: var(--gpi-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}

.gpi-btn-icon:hover {
  color: var(--gpi-text);
  background: var(--gpi-row-hover);
}

/* Search Bar */
.gpi-search-container {
  padding: 8px 12px;
  border-bottom: 1px solid var(--gpi-border);
  position: relative;
  flex-shrink: 0;
}

.gpi-search-input {
  width: 100%;
  padding: 6px 28px 6px 28px;
  background: var(--gpi-bg);
  border: 1px solid var(--gpi-border);
  border-radius: 6px;
  color: var(--gpi-text);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}

.gpi-search-input:focus {
  border-color: var(--gpi-accent);
}

.gpi-search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--gpi-text-muted);
  pointer-events: none;
}

/* Tree Body */
.gpi-tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.gpi-tree-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  color: var(--gpi-text);
  border-radius: 4px;
  margin: 1px 4px;
  transition: background 0.12s ease;
}

.gpi-tree-row:hover {
  background: var(--gpi-row-hover);
}

.gpi-tree-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gpi-tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.gpi-tree-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  background: var(--gpi-badge-bg);
  font-weight: 500;
  margin-left: 6px;
  flex-shrink: 0;
}

.gpi-ai-trigger-btn {
  opacity: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--gpi-accent);
  padding: 2px 4px;
  border-radius: 4px;
  transition: opacity 0.15s, transform 0.15s;
  display: flex;
  align-items: center;
}

.gpi-tree-row:hover .gpi-ai-trigger-btn {
  opacity: 1;
}

.gpi-ai-trigger-btn:hover {
  transform: scale(1.15);
}

/* CTA unanalyzed banner */
.gpi-cta-box {
  padding: 18px 14px;
  margin: 14px;
  background: var(--gpi-bg-secondary);
  border: 1px solid var(--gpi-border);
  border-radius: 8px;
  text-align: center;
}

.gpi-cta-btn {
  margin-top: 10px;
  width: 100%;
  padding: 8px 12px;
  background: #238636;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background 0.15s ease;
}

.gpi-cta-btn:hover {
  background: #2ea043;
}
`
