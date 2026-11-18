import { describe, it, expect } from 'vitest'
import { sanitizeMermaidDiagram } from './mermaidSanitizer'

describe('sanitizeMermaidDiagram', () => {
  it('handles the user error case with markdown fences, collapsed single line, and invalid arrow labels', () => {
    const raw = '```mermaid\ngraph LR A[Obscura] -->|Utiliza|> B[V8] A -->|Soporta|> C[Chrome DevTools Protocol] A -->|Compatibilidad con|> D[Puppeteer] A -->|Compatibilidad con|> E[Playwright] B -->|Ejecuta|> F[JavaScript] C -->|Permite|> G[Control]\n```'
    const sanitized = sanitizeMermaidDiagram(raw)

    expect(sanitized).not.toContain('```')
    expect(sanitized).not.toContain('|Utiliza|>')
    expect(sanitized).toContain('-->|Utiliza| B[V8]')
    expect(sanitized).toContain('A -->|Soporta| C[Chrome DevTools Protocol]')
    expect(sanitized.startsWith('graph LR\n')).toBe(true)
  })

  it('quotes node labels containing parentheses and slashes', () => {
    const raw = 'graph TD\nA[Node (v18.0)] --> B[HTTP / HTTPS] --> C[API & DB]'
    const sanitized = sanitizeMermaidDiagram(raw)

    expect(sanitized).toContain('A["Node (v18.0)"]')
    expect(sanitized).toContain('B["HTTP / HTTPS"]')
    expect(sanitized).toContain('C["API & DB"]')
  })

  it('prepends graph TD if no header is present in raw string', () => {
    const raw = 'A --> B\nB --> C'
    const sanitized = sanitizeMermaidDiagram(raw)

    expect(sanitized.startsWith('graph TD\n')).toBe(true)
    expect(sanitized).toContain('A --> B')
  })

  it('handles empty or null input gracefully', () => {
    expect(sanitizeMermaidDiagram('')).toBe('')
    expect(sanitizeMermaidDiagram(null)).toBe('')
    expect(sanitizeMermaidDiagram(undefined)).toBe('')
  })
})
