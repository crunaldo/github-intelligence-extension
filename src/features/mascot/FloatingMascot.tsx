import React, { useEffect, useState } from 'react'
import { fetchRemoteConfig, getModuleAccess } from '../../extension/api/backendClient'
import { MascotAvatarSvg, MascotChatWindow } from './MascotChatWindow'

export interface FloatingMascotRepo {
  owner: string
  repo: string
  commitSha?: string
}

export interface FloatingMascotProps {
  repo: FloatingMascotRepo | null
}

export const MASCOT_SHADOW_STYLES = `
  :host {
    all: initial;
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  *, *::before, *::after {
    box-sizing: border-box;
  }
  .gpi-mascot-root {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }
  .gpi-mascot-fab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #161b22;
    color: #f0f6fc;
    border: 1px solid #30363d;
    border-radius: 9999px;
    padding: 8px 14px 8px 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25);
    transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
  }
  .gpi-mascot-fab:hover {
    transform: translateY(-2px);
    border-color: #2ea043;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 14px rgba(46, 160, 67, 0.3);
  }
  .gpi-chat-window {
    width: 360px;
    max-width: calc(100vw - 32px);
    height: 460px;
    max-height: calc(100vh - 96px);
    background: #0d1117;
    color: #f0f6fc;
    border: 1px solid #30363d;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6);
  }
  .gpi-chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
  }
  .gpi-chat-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .gpi-chat-title-text {
    min-width: 0;
  }
  .gpi-chat-title {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .gpi-pro-badge {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 9999px;
    background: rgba(46, 160, 67, 0.18);
    color: #3fb950;
    border: 1px solid rgba(46, 160, 67, 0.45);
  }
  .gpi-chat-subtitle {
    font-size: 11px;
    color: #8b949e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gpi-chat-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .gpi-icon-btn {
    background: transparent;
    color: #8b949e;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 4px 7px;
    font-size: 11px;
    cursor: pointer;
  }
  .gpi-icon-btn:hover {
    color: #f0f6fc;
    background: #21262d;
    border-color: #30363d;
  }
  .gpi-chat-gate {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px 20px;
    gap: 10px;
  }
  .gpi-gate-title {
    margin: 4px 0 0;
    font-size: 15px;
    font-weight: 700;
    color: #f0f6fc;
  }
  .gpi-gate-desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: #8b949e;
  }
  .gpi-upgrade-btn {
    margin-top: 6px;
    background: #238636;
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.12);
    border-radius: 8px;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .gpi-upgrade-btn:hover:not(:disabled) {
    background: #2ea043;
  }
  .gpi-upgrade-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .gpi-refresh-btn {
    background: transparent;
    border: none;
    color: #58a6ff;
    font-size: 11.5px;
    cursor: pointer;
    padding: 4px;
  }
  .gpi-refresh-btn:hover {
    text-decoration: underline;
  }
  .gpi-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gpi-chat-empty {
    margin: auto 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gpi-empty-prompt {
    margin: 0;
    font-size: 12.5px;
    color: #8b949e;
  }
  .gpi-quick-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
  .gpi-quick-chip {
    background: #161b22;
    color: #58a6ff;
    border: 1px solid #30363d;
    border-radius: 9999px;
    padding: 5px 10px;
    font-size: 11.5px;
    cursor: pointer;
  }
  .gpi-quick-chip:hover {
    border-color: #58a6ff;
    background: #1c2128;
  }
  .gpi-msg {
    display: flex;
  }
  .gpi-msg-user {
    justify-content: flex-end;
  }
  .gpi-msg-assistant {
    justify-content: flex-start;
  }
  .gpi-msg-bubble {
    max-width: 85%;
    padding: 8px 11px;
    border-radius: 10px;
    font-size: 12.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .gpi-msg-user .gpi-msg-bubble {
    background: #1f6feb;
    color: #ffffff;
    border-bottom-right-radius: 3px;
  }
  .gpi-msg-assistant .gpi-msg-bubble {
    background: #161b22;
    color: #e6edf3;
    border: 1px solid #30363d;
    border-bottom-left-radius: 3px;
  }
  .gpi-chat-error {
    margin: 0 12px 8px;
    padding: 7px 10px;
    border-radius: 8px;
    background: rgba(248, 81, 73, 0.14);
    border: 1px solid rgba(248, 81, 73, 0.45);
    color: #ff7b72;
    font-size: 11.5px;
  }
  .gpi-chat-form {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    background: #161b22;
    border-top: 1px solid #30363d;
  }
  .gpi-chat-input {
    flex: 1;
    min-width: 0;
    background: #0d1117;
    color: #f0f6fc;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12.5px;
    outline: none;
  }
  .gpi-chat-input:focus {
    border-color: #58a6ff;
  }
  .gpi-send-btn,
  .gpi-stop-btn {
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .gpi-send-btn {
    background: #238636;
    color: #ffffff;
  }
  .gpi-send-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .gpi-stop-btn {
    background: #da3633;
    color: #ffffff;
  }
`

export const FloatingMascot: React.FC<FloatingMascotProps> = ({ repo }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [mascotEnabled, setMascotEnabled] = useState(true)

  useEffect(() => {
    let active = true
    void fetchRemoteConfig()
      .then((config) => {
        if (active) {
          const mascotAccess = getModuleAccess(config, 'mascotChat', 'pro')
          setMascotEnabled(config.featureFlags.enableMascot && mascotAccess !== 'disabled')
        }
      })
      .catch(() => {
        // Keep default enabled state if remote config is temporarily unreachable
      })

    return () => {
      active = false
    }
  }, [])

  if (!repo || !mascotEnabled) {
    return null
  }

  return (
    <div className="gpi-mascot-root">
      {isOpen && (
        <MascotChatWindow
          owner={repo.owner}
          repo={repo.repo}
          commitSha={repo.commitSha}
          onClose={() => setIsOpen(false)}
        />
      )}
      <button
        type="button"
        className="gpi-mascot-fab"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close Octo mascot chat' : 'Open Octo mascot chat'}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <MascotAvatarSvg size={22} />
        <span>Ask Octo</span>
        <span className="gpi-pro-badge">PRO</span>
      </button>
    </div>
  )
}
