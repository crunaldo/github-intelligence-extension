import { describe, it, expect } from 'vitest'
import { classifyFile, getFileIconDescriptor, getFileIcon } from './fileClassifier'
import React from 'react'

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

describe('getFileIconDescriptor & getFileIcon (Octotree Themes)', () => {
  it('identifies languages and assigns VS Code Material theme colors', () => {
    const python = getFileIconDescriptor('script.py', 'vscode')
    expect(python.language).toBe('python')
    expect(python.iconType).toBe('code')
    expect(python.color).toBe('#3776ab')

    const rust = getFileIconDescriptor('main.rs', 'vscode')
    expect(rust.language).toBe('rust')
    expect(rust.color).toBe('#dea584')

    const tsx = getFileIconDescriptor('Component.tsx', 'vscode')
    expect(tsx.language).toBe('typescriptreact')
    expect(tsx.color).toBe('#3178c6')

    const sql = getFileIconDescriptor('schema.sql', 'vscode')
    expect(sql.language).toBe('sql')
    expect(sql.iconType).toBe('database')

    const docker = getFileIconDescriptor('Dockerfile', 'vscode')
    expect(docker.language).toBe('docker')
  })

  it('supports Seti UI theme with Seti colors', () => {
    const python = getFileIconDescriptor('script.py', 'seti')
    expect(python.language).toBe('python')
    expect(python.color).toBe('#3572a5')

    const rust = getFileIconDescriptor('main.rs', 'seti')
    expect(rust.language).toBe('rust')
    expect(rust.color).toBe('#d36135')

    const yaml = getFileIconDescriptor('workflow.yml', 'seti')
    expect(yaml.language).toBe('yaml')
    expect(yaml.color).toBe('#8dc149')
  })

  it('supports GitHub Native theme with subtle colors', () => {
    const python = getFileIconDescriptor('script.py', 'github')
    expect(python.language).toBe('python')
    expect(python.color).toBe('#3fb950')

    const ts = getFileIconDescriptor('index.ts', 'github')
    expect(ts.language).toBe('typescript')
    expect(ts.color).toBe('#58a6ff')
  })

  it('returns valid React element from getFileIcon', () => {
    const icon = getFileIcon('app.tsx', 'vscode')
    expect(React.isValidElement(icon)).toBe(true)

    const sqlIcon = getFileIcon('db.sql', 'seti')
    expect(React.isValidElement(sqlIcon)).toBe(true)
  })
})
