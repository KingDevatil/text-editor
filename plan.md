# Electron Migration Progress

Updated: 2026-06-14

## Status

- [x] Phase 0: Add renderer desktop capability abstraction.
- [x] Phase 0: Move runtime business code away from direct `@tauri-apps/*` imports.
- [x] Phase 1: Add Electron shell, preload bridge, IPC whitelist, and development/build scripts.
- [x] Phase 2: Implement Electron file read/write, encoding detection, metadata reads, rename, and atomic save.
- [x] Phase 3: Implement Electron dialogs, pending file queue, single instance handoff, shell actions, clipboard, and window controls.
- [x] Phase 4: Implement Electron directory listing, search, and file watcher services.
- [~] Phase 5: Add `electron-builder` configuration for Windows NSIS, macOS DMG, icons, and file associations.
- [ ] Phase 5: Update release CI for Electron artifacts.
- [ ] Phase 6: Remove Tauri code and dependencies after Electron parity is manually verified.
- [ ] Phase 6: Update README, user guide, and release notes after final cutover.

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

## Verification

- `npm run build` passed.
- `npm run test` passed: 29 files, 222 tests.

## Notes / Deviations

- Tauri code and dependencies are intentionally retained as fallback and behavior reference, per the migration plan.
- `rg "@tauri|isTauri|invoke\\(|data-tauri" src -n` now reports only `src/platform/desktop.ts` and legacy test mocks, not runtime business code.
- Electron binary download hung in this environment during `npm install`; dependencies and lockfile were updated with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. Because of that, Electron window launch was not manually verified in this pass.
- Electron preload uses a fixed API surface rather than exposing arbitrary IPC.
