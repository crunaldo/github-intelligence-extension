import React, { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown, Check, Sparkles, Send, MessageSquare } from 'lucide-react'
import {
  submitUserFeedback,
  fetchRemoteConfig,
  isFeedbackLocationEnabled,
  type SubmitFeedbackParams,
  type FeedbackLocationsConfig
} from '../api/backendClient'
import type { ActiveLocale } from '../i18n'

export interface UserFeedbackWidgetProps {
  repo: string
  provider?: string
  defaultCategory?: 'accuracy' | 'diagram' | 'mascot' | 'speed' | 'general'
  location?: keyof FeedbackLocationsConfig
  locale?: ActiveLocale
  compact?: boolean
  className?: string
  onFeedbackSubmitted?: (feedbackId: string) => void
}

export function UserFeedbackWidget({
  repo,
  provider,
  defaultCategory = 'general',
  location,
  locale = 'es',
  compact = false,
  className = '',
  onFeedbackSubmitted,
}: UserFeedbackWidgetProps) {
  const [enabled, setEnabled] = useState(true)
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null)
  const [category, setCategory] = useState<SubmitFeedbackParams['category']>(defaultCategory)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const isEs = locale === 'es'
  const storageKey = `gpi_rated_${location ? `${location}_` : ''}${repo.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`

  // Check remote config location toggle
  useEffect(() => {
    if (!location) return
    let active = true
    fetchRemoteConfig()
      .then((cfg) => {
        if (active && !isFeedbackLocationEnabled(cfg, location)) {
          setEnabled(false)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [location])

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(storageKey).then((data) => {
        if (data?.[storageKey]) {
          setSubmitted(true)
          setRating(data[storageKey].rating)
        }
      }).catch(() => {})
    }
  }, [storageKey])

  const handleInitialRating = async (chosenRating: 'positive' | 'negative') => {
    setRating(chosenRating)
    setExpanded(true)
    setSubmitting(true)

    try {
      const res = await submitUserFeedback({
        repo,
        rating: chosenRating,
        category: defaultCategory,
        location,
        provider,
      })

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({
          [storageKey]: { rating: chosenRating, timestamp: Date.now() },
        })
      }

      onFeedbackSubmitted?.(res.id)
    } catch (err) {
      console.warn('Failed to submit initial rating:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDetailSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!rating) return

    setSubmitting(true)
    try {
      const res = await submitUserFeedback({
        repo,
        rating,
        category,
        location,
        comment: comment.trim() || undefined,
        provider,
      })

      setSubmitted(true)
      setExpanded(false)

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({
          [storageKey]: { rating, comment, category, timestamp: Date.now() },
        })
      }

      onFeedbackSubmitted?.(res.id)
    } catch (err) {
      console.warn('Failed to submit detailed feedback:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (!enabled) {
    return null
  }

  const getQuestionLabel = () => {
    if (location === 'repo_explanation') {
      return isEs ? '¿Fue clara y precisa la explicación del repo?' : 'Was the repo explanation clear and accurate?'
    }
    if (location === 'architecture') {
      return isEs ? '¿Te resultó útil el diagrama de arquitectura?' : 'Was the architecture diagram helpful?'
    }
    if (location === 'file_explainer') {
      return isEs ? '¿Te sirvió la explicación del archivo?' : 'Was this file explanation helpful?'
    }
    if (location === 'mascot') {
      return isEs ? '¿Qué tal la respuesta de la mascota Octo?' : 'How was the Octo mascot reply?'
    }
    return isEs ? '¿Te resultó útil este análisis?' : 'Was this analysis helpful?'
  }

  if (submitted && !expanded) {
    return (
      <div
        className={`gpi-feedback-widget ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: compact ? '4px 8px' : '8px 12px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 8,
          fontSize: 11,
          color: '#10b981',
          marginTop: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
          <Check size={13} />
          <span>
            {isEs
              ? '¡Gracias por tu valoración! Nos ayuda a perfeccionar la IA.'
              : 'Thank you for your rating! It helps us refine the AI.'}
          </span>
        </div>
        <span style={{ fontSize: 13 }}>{rating === 'positive' ? '👍' : '👎'}</span>
      </div>
    )
  }

  return (
    <div
      className={`gpi-feedback-widget ${className}`}
      style={{
        background: 'var(--bg-surface-elevated, #161b22)',
        border: '1px solid var(--border-subtle, #30363d)',
        borderRadius: 8,
        padding: compact ? '6px 10px' : '10px 14px',
        marginTop: 8,
        fontSize: 12,
        color: 'var(--text-primary, #e6edf3)',
      }}
    >
      {/* Question Header & Initial Thumbs Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary, #8b949e)', fontSize: 11.5 }}>
          <MessageSquare size={13} style={{ color: 'var(--accent-cyan, #38bdf8)' }} />
          <span>{getQuestionLabel()}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => handleInitialRating('positive')}
            disabled={submitting}
            title={isEs ? 'Sí, muy útil' : 'Yes, helpful'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 6,
              background: rating === 'positive' ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-surface, rgba(255, 255, 255, 0.05))',
              border: `1px solid ${rating === 'positive' ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-medium, rgba(255, 255, 255, 0.1))'}`,
              color: rating === 'positive' ? '#10b981' : 'var(--text-secondary, #8b949e)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            <ThumbsUp size={12} fill={rating === 'positive' ? 'currentColor' : 'none'} />
            <span>{isEs ? 'Útil' : 'Helpful'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleInitialRating('negative')}
            disabled={submitting}
            title={isEs ? 'No, puede mejorar' : 'Not helpful'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 6,
              background: rating === 'negative' ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-surface, rgba(255, 255, 255, 0.05))',
              border: `1px solid ${rating === 'negative' ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-medium, rgba(255, 255, 255, 0.1))'}`,
              color: rating === 'negative' ? '#ef4444' : 'var(--text-secondary, #8b949e)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            <ThumbsDown size={12} fill={rating === 'negative' ? 'currentColor' : 'none'} />
            <span>{isEs ? 'Mejorable' : 'Needs work'}</span>
          </button>
        </div>
      </div>

      {/* Expanded Details Form */}
      {expanded && (
        <form onSubmit={handleDetailSubmit} style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #8b949e)', marginBottom: 6 }}>
            {rating === 'positive'
              ? (isEs ? '¿Qué aspecto destacó más? (Opcional)' : 'What stood out the most? (Optional)')
              : (isEs ? '¿Qué falló o qué podríamos mejorar?' : 'What failed or could be improved?')}
          </div>

          {/* Category Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {[
              { id: 'accuracy' as const, labelEs: '🎯 Precisión', labelEn: '🎯 Accuracy' },
              { id: 'diagram' as const, labelEs: '📊 Diagrama', labelEn: '📊 Diagram' },
              { id: 'mascot' as const, labelEs: '🐙 Mascota Octo', labelEn: '🐙 Octo Mascot' },
              { id: 'speed' as const, labelEs: '⚡ Velocidad', labelEn: '⚡ Speed' },
              { id: 'general' as const, labelEs: '💬 General', labelEn: '💬 General' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                style={{
                  fontSize: 10.5,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: category === cat.id ? 'var(--brand-primary, #FF2F5A)' : 'var(--bg-surface, rgba(255, 255, 255, 0.04))',
                  border: `1px solid ${category === cat.id ? 'var(--brand-primary, #FF2F5A)' : 'var(--border-medium, rgba(255, 255, 255, 0.1))'}`,
                  color: category === cat.id ? '#ffffff' : 'var(--text-secondary, #8b949e)',
                  cursor: 'pointer',
                }}
              >
                {isEs ? cat.labelEs : cat.labelEn}
              </button>
            ))}
          </div>

          {/* Optional Comment Input */}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={isEs ? 'Escribe un comentario breve...' : 'Leave a quick comment...'}
              maxLength={250}
              style={{
                flex: 1,
                fontSize: 11,
                padding: '5px 8px',
                borderRadius: 6,
                background: 'var(--bg-input, rgba(0, 0, 0, 0.25))',
                border: '1px solid var(--border-medium, #30363d)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 6,
                background: 'var(--brand-primary, #FF2F5A)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Send size={11} />
              <span>{isEs ? 'Enviar' : 'Send'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
