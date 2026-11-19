import { describe, it, expect } from 'vitest'
import { classifyFile } from './fileClassifier'

describe('classifyFile', () => {
  it('classifies entrypoint files accurately', () => {
    expect(classifyFile('src/index.ts').category).toBe('entrypoint')
    expect(classifyFile('src/main.py').category).toBe('entrypoint')
    expect(classifyFile('app/App.tsx').category).toBe('entrypoint')
    expect(classifyFile('server.js').category).toBe('entrypoint')
    expect(classifyFile('src/index.ts').isCritical).toBe(true)
  })

  it('classifies configuration and build files', () => {
    expect(classifyFile('package.json').category).toBe('config')
    expect(classifyFile('tsconfig.json').category).toBe('config')
    expect(classifyFile('Dockerfile').category).toBe('config')
    expect(classifyFile('vite.config.ts').category).toBe('config')
  })

  it('classifies test files', () => {
    expect(classifyFile('src/utils.test.ts').category).toBe('test')
    expect(classifyFile('tests/app.spec.js').category).toBe('test')
    expect(classifyFile('tests/test_main.py').category).toBe('test')
  })

  it('classifies security sensitive and vulnerable manifests', () => {
    expect(classifyFile('.env.example').category).toBe('security')
    expect(classifyFile('src/auth/jwt.ts').category).toBe('security')
    
    // Manifest marked as vulnerable in audit
    const vulnerable = classifyFile('package.json', ['package.json'])
    expect(vulnerable.category).toBe('security')
    expect(vulnerable.isCritical).toBe(true)
    expect(vulnerable.label).toContain('Vulnerable')
  })

  it('classifies styles and documentation', () => {
    expect(classifyFile('src/styles/main.css').category).toBe('style')
    expect(classifyFile('README.md').category).toBe('doc')
    expect(classifyFile('unknown-binary.bin').category).toBe('general')
  })
})
