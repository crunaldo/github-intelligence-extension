export const DOCK_CSS = `
:host {
  --gpi-bg: #0d1117;
  --gpi-bg-secondary: #161b22;
  --gpi-border: #30363d;
  --gpi-text: #e6edf3;
  --gpi-text-muted: #8b949e;
  --gpi-accent: #FF3B5C;
  --gpi-accent-hover: #FF234E;
  --gpi-tab-bg: #1f2937;
  --gpi-tab-text: #FF3B5C;
  --gpi-row-hover: #21262d;
  --gpi-badge-bg: rgba(255, 59, 92, 0.15);
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
  --gpi-accent: #FF2F5A;
  --gpi-accent-hover: #E01E47;
  --gpi-tab-bg: #ffffff;
  --gpi-tab-text: #FF2F5A;
  --gpi-row-hover: #f3f4f6;
  --gpi-badge-bg: rgba(255, 47, 90, 0.12);
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
  right: -46px;
  width: 46px;
  height: 56px;
  background: linear-gradient(135deg, #FF3D60 0%, #FF234E 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  border-left: none;
  border-radius: 0 12px 12px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  color: #ffffff;
  box-shadow: 0 0 18px rgba(255, 47, 90, 0.6), 2px 4px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, background 0.2s ease;
  pointer-events: auto;
  z-index: 100;
}

:host([data-theme="light"]) .gpi-toggle-tab {
  background: linear-gradient(135deg, #FF3D60 0%, #FF234E 100%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 16px rgba(255, 47, 90, 0.45);
}

.gpi-toggle-tab:hover {
  transform: translateX(4px) scale(1.06);
  box-shadow: 0 0 24px rgba(255, 47, 90, 0.85), 4px 6px 16px rgba(0, 0, 0, 0.4);
}

.gpi-tab-label {
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #ffffff;
  line-height: 1;
}

.gpi-tab-pulse-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 6px #ffffff;
  animation: pulse-dot 1.8s infinite;
}

@keyframes pulse-dot {
  0% { transform: scale(0.85); opacity: 0.6; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.85); opacity: 0.6; }
}

.gpi-toggle-tab.is-hidden {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translateX(-100%) scale(0.7);
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s ease;
}

/* Right-side dock variant */
.gpi-dock-container.position-right {
  left: auto;
  right: 0;
}

.gpi-dock-container.position-right .gpi-dock-drawer {
  left: auto;
  right: 0;
  border-right: none;
  border-left: 1px solid var(--gpi-border);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.25);
}

.gpi-dock-container.position-right .gpi-dock-drawer.closed {
  transform: translateX(100%);
}

.gpi-dock-container.position-right .gpi-toggle-tab {
  right: auto;
  left: -46px;
  border-right: none;
  border-left: 1.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px 0 0 12px;
}

.gpi-dock-container.position-right .gpi-toggle-tab:hover {
  transform: translateX(-4px) scale(1.06);
}

.gpi-dock-container.position-right .gpi-toggle-tab.is-hidden {
  transform: translateX(100%) scale(0.7);
}

.gpi-dock-container.position-right .gpi-resize-handle {
  right: auto;
  left: -4px;
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

.gpi-btn-icon.is-active {
  color: var(--gpi-accent);
  background: var(--gpi-badge-bg);
}

/* In-dock Quick Settings View */
.gpi-dock-settings-view {
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 12px;
  overflow-y: auto;
  height: calc(100% - 48px);
}

.gpi-dock-settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.gpi-dock-settings-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--gpi-text);
}

.gpi-dock-settings-desc {
  font-size: 11px;
  color: var(--gpi-text-muted);
  line-height: 1.35;
  margin-top: 2px;
}

.gpi-dock-settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--gpi-border);
  background: var(--gpi-bg-secondary);
  color: var(--gpi-text);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  width: 100%;
}

.gpi-dock-settings-btn:hover {
  border-color: rgba(255, 47, 90, 0.4);
  color: var(--gpi-accent);
  background: rgba(255, 47, 90, 0.08);
  transform: translateY(-1px);
}

.gpi-dock-settings-btn:active {
  transform: translateY(0);
}

.gpi-dock-settings-btn.active,
.gpi-dock-settings-btn.selected {
  background: rgba(255, 47, 90, 0.12);
  border-color: var(--gpi-accent);
  color: var(--gpi-accent);
  font-weight: 700;
  box-shadow: 0 0 10px rgba(255, 47, 90, 0.15);
}

.gpi-dock-settings-btn.primary {
  background: linear-gradient(135deg, #FF3D60 0%, #FF234E 100%);
  color: #ffffff !important;
  border: none;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(255, 47, 90, 0.32);
}

.gpi-dock-settings-btn.primary:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(255, 47, 90, 0.45);
  color: #ffffff !important;
}

.gpi-dock-settings-btn.primary:active {
  transform: translateY(0);
  filter: brightness(0.96);
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

.gpi-tree-row.is-active-item {
  background: var(--gpi-badge-bg);
  color: var(--gpi-accent);
  font-weight: 600;
  border-left: 3px solid var(--gpi-accent);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

:host([data-theme="light"]) .gpi-tree-row.is-active-item {
  background: var(--gpi-badge-bg);
  color: var(--gpi-accent);
  border-left-color: var(--gpi-accent);
}

.gpi-tree-row.is-active-item .gpi-tree-label {
  font-weight: 600;
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

/* PR & Commit Changes View */
.gpi-mode-tabs {
  display: flex;
  background: var(--gpi-bg-secondary);
  border-bottom: 1px solid var(--gpi-border);
  padding: 4px 8px;
  gap: 4px;
}

.gpi-mode-tab {
  flex: 1;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--gpi-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.gpi-mode-tab.active {
  background: var(--gpi-bg);
  color: var(--gpi-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.gpi-pr-banner {
  padding: 6px 12px;
  background: var(--gpi-badge-bg);
  border-bottom: 1px solid var(--gpi-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--gpi-text);
}

.gpi-diff-stats {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-family: ui-monospace, monospace;
}

.gpi-diff-add {
  color: #2ea043;
  font-weight: 600;
}

.gpi-diff-del {
  color: #f85149;
  font-weight: 600;
}

.gpi-diff-status {
  padding: 0 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}

.gpi-status-added {
  background: rgba(46, 160, 67, 0.2);
  color: #2ea043;
}

.gpi-status-modified {
  background: rgba(210, 153, 34, 0.2);
  color: #d29922;
}

.gpi-status-deleted {
  background: rgba(248, 81, 73, 0.2);
  color: #f85149;
}

/* In-Dock Dynamic Campaign Banner */
.gpi-campaign-banner {
  margin: 8px 10px 4px 10px;
  padding: 9px 11px;
  background: linear-gradient(135deg, rgba(255, 59, 92, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%);
  border: 1px solid rgba(255, 59, 92, 0.3);
  border-radius: 8px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  animation: gpi-fade-in 0.2s ease-out;
}

:host([data-theme="light"]) .gpi-campaign-banner {
  background: linear-gradient(135deg, #FFF1F4 0%, #F5F3FF 100%);
  border: 1px solid #FDA4AF;
  box-shadow: 0 2px 8px rgba(225, 29, 72, 0.08);
}

:host([data-theme="light"]) .gpi-campaign-title {
  color: #1F2328;
  font-weight: 700;
}

:host([data-theme="light"]) .gpi-campaign-desc {
  color: #334155;
  font-weight: 500;
}

:host([data-theme="light"]) .gpi-campaign-coupon {
  color: #92400E;
  background: #FEF3C7;
  border: 1px solid #FCD34D;
  font-weight: 700;
}

:host([data-theme="light"]) .gpi-campaign-coupon:hover {
  background: #FDE68A;
  color: #78350F;
  border-color: #F59E0B;
}

:host([data-theme="light"]) .gpi-campaign-cta {
  background: linear-gradient(135deg, #E11D48 0%, #BE123C 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 6px rgba(225, 29, 72, 0.25);
}

:host([data-theme="light"]) .gpi-campaign-cta:hover {
  box-shadow: 0 3px 10px rgba(225, 29, 72, 0.4);
}

:host([data-theme="light"]) .gpi-campaign-dismiss {
  color: #656D76;
}

:host([data-theme="light"]) .gpi-campaign-dismiss:hover {
  color: #1F2328;
  background: rgba(0, 0, 0, 0.06);
}

.gpi-campaign-header {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding-right: 18px;
}

.gpi-campaign-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
  background: #FF3B5C;
  color: #ffffff;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  line-height: 1.3;
}

.gpi-campaign-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--gpi-text);
  line-height: 1.3;
}

.gpi-campaign-desc {
  font-size: 11px;
  color: var(--gpi-text-muted);
  line-height: 1.35;
  margin: 0;
}

.gpi-campaign-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

:host([data-theme="light"]) .gpi-campaign-actions {
  border-top: 1px solid rgba(225, 29, 72, 0.12);
}

.gpi-campaign-coupon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-weight: 600;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.gpi-campaign-coupon:hover {
  background: rgba(245, 158, 11, 0.22);
}

.gpi-campaign-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #FF3B5C 0%, #FF234E 100%);
  border: none;
  border-radius: 5px;
  padding: 3.5px 9px;
  cursor: pointer;
  text-decoration: none;
  box-shadow: 0 1px 4px rgba(255, 59, 92, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  margin-left: auto;
}

.gpi-campaign-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(255, 59, 92, 0.45);
}

.gpi-campaign-dismiss {
  position: absolute;
  top: 5px;
  right: 5px;
  background: transparent;
  border: none;
  color: var(--gpi-text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, background 0.15s ease;
}

.gpi-campaign-dismiss:hover {
  color: var(--gpi-text);
  background: rgba(255, 255, 255, 0.1);
}
`
