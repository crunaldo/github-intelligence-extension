/**
 * Robust sanitizer for LLM-generated Mermaid diagrams.
 * Corrects common LLM syntax defects:
 * 1. Markdown code fences (```mermaid ... ```).
 * 2. Missing newlines after diagram declarations (e.g. `graph LR A[...]`).
 * 3. Malformed arrow labels with trailing `>` (e.g. `-->|Label|> B`).
 * 4. Multiple connections collapsed onto a single line without newlines or semicolons.
 * 5. Unescaped parentheses/slashes/special characters in node labels.
 */
export function sanitizeMermaidDiagram(raw: string | undefined | null): string {
  if (!raw) return ''

  let text = raw.trim()

  // 1. Strip markdown code fences ```mermaid ... ``` or ``` ... ```
  text = text.replace(/^```(?:mermaid)?\s*\n?/i, '')
  text = text.replace(/\n?```\s*$/i, '')
  text = text.trim()

  // 2. Ensure diagram type declaration is separated from diagram body by a newline
  const headerMatch = text.match(
    /^(graph\s+(?:TD|TB|BT|RL|LR)|flowchart\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram)\s*(.*)$/is
  )
  if (headerMatch) {
    const header = headerMatch[1].trim()
    const rest = headerMatch[2].trim()
    text = `${header}\n${rest}`
  } else if (!/^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/i.test(text)) {
    // If no diagram type is declared, default to `graph TD`
    text = `graph TD\n${text}`
  }

  // 3. Fix malformed arrow labels: e.g. `-->|Label|> B` -> `-->|Label| B`
  text = text.replace(/(-->|---|-.->|==>)\s*\|([^|]+)\|\s*>/g, '$1|$2| ')
  // Fix reverse or broken label arrows: e.g. `--|Label|-->` -> `-->|Label| `
  text = text.replace(/--\s*\|([^|]+)\|\s*-->/g, '-->|$1| ')
  // Ensure spacing after closing pipe of arrow label if attached directly to node ID
  text = text.replace(/(-->|---|-.->|==>)\s*\|([^|]+)\|\s*(?=[A-Za-z0-9_[])/g, '$1|$2| ')

  // 4. Split multiple connections if on the same line without newlines:
  // e.g. `B[V8] A -->|Soporta| C` -> `B[V8]\nA -->|Soporta| C`
  text = text.replace(/([\]\)])\s+([A-Za-z0-9_#$]+(?:\[[^\]\n]*\]|\([^)\n]*\))?\s*(?:-->|---|-.->|==>))/g, '$1\n$2')

  // 5. Quote unquoted node labels with special characters like (, ), /, &, :, -
  // e.g. `A[Chrome DevTools Protocol (CDP)]` -> `A["Chrome DevTools Protocol (CDP)"]`
  text = text.replace(/\[([^"\]\n]+)\]/g, (match, inner) => {
    const trimmed = inner.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return match
    }
    // If it contains parentheses, slashes, colons, ampersands, or angle brackets
    if (/[:/\\&()[\]<>{}]/.test(trimmed)) {
      const clean = trimmed.replace(/"/g, "'")
      return `["${clean}"]`
    }
    return match
  })

  // 6. Clean up line-by-line: remove empty lines and trim whitespace
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  return lines.join('\n')
}
