import React, { useState } from 'react'
import { Copy, Check, Terminal } from 'lucide-react'
import { SegmentedPill, type SegmentedOption } from './SegmentedPill'
import type { ActiveLocale } from '../i18n'

export type TerminalOption = {
  id: string
  label: string
  command: string
  description?: string
}

type TerminalSnippetProps = {
  command?: string
  options?: TerminalOption[]
  selectedOptionId?: string
  onOptionChange?: (id: string) => void
  title?: string
  locale?: ActiveLocale
  className?: string
  showLineNumbers?: boolean
}

export function TerminalSnippet({
  command,
  options = [],
  selectedOptionId,
  onOptionChange,
  title = 'bash — terminal',
  locale = 'es',
  className = '',
}: TerminalSnippetProps) {
  const isEs = locale === 'es'
  const [internalSelectedId, setInternalSelectedId] = useState(options[0]?.id || '')
  const [copied, setCopied] = useState(false)

  const activeId = selectedOptionId !== undefined ? selectedOptionId : internalSelectedId
  const activeOption = options.find((opt) => opt.id === activeId) || options[0]

  const activeCommand = activeOption ? activeOption.command : command || ''

  const handleSelectOption = (id: string) => {
    if (selectedOptionId === undefined) {
      setInternalSelectedId(id)
    }
    if (onOptionChange) {
      onOptionChange(id)
    }
  }

  const handleCopy = async () => {
    if (!activeCommand) return
    try {
      await navigator.clipboard.writeText(activeCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  // Syntax highlighting helper for common CLI commands
  const renderHighlightedCommand = (raw: string) => {
    const parts = raw.split(' ')
    const firstWord = parts[0] || ''
    const rest = parts.slice(1)

    return (
      <span className="terminal-cmd-line">
        <span className="terminal-prompt">$</span>
        <span className="terminal-binary">{firstWord}</span>
        {rest.map((word, i) => {
          const isFlag = word.startsWith('-')
          const isUrl = word.startsWith('http') || word.endsWith('.git')
          return (
            <React.Fragment key={i}>
              {' '}
              <span
                className={
                  isFlag
                    ? 'terminal-flag'
                    : isUrl
                    ? 'terminal-url'
                    : 'terminal-arg'
                }
              >
                {word}
              </span>
            </React.Fragment>
          )
        })}
        <span className="terminal-cursor" />
      </span>
    )
  }

  const segmentedOptions: SegmentedOption<string>[] = options.map((opt) => ({
    id: opt.id,
    label: opt.label,
  }))

  return (
    <div className={`terminal-window-card ${className}`}>
      {/* macOS-style Header Bar */}
      <div className="terminal-window-header">
        <div className="terminal-header-left">
          <div className="terminal-mac-dots">
            <span className="mac-dot mac-dot-close" />
            <span className="mac-dot mac-dot-minimize" />
            <span className="mac-dot mac-dot-maximize" />
          </div>
          <div className="terminal-title-row">
            <Terminal size={11} style={{ color: 'var(--text-muted)' }} />
            <span className="terminal-title-text">{title}</span>
          </div>
        </div>

        {/* Optional Segmented Tool Switcher */}
        {options.length > 1 && (
          <div className="terminal-tools-switcher">
            <SegmentedPill
              options={segmentedOptions}
              value={activeId}
              onChange={handleSelectOption}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Terminal Content Body */}
      <div
        className="terminal-window-body"
        onClick={() => void handleCopy()}
        title={isEs ? 'Clic para copiar' : 'Click to copy'}
      >
        <div className="terminal-code-scroll">
          {renderHighlightedCommand(activeCommand)}
        </div>

        {/* Copy Button */}
        <button
          type="button"
          className={`terminal-copy-btn ${copied ? 'is-copied' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            void handleCopy()
          }}
          aria-label={copied ? (isEs ? 'Copiado' : 'Copied') : (isEs ? 'Copiar comando' : 'Copy command')}
        >
          {copied ? (
            <>
              <Check size={12} className="terminal-check-icon" />
              <span>{isEs ? '¡Copiado!' : 'Copied!'}</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>{isEs ? 'Copiar' : 'Copy'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
