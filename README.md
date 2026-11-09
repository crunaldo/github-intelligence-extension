# 🚀 GitHub Project Intelligence Assistant — Chrome Extension (v2.0 WXT)

Extensión de navegador para Google Chrome y navegadores Chromium (Manifest V3) migrada al framework de nueva generación **[WXT](https://wxt.dev/)**. Analiza repositorios de GitHub en tiempo real, generando diagramas interactivos de arquitectura (Mermaid), auditorías de seguridad & CVEs, auditoría de licencias y uso comercial, métricas de salud y atajos de 1-clic para clonar o probar en la nube (StackBlitz, Codespaces, VS Code, Cursor).

---

## 🌟 Características Principales

- **Desarrollado con WXT:** Servidor de desarrollo con Hot Module Replacement (HMR) instantáneo, compilación multi-navegador y gestión automática del manifiesto.
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

## 🛠️ Comandos Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo de WXT con recarga en vivo (HMR) para Chrome |
| `npm run build` | Compila la extensión en `.output/chrome-mv3` lista para cargar en Chrome |
| `npm run zip` | Compila y empaqueta la extensión en un archivo `.zip` en `.output/` |
| `npm run dev:firefox` | Inicia el servidor de desarrollo apuntando a Firefox |
| `npm run build:firefox` | Compila la versión para Firefox en `.output/firefox-mv2` |
| `npm run test` | Ejecuta la suite de pruebas unitarias con Vitest |

---

## 🔌 Cómo Cargar la Extensión en Google Chrome

1. Compila la extensión ejecutando:
   ```bash
   npm run build
   ```
2. Abre Google Chrome y ve a `chrome://extensions/`.
3. Activa el **Modo de desarrollador** (esquina superior derecha).
4. Haz clic en **Cargar descomprimida** (Load unpacked).
5. Selecciona la carpeta `.output/chrome-mv3` generada dentro del proyecto.
6. ¡Listo! La extensión v2.0 estará activa y funcional.

---

## 📂 Estructura del Proyecto (WXT)

```text
github-intelligence-extension/
├── wxt.config.ts              # Configuración principal de WXT y manifiesto MV3
├── tsconfig.json              # Extiende la configuración tipada generada por WXT (.wxt/)
├── package.json               # Dependencias y scripts WXT
├── entrypoints/               # Puntos de entrada automáticos de WXT
│   ├── background.ts          # Service worker en segundo plano (defineBackground)
│   ├── content.ts             # Content script inyectado en github.com (defineContentScript)
│   ├── popup/                 # Interfaz del Popup (index.html + main.tsx)
│   └── sidepanel/             # Interfaz del Sidepanel (index.html + main.tsx)
├── public/                    # Archivos estáticos e iconos copiados automáticamente
│   └── icons/                 # Iconos oficiales, custom y mascotas
├── src/                       # Código fuente reutilizable
│   ├── components/            # Componentes React de UI (Modales, Badges, etc.)
│   ├── features/repository/   # Motor de inteligencia de repositorios de GitHub
│   ├── extension.css          # Estilos globales de la interfaz
│   ├── storage.ts             # Almacenamiento sincronizado de preferencias y caché
│   └── i18n.ts                # Sistema de traducción bilingüe (ES / EN)
└── .output/                   # Salida de compilación (.output/chrome-mv3 y archivos .zip)
```

---

## 📦 Respaldos

- **Respaldo de la Versión 1.0 (Vite clásico):**
  - Carpeta física: `../github-intelligence-extension-v1.0-backup`
  - Git Tag: `v1.0.0`
  - Archivo comprimido: `C:\Users\moder\Downloads\github-intelligence-extension-v1.0.zip`

---

## 📜 Licencia

MIT License.
