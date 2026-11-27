import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ExternalLink,
  Megaphone,
  Pin,
  Sparkles,
  X,
  Zap
} from 'lucide-react'
import type { InAppNotificationItem } from '../api/backendClient'

const STORAGE_KEY_READ_NOTIFS = 'gpi_read_notifications'

export interface NotificationCenterPopoverProps {
  notifications?: InAppNotificationItem[]
  isPro?: boolean
  onActionClick?: (url: string) => void
}

export function NotificationCenterPopover({
  notifications = [],
  isPro = false,
  onActionClick
}: NotificationCenterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_READ_NOTIFS)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  // Filter notifications relevant to this user tier
  const activeItems = useMemo(() => {
    const userTier = isPro ? 'pro' : 'free'
    return notifications.filter(
      (n) => n.active !== false && (n.targetTier === 'all' || n.targetTier === userTier)
    )
  }, [notifications, isPro])

  // Count unread
  const unreadCount = useMemo(() => {
    return activeItems.filter((n) => !readIds.includes(n.id)).length
  }, [activeItems, readIds])

  const handleMarkAllRead = () => {
    const allIds = activeItems.map((n) => n.id)
    const combined = Array.from(new Set([...readIds, ...allIds]))
    setReadIds(combined)
    try {
      localStorage.setItem(STORAGE_KEY_READ_NOTIFS, JSON.stringify(combined))
    } catch {
      // ignore
    }
  }

  const handleItemClick = (item: InAppNotificationItem) => {
    if (!readIds.includes(item.id)) {
      const combined = [...readIds, item.id]
      setReadIds(combined)
      try {
        localStorage.setItem(STORAGE_KEY_READ_NOTIFS, JSON.stringify(combined))
      } catch {
        // ignore
      }
    }
    if (item.actionUrl) {
      if (onActionClick) {
        onActionClick(item.actionUrl)
      } else {
        window.open(item.actionUrl, '_blank')
      }
    }
  }

  if (activeItems.length === 0) {
    return null
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Centro de Avisos & Novedades"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          background: isOpen ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: isOpen ? '#818cf8' : 'var(--text-secondary, #94a3b8)',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              minWidth: 14,
              height: 14,
              borderRadius: 999,
              background: '#f43f5e',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              border: '1.5px solid var(--bg-surface, #0f172a)'
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div className="ext-notif-popover animate-fade-in">
          {/* Popover Header */}
          <div className="ext-notif-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={13} style={{ color: 'var(--brand-primary, #818cf8)' }} />
              <span className="ext-notif-header-title">
                Novedades
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#818cf8'
                  }}
                >
                  {unreadCount} nuevas
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#818cf8',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Marcar leídas
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="ext-modal-close-btn"
                title="Cerrar notificaciones"
                aria-label="Cerrar"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Popover Items List */}
          <div
            style={{
              padding: 8,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}
          >
            {activeItems.map((n) => {
              const isRead = readIds.includes(n.id)
              return (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`ext-notif-item ${isRead ? 'is-read' : 'is-unread'}`}
                  style={{
                    cursor: n.actionUrl ? 'pointer' : 'default'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background:
                          n.type === 'feature'
                            ? 'rgba(99, 102, 241, 0.2)'
                            : n.type === 'warning'
                            ? 'rgba(244, 63, 94, 0.2)'
                            : 'rgba(16, 185, 129, 0.2)',
                        color:
                          n.type === 'feature'
                            ? '#818cf8'
                            : n.type === 'warning'
                            ? '#f43f5e'
                            : '#34d399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 1
                      }}
                    >
                      {n.type === 'feature' ? (
                        <Sparkles size={11} />
                      ) : n.type === 'warning' ? (
                        <AlertTriangle size={11} />
                      ) : (
                        <Megaphone size={11} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="ext-notif-item-title">
                          {n.title}
                        </span>
                        {n.pinned && <Pin size={10} style={{ color: '#818cf8' }} />}
                      </div>
                      <p className="ext-notif-item-desc">
                        {n.message}
                      </p>
                      {(n.actionLabel || (n as any).actionText) && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#818cf8',
                            marginTop: 4
                          }}
                        >
                          <span>{n.actionLabel || (n as any).actionText}</span>
                          <ArrowRight size={10} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
