import React, { useRef, useEffect, useState } from 'react'

export type SegmentedOption<T extends string = string> = {
  id: T
  label: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
}

type SegmentedPillProps<T extends string = string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  fullWidth?: boolean
}

export function SegmentedPill<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  fullWidth = false,
}: SegmentedPillProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  })

  useEffect(() => {
    if (!containerRef.current) return
    const activeEl = containerRef.current.querySelector<HTMLButtonElement>(`[data-segmented-id="${value}"]`)
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        opacity: 1,
      })
    }
  }, [value, options])

  return (
    <div
      ref={containerRef}
      className={`segmented-pill-container segmented-size-${size} ${fullWidth ? 'full-width' : ''} ${className}`}
      style={{
        position: 'relative',
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-surface-elevated, #161b22)',
        padding: 3,
        borderRadius: 'var(--radius-sm, 6px)',
        border: '1px solid var(--border-subtle, #30363d)',
        userSelect: 'none',
      }}
    >
      {/* Sliding Pill Indicator */}
      <div
        className="segmented-sliding-pill"
        style={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: 0,
          transform: `translateX(${indicatorStyle.left}px)`,
          width: indicatorStyle.width,
          opacity: indicatorStyle.opacity,
          background: 'var(--bg-card, #21262d)',
          borderRadius: 4,
          border: '1px solid var(--border-medium, #484f58)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), width 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {options.map((opt) => {
        const isActive = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            data-segmented-id={opt.id}
            onClick={() => onChange(opt.id)}
            className={`segmented-item-btn ${isActive ? 'is-active' : ''}`}
            style={{
              position: 'relative',
              zIndex: 2,
              flex: fullWidth ? 1 : 'initial',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: size === 'sm' ? '3px 7px' : '5px 10px',
              fontSize: size === 'sm' ? 10.5 : 11.5,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #8b949e)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s ease',
            }}
          >
            {opt.icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.badge && <span style={{ marginLeft: 2 }}>{opt.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
