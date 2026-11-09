// Free Multi-Language Translation Service (No API Key Required)
// Uses Google Translate GTX client API with MyMemory fallback and local in-memory cache

const translationMemory = new Map<string, string>()

function polishSpanishTechTerms(text: string): string {
  let polished = text
  polished = polished.replace(/\bframeworks\b/gi, 'marcos de trabajo (frameworks)')
  polished = polished.replace(/\bruntimes\b/gi, 'entornos de ejecución')
  polished = polished.replace(/\bruntime\b/gi, 'entorno de ejecución')
  polished = polished.replace(/\bpackage manager\b/gi, 'gestor de paquetes')
  polished = polished.replace(/\bcli\b/gi, 'interfaz de línea de comandos (CLI)')
  polished = polished.replace(/\bopen source\b/gi, 'código abierto')
  polished = polished.replace(/\bbuilt with\b/gi, 'desarrollado con')
  polished = polished.replace(/\bbuilt for\b/gi, 'creado para')
  return polished
}

export async function translateText(rawText: string, targetLocale: 'es' | 'en' = 'es'): Promise<string> {
  if (!rawText || !rawText.trim()) return ''
  const trimmed = rawText.trim()
  const cacheKey = `${targetLocale}:${trimmed}`

  if (translationMemory.has(cacheKey)) {
    return translationMemory.get(cacheKey)!
  }

  // 1. Primary: Free Google Translate Client API (ultra-fast, ~100ms)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLocale}&dt=t&q=${encodeURIComponent(trimmed)}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data?.[0])) {
        const fullTranslation = data[0]
          .map((part: any) => part?.[0] || '')
          .join('')
          .trim()

        if (fullTranslation && fullTranslation.length > 2) {
          const polished = targetLocale === 'es' ? polishSpanishTechTerms(fullTranslation) : fullTranslation
          translationMemory.set(cacheKey, polished)
          return polished
        }
      }
    }
  } catch (err) {
    console.warn('Google Translate API error, attempting fallback:', err)
  }

  // 2. Secondary: MyMemory Free Translation API
  try {
    const langPair = targetLocale === 'es' ? 'en|es' : 'es|en'
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${langPair}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      const text = data?.responseData?.translatedText?.trim()
      if (text && !text.toLowerCase().includes('mymemory') && !text.toLowerCase().includes('quota')) {
        const polished = targetLocale === 'es' ? polishSpanishTechTerms(text) : text
        translationMemory.set(cacheKey, polished)
        return polished
      }
    }
  } catch {
    // Network fallback
  }

  return trimmed
}

export async function translateToSpanish(rawText: string): Promise<string> {
  return translateText(rawText, 'es')
}
