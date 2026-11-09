import { describe, it, expect } from 'vitest'
import { parseAndTranslateError } from './ApiErrorCard'

describe('ApiErrorCard - parseAndTranslateError', () => {
  const userRateLimitError =
    "Error: API rate limit exceeded for 38.253.147.40. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)"

  it('detects and translates GitHub rate limit error to Spanish', () => {
    const result = parseAndTranslateError(userRateLimitError, 'es')
    expect(result).not.toBeNull()
    expect(result?.isRateLimit).toBe(true)
    expect(result?.title).toBe('Límite de Solicitudes de GitHub Excedido')
    expect(result?.description).toContain('60 peticiones/hora')
    expect(result?.recommendation).toContain('GitHub Personal Access Token')
    expect(result?.recommendation).toContain('5,000 peticiones/hora')
    expect(result?.actionLabel).toBe('Ir a Ajustes para añadir Token')
  })

  it('detects and translates GitHub rate limit error to English', () => {
    const result = parseAndTranslateError(userRateLimitError, 'en')
    expect(result).not.toBeNull()
    expect(result?.isRateLimit).toBe(true)
    expect(result?.title).toBe('GitHub API Rate Limit Exceeded')
    expect(result?.description).toContain('60 requests/hour')
    expect(result?.recommendation).toContain('5,000 requests/hour')
    expect(result?.actionLabel).toBe('Go to Settings to add Token')
  })

  it('detects and translates bad credentials error', () => {
    const result = parseAndTranslateError('Bad credentials', 'es')
    expect(result).not.toBeNull()
    expect(result?.isBadCredentials).toBe(true)
    expect(result?.title).toBe('Token de GitHub no Válido o Expirado')
    expect(result?.actionLabel).toBe('Ir a Ajustes para actualizar Token')
  })

  it('detects and translates not found error', () => {
    const result = parseAndTranslateError('Not Found', 'es')
    expect(result).not.toBeNull()
    expect(result?.isNotFound).toBe(true)
    expect(result?.title).toBe('Repositorio no Encontrado o Privado')
    expect(result?.actionLabel).toBe('Configurar Token en Ajustes')
  })
})
