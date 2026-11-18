import { describe, it, expect } from 'vitest'
import { parseAndTranslateError } from './ApiErrorCard'

describe('ApiErrorCard - parseAndTranslateError', () => {
  const userRateLimitError =
    "Error: API rate limit exceeded for 38.253.147.40. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)"

  it('detects GitHub token requirement error in Spanish without rate-limit numbers', () => {
    const result = parseAndTranslateError(userRateLimitError, 'es')
    expect(result).not.toBeNull()
    expect(result?.isRateLimit).toBe(true)
    expect(result?.title).toBe('Token de GitHub Requerido para Continuar')
    expect(result?.description).toContain('árboles de código, manifiestos y metadatos')
    expect(result?.recommendation).toContain('GitHub Personal Access Token')
    expect(result?.actionLabel).toBe('Ir a Ajustes para añadir Token')

    const combined = `${result?.title} ${result?.description} ${result?.recommendation}`
    expect(combined).not.toMatch(/\b60\b/)
    expect(combined).not.toMatch(/5[,.]?000/)
    expect(combined.toLowerCase()).not.toContain('peticiones/hora')
  })

  it('detects GitHub token requirement error in English without rate-limit numbers', () => {
    const result = parseAndTranslateError(userRateLimitError, 'en')
    expect(result).not.toBeNull()
    expect(result?.isRateLimit).toBe(true)
    expect(result?.title).toBe('GitHub Token Required to Continue')
    expect(result?.description).toContain('code trees, manifests, and metadata')
    expect(result?.recommendation).toContain('GitHub Personal Access Token')
    expect(result?.actionLabel).toBe('Go to Settings to add Token')

    const combined = `${result?.title} ${result?.description} ${result?.recommendation}`
    expect(combined).not.toMatch(/\b60\b/)
    expect(combined).not.toMatch(/5[,.]?000/)
    expect(combined.toLowerCase()).not.toContain('requests/hour')
  })

  it('detects and translates bad credentials error', () => {
    const result = parseAndTranslateError('Bad credentials', 'es')
    expect(result).not.toBeNull()
    expect(result?.isBadCredentials).toBe(true)
    expect(result?.title).toBe('Token de GitHub no Válido o Expirado')
    expect(result?.actionLabel).toBe('Ir a Ajustes para actualizar Token')
  })

  it('detects and translates not found error with public_repo operational guidance', () => {
    const result = parseAndTranslateError('Not Found', 'es')
    expect(result).not.toBeNull()
    expect(result?.isNotFound).toBe(true)
    expect(result?.title).toBe('Repositorio no Encontrado o Inaccesible')
    expect(result?.recommendation).toContain('public_repo')
    expect(result?.actionLabel).toBe('Configurar Token en Ajustes')
  })
})
