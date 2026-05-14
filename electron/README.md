# Electron - DEPRECATED

This application has been migrated to Tauri v2.

The Electron files are kept for reference only. All desktop functionality
now runs through the Tauri runtime.

## Migration summary:
- Electron main process → Tauri Rust backend (src-tauri/)
- Electron preload → Platform abstraction layer (frontend/services/platform.ts)
- Electron IPC → Tauri commands (invoke) with platform API bridge

## Remaining Electron-specific code (intentional):
- `electron/main.js` - Legacy Electron main process (not used)
- `electron/preload.js` - Legacy preload script (not used)
- `window.electronAPI` - Platform layer still detects Electron for backward compat
- Electron `generatePdf` worker path - Still active for Electron fallback

## To run:
- Development: `npm run tauri:dev`
- Build: `npm run tauri:build`
