# 🚀 GitHub Project Intelligence Assistant — Chrome Extension

Extensión de navegador para Google Chrome / navegadores Chromium (Manifest V3) que analiza repositorios de GitHub en tiempo real, generando diagramas interactivos de arquitectura (Mermaid), auditorías de seguridad & CVEs, auditoría de licencias y uso comercial, métricas de salud y atajos de 1-clic para clonar o probar en la nube (StackBlitz, Codespaces, VS Code, Cursor).

---

## 🌟 Características Principales

- **Sidepanel & Popup Integrados:** Funciona tanto en ventana emergente (Popup) como en el panel lateral nativo de Chrome (`chrome.sidePanel`).
- **Detección Automática de Repositorios:** Identifica el repositorio actual al navegar en GitHub y ofrece análisis con un solo clic.
- **Diagrama de Arquitectura Interactivo:** Visualiza componentes, dependencias y flujos del proyecto mediante diagramas Mermaid renderizados en el navegador.
- **Auditoría de Licencia & Uso Comercial:**
  - Píldora interactiva con veredicto en tiempo real (`Comercial 100% Permitido`, `Copyleft Recíproco`, `Copyleft de Red AGPL`, etc.).
  - Ventana modal con explicación legal de permisos, condiciones y limitaciones.
- **Auditoría de Seguridad & CVEs:** Consulta en tiempo real la base de datos de vulnerabilidades OSV.dev.
- **Comando de Instalación en 1-Clic:** Detecta automáticamente el ecosistema (`npm`, `pnpm`, `yarn`, `bun`, `pip`, `uv`, `poetry`, `cargo`, `go`, etc.) para copiar el comando de instalación al portapapeles.
- **Apertura y Sandbox en la Nube:** Atajos de 1 clic para abrir en **VS Code**, **Cursor**, **StackBlitz** o **GitHub Codespaces**.
- **Gestión Inteligente de Rate Limits:** Traduce errores de límite de solicitudes de GitHub y proporciona acceso directo a los Ajustes para configurar un Personal Access Token.

---

## 🛠️ Instalación y Desarrollo

### Requisitos Previos
- Node.js 18+ y npm

### Pasos de Instalación

1. Clona o abre esta carpeta:
   ```bash
   cd github-intelligence-extension
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Compila la extensión:
   ```bash
   npm run build
   ```

4. O compila y empaqueta en archivo ZIP:
   ```bash
   npm run pack
   ```

---

## 🔌 Cómo Cargar la Extensión en Google Chrome

1. Abre Google Chrome y ve a `chrome://extensions/`.
2. Activa el **Modo de desarrollador** (interruptor superior derecho).
3. Haz clic en **Cargar descomprimida** (Load unpacked).
4. Selecciona la carpeta `dist/` generada por `npm run build`.
5. ¡Listo! La extensión ya estará activa en tu navegador.

---

## 📂 Estructura del Proyecto

```
github-intelligence-extension/
├── package.json               # Configuración y scripts npm
├── vite.config.ts             # Configuración de compilación Vite para Manifest V3
├── tsconfig.json              # Configuración TypeScript
├── dist/                      # Carpeta compilada lista para cargar en Chrome
├── src/
│   ├── extension/             # Código de la extensión Chrome
│   │   ├── manifest.json      # Manifiesto V3 de la extensión
│   │   ├── background.ts      # Service worker en segundo plano
│   │   ├── content.ts         # Content script inyectado en github.com
│   │   ├── popup/             # Interfaz del Popup
│   │   ├── sidepanel/         # Interfaz del Sidepanel
│   │   ├── components/        # Componentes UI reutilizables
│   │   └── icons/             # Iconos de la extensión
│   └── features/
│       └── repository/        # Motor de análisis de repositorios de GitHub
```

---

## 📜 Licencia

MIT License.
