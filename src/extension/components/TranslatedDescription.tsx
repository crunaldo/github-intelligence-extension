import { useState, useEffect } from 'react'
import { translateText } from '../translate'
import type { ActiveLocale } from '../i18n'

type TranslatedDescriptionProps = {
  rawText?: string | null
  fallback?: string
  locale?: ActiveLocale
}

export function TranslatedDescription({ rawText, fallback = '', locale = 'es' }: TranslatedDescriptionProps) {
  const [displayDesc, setDisplayDesc] = useState<string>(() => fallback || rawText || '')

  useEffect(() => {
    let isCancelled = false
    const textToTranslate = rawText?.trim() || fallback?.trim()

    if (textToTranslate && textToTranslate.length > 3) {
      void translateText(textToTranslate, locale).then((translated) => {
        if (!isCancelled && translated && translated.length > 2) {
          let clean = translated.charAt(0).toUpperCase() + translated.slice(1)
          if (!clean.endsWith('.')) clean += '.'
          setDisplayDesc(clean)
        }
      })
    } else {
      setDisplayDesc(fallback || (locale === 'es' ? 'Sin descripción disponible.' : 'No description available.'))
    }

    return () => {
      isCancelled = true
    }
  }, [rawText, fallback, locale])

  return (
    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
      {displayDesc}
    </p>
  )
}
