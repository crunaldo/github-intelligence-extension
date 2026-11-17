import React, { useEffect, useRef, useState } from 'react'
import {
  BackendApiError,
  streamMascotChat,
  type MascotChatMessage,
} from '../../extension/api/backendClient'
import {
  getAuthSession,
  refreshProStatus,
  requestProUpgradeFromContentScript,
  saveAuthSession,
  type AuthSession,
} from '../../extension/auth/supabaseAuth'

export interface MascotChatWindowProps {
  owner: string
  repo: string
  commitSha?: string
  onClose: () => void
}

const QUICK_PROMPTS = [
  'What does this repo do?',
  'Explain the architecture',
  'Key stack & entrypoints',
] as const

export const MascotAvatarSvg: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <svg
    width={size}
    height={size}
    viewBox="21 18 194 194"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="118" cy="115" r="90" fill="#161b22" stroke="#30363d" strokeWidth="6" />
    <path
      d="M 57 38 L 77 73 L 51 68 L 69 104 L 51 101 C 54 140 78 175 122 185 C 165 185 194 155 194 116 C 194 84 155 46 65 38 Z"
      fill="#f0f6fc"
    />
    <ellipse cx="130" cy="120" rx="14" ry="19" fill="#0d1117" />
    <ellipse cx="168" cy="116" rx="14" ry="19" fill="#0d1117" />
    <circle cx="126" cy="113" r="4" fill="#58a6ff" />
    <circle cx="164" cy="109" r="4" fill="#58a6ff" />
  </svg>
)

export const MascotChatWindow: React.FC<MascotChatWindowProps> = ({
  owner,
  repo,
  commitSha,
  onClose,
}) => {
  const [messages, setMessages] = useState<MascotChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [refreshingStatus, setRefreshingStatus] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  // Check auth session on mount and subscribe to storage changes
  useEffect(() => {
    let active = true
    void getAuthSession()
      .then((current) => {
        if (active) {
          setSession(current)
          setAuthLoaded(true)
        }
      })
      .catch(() => {
        if (active) {
          setSession(null)
          setAuthLoaded(true)
        }
      })

    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local' || !changes.gpi_auth_session) return
      void getAuthSession().then((updated) => {
        if (active) setSession(updated)
      })
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChange)
    }

    return () => {
      active = false
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(onStorageChange)
      }
    }
  }, [])

  // Reset conversation and cancel in-flight stream when repo changes or on unmount
  useEffect(() => {
    requestIdRef.current += 1
    setMessages([])
    setError(null)
    setIsStreaming(false)

    return () => {
      requestIdRef.current += 1
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [owner, repo])

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  const stopStreaming = () => {
    requestIdRef.current += 1
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === 'assistant' && !last.content) {
        return prev.slice(0, -1)
      }
      return prev
    })
    setIsStreaming(false)
  }

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim()
    if (!trimmed || isStreaming) return

    setError(null)
    setInput('')

    const userMessage: MascotChatMessage = { role: 'user', content: trimmed }
    const requestMessages = [...messages, userMessage]

    setMessages([...requestMessages, { role: 'assistant', content: '' }])
    setIsStreaming(true)

    const requestId = ++requestIdRef.current
    const controller = new AbortController()
    abortControllerRef.current = controller
    const isCurrentRequest = () =>
      requestIdRef.current === requestId && abortControllerRef.current === controller

    try {
      await streamMascotChat({
        messages: requestMessages,
        repoContext: {
          owner,
          repo,
          ...(commitSha ? { commitSha } : {}),
        },
        signal: controller.signal,
        onDelta: (delta) => {
          if (!isCurrentRequest()) return
          setMessages((prev) => {
            if (prev.length === 0) return prev
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + delta,
              }
            }
            return updated
          })
        },
      })
    } catch (err) {
      if (!isCurrentRequest()) {
        return
      }

      // Remove empty assistant placeholder if no delta arrived before abort/failure
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && !last.content) {
          return prev.slice(0, -1)
        }
        return prev
      })

      if ((err as { name?: string })?.name === 'AbortError') {
        return
      }

      if (err instanceof BackendApiError) {
        if (err.status === 403 && err.code === 'PRO_REQUIRED') {
          setSession((prev) => (prev ? { ...prev, isPro: false } : null))
          void refreshProStatus().then(async (updated) => {
            if (!updated) {
              setSession(null)
              return
            }
            if (updated.isPro) {
              const downgraded = { ...updated, isPro: false }
              await saveAuthSession(downgraded)
              setSession(downgraded)
            } else {
              setSession(updated)
            }
          })
          return
        }
        if (err.status === 403 && err.code === 'MASCOT_DISABLED') {
          setError('Mascot chat is currently disabled by administrator.')
          return
        }
        if (err.code === 'MAINTENANCE_MODE') {
          setError(err.message || 'Service is temporarily under maintenance.')
          return
        }
        if (err.status === 429) {
          setError('Daily Pro quota (250/day) reached. Try again after UTC reset.')
          return
        }
        if (err.status === 503) {
          setError('AI providers are temporarily busy. Please retry shortly.')
          return
        }
        setError(err.message)
        return
      }

      setError('Could not connect to mascot chat. Please try again.')
    } finally {
      if (isCurrentRequest()) {
        abortControllerRef.current = null
        setIsStreaming(false)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const handleUpgrade = async () => {
    setError(null)
    setUpgrading(true)
    try {
      const result = await requestProUpgradeFromContentScript()
      if (result.session !== undefined) {
        setSession(result.session)
      }
      if (!result.ok && result.error) {
        setError(result.error)
      }
    } finally {
      setUpgrading(false)
    }
  }

  const handleRefreshStatus = async () => {
    setError(null)
    setRefreshingStatus(true)
    try {
      const refreshed = await refreshProStatus()
      setSession(refreshed)
      if (!refreshed) {
        setError('Session expired or not signed in. Please sign in with GitHub again.')
      } else if (!refreshed.isPro) {
        setError('No active Pro subscription found yet. Complete checkout or retry shortly.')
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not refresh Pro status. Please try again.'
      )
    } finally {
      setRefreshingStatus(false)
    }
  }

  const isPro = Boolean(session?.isPro)

  return (
    <section
      className="gpi-chat-window"
      role="dialog"
      aria-label={`Octo AI Chat for ${owner}/${repo}`}
    >
      <header className="gpi-chat-header">
        <div className="gpi-chat-title-wrap">
          <MascotAvatarSvg size={24} />
          <div className="gpi-chat-title-text">
            <div className="gpi-chat-title">
              Octo Copilot <span className="gpi-pro-badge">PRO</span>
            </div>
            <div className="gpi-chat-subtitle">
              {owner}/{repo}
            </div>
          </div>
        </div>
        <div className="gpi-chat-header-actions">
          {messages.length > 0 && isPro && (
            <button
              type="button"
              className="gpi-icon-btn"
              onClick={() => {
                stopStreaming()
                setMessages([])
                setError(null)
              }}
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="gpi-icon-btn"
            onClick={onClose}
            aria-label="Close mascot chat"
          >
            ✕
          </button>
        </div>
      </header>

      {!authLoaded ? (
        <div className="gpi-chat-gate">
          <p className="gpi-gate-desc">Checking Pro status...</p>
        </div>
      ) : !isPro ? (
        <div className="gpi-chat-gate">
          <MascotAvatarSvg size={44} />
          <h3 className="gpi-gate-title">Unlock Octo Floating Copilot</h3>
          <p className="gpi-gate-desc">
            Chat with <strong>{owner}/{repo}</strong> in real time right on GitHub. Included
            with Pro (250 daily requests shared with deep repo analysis).
          </p>
          <button
            type="button"
            className="gpi-upgrade-btn"
            disabled={upgrading}
            onClick={() => void handleUpgrade()}
          >
            {upgrading
              ? 'Opening checkout...'
              : session?.user
                ? 'Upgrade to Pro'
                : 'Sign in with GitHub & Upgrade'}
          </button>
          {session?.user && (
            <button
              type="button"
              className="gpi-refresh-btn"
              disabled={refreshingStatus || upgrading}
              onClick={() => void handleRefreshStatus()}
            >
              {refreshingStatus ? 'Checking Pro status...' : 'Already upgraded? Refresh status'}
            </button>
          )}
          {error && (
            <div className="gpi-chat-error" role="alert">
              {error}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="gpi-chat-messages" ref={scrollAreaRef}>
            {messages.length === 0 ? (
              <div className="gpi-chat-empty">
                <p className="gpi-empty-prompt">
                  Ask anything about <strong>{owner}/{repo}</strong>:
                </p>
                <div className="gpi-quick-chips">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="gpi-quick-chip"
                      onClick={() => void sendMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={`${msg.role}-${idx}`}
                  className={`gpi-msg gpi-msg-${msg.role}`}
                >
                  <div className="gpi-msg-bubble">
                    {msg.content ||
                      (isStreaming && idx === messages.length - 1 ? 'Thinking...' : '')}
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <div className="gpi-chat-error" role="alert">
              {error}
            </div>
          )}

          <form className="gpi-chat-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="gpi-chat-input"
              aria-label={`Ask a question about ${owner}/${repo}`}
              placeholder={`Ask about ${repo}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button
                type="button"
                className="gpi-stop-btn"
                onClick={stopStreaming}
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                className="gpi-send-btn"
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </form>
        </>
      )}
    </section>
  )
}
