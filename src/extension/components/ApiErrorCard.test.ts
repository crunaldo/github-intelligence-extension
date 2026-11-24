import { describe, it, expect } from 'vitest'
import { parseAndTranslateError } from './ApiErrorCard'

describe('ApiErrorCard - parseAndTranslateError', () => {
  const userRateLimitError =
    "Error: API rate limit exceeded for 38.253.147.40. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)"

  it('detects GitHub token requirement error in Spanish without rate-limit numbers', () => {
    const result = parseAndTranslateError(userRateLimitError, 'es')
    expect(result).not.toBeNull()
    expect(result?.isRateLimit).toBe(true)
    expect(result?.title).toBe('Conecta tu cuenta de GitHub para Continuar')
    expect(result?.description).toContain('árboles de código, manifiestos y metadatos')
    expect(result?.recommendation).toContain('Ajustes')
    expect(result?.actionLabel).toBe('Conectar cuenta de GitHub')

    const combined = `${result?.title} ${result?.description} ${result?.recommendation}`
    expect(combined).not.toMatch(/\b60\b/)
    expect(combined).not.toMatch(/5[,.]?000/)
    expect(combined.toLowerCase()).not.toContain('peticiones/hora')
  })

  it('detects GitHub token requirement error in English without rate-limit numbers', () => {
    const result = parseAndTranslateError(userRateLimitError, 'en')
    expect(result).not.toBeNull()
    expect(result?.isRateLimit).toBe(true)
    expect(result?.title).toBe('Connect your GitHub Account to Continue')
    expect(result?.description).toContain('code trees, manifests, and metadata')
    expect(result?.recommendation).toContain('Settings')
    expect(result?.actionLabel).toBe('Connect GitHub account')

    const combined = `${result?.title} ${result?.description} ${result?.recommendation}`
    expect(combined).not.toMatch(/\b60\b/)
    expect(combined).not.toMatch(/5[,.]?000/)
    expect(combined.toLowerCase()).not.toContain('requests/hour')
  })

  it('detects and translates bad credentials error', () => {
    const result = parseAndTranslateError('Bad credentials', 'es')
    expect(result).not.toBeNull()
    expect(result?.isBadCredentials).toBe(true)
    expect(result?.title).toBe('Sesión de GitHub Expirada o no Válida')
    expect(result?.actionLabel).toBe('Ir a Ajustes para reconectar')
  })

  it('detects and translates not found error with operational guidance', () => {
    const result = parseAndTranslateError('Not Found', 'es')
    expect(result).not.toBeNull()
    expect(result?.isNotFound).toBe(true)
    expect(result?.title).toBe('Repositorio no Encontrado o Inaccesible')
    expect(result?.recommendation).toContain('Ajustes')
    expect(result?.actionLabel).toBe('Revisar Ajustes')
  })
})
