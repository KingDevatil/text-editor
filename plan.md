# Electron Migration Progress

Updated: 2026-06-14

## Status

- [x] Phase 0: Add renderer desktop capability abstraction.
- [x] Phase 0: Move runtime business code away from direct `@tauri-apps/*` imports.
- [x] Phase 1: Add Electron shell, preload bridge, IPC whitelist, and development/build scripts.
- [x] Phase 2: Implement Electron file read/write, encoding detection, metadata reads, rename, and atomic save.
- [x] Phase 3: Implement Electron dialogs, pending file queue, single instance handoff, shell actions, clipboard, and window controls.
- [x] Phase 4: Implement Electron directory listing, search, and file watcher services.
- [x] Phase 5: Add `electron-builder` configuration for Windows NSIS, macOS DMG, icons, and file associations.
- [x] Phase 5: Update release CI for Electron artifacts.
- [x] Phase 6: Remove Tauri code and dependencies after Electron smoke verification.
- [x] Phase 6: Update README and migration notes after final cutover.

## Completed This Pass

- Added `src/platform/desktop.ts` as the renderer-facing desktop API, with Electron support and Tauri fallback.
- Added Electron files under `electron/`:
  - `main.cjs`
  - `preload.cjs`
  - `services/file.cjs`
  - `services/directory.cjs`
  - `services/search.cjs`
  - `services/watcher.cjs`
- Replaced runtime Tauri usage in app/components/hooks/services with `desktopApi`.
- Added Electron scripts and builder metadata in `package.json`.
- Added Electron-related dependencies and updated `package-lock.json`.
- Updated `useFileWatcher` tests to mock the new platform abstraction.
- Migrated `.github/workflows/release.yml` from Tauri builds to Electron builder outputs.
- Moved icons from `src-tauri/icons` to `build/icons`.
- Removed `src-tauri/`, Tauri npm dependencies, Tauri scripts, and stale `eslint-report.json`.
- Removed Tauri fallback code from `src/platform/desktop.ts`.
- Updated `README.md` for the Electron-based project.

## Verification

- `npm run build` passed.
- `npm run test` passed: 29 files, 222 tests.
- `npm run lint` passed.
- Electron production smoke test passed: `NODE_ENV=production electron .` stayed running after 8 seconds with empty stderr.
- Electron builder smoke test passed: `npx electron-builder --win --dir` produced `release/win-unpacked`.
- Packaged Windows exe smoke test passed: `release/win-unpacked/Text Editor V2.exe` stayed running after 8 seconds with empty stderr.

## Notes / Deviations

- Tauri fallback has been removed; Electron is now the only desktop backend.
- `rg "@tauri|isTauri|data-tauri"` should only report migration documentation, not runtime code.
- Electron preload uses a fixed API surface rather than exposing arbitrary IPC.
