# Folio PDF

A lightweight desktop PDF viewer and editor for Windows, macOS and Linux, in the spirit of
Acrobat's everyday features: view, comment, fill & sign, organize pages, combine and convert.

Built with **Tauri 2** (Rust shell, WebView2), **React + TypeScript**, **pdf.js**
(rendering, text, forms, annotation editing) and **pdf-lib** (page structure).

## Features

| Area | What you can do |
|---|---|
| View | Open (dialog, drag & drop, double-click `.pdf`, recent files), tabs, continuous scroll, zoom presets / Ctrl+wheel, fit page / width, rotate view, page thumbnails, bookmarks, find with per-page hits, text selection, print |
| Comment | Highlight (text or free-form), freehand pen, text boxes, sticky notes, images; undo / redo / delete |
| Fill & Sign | Fill AcroForm fields, add text, create a signature (draw / type / image with white knock-out) and place it as a movable, resizable stamp |
| Organize pages | Drag to reorder, multi-select, rotate, delete, extract to a new file, insert blank / PDF / images, split into files |
| Combine | Merge several PDFs into a new document |
| Export & convert | Pages → PNG/JPEG at 72/150/300 dpi, images → PDF, page numbers, watermark |
| Security | Opens password-protected PDFs; annotations and form values are saved back with the encryption intact |

Edits are written into the PDF itself when you save (Ctrl+S / Save as…). A dot on the
tab marks unsaved changes; closing a dirty tab or the window asks first.

### Layout

The shell follows current Acrobat: a custom title bar with **Menu**, **Home**, document
tabs and **Create**; a command bar with **All tools / Read / Edit / Convert / Sign**,
find, Print, Save and Fill & Sign; the **All tools** list (or the active tool's panel) on
the left; a floating quick-tool strip over the page; and a right rail with the
thumbnails / bookmarks / find panels plus page navigation and zoom. On Windows the window
chrome is drawn by the app (`decorations: false`); macOS keeps its traffic lights
(`titleBarStyle: Overlay`) and Linux keeps native decorations.

### Keyboard shortcuts

`Ctrl+O` open · `Ctrl+S` save · `Ctrl+Shift+S` save as · `Ctrl+P` print · `Ctrl+F` find ·
`Ctrl+W` close · `Ctrl++` / `Ctrl+-` zoom · `Ctrl+0` fit page · `Ctrl+1` actual size ·
`Ctrl+2` fit width · `Ctrl+Tab` next document · `Ctrl+Z` / `Ctrl+Y` undo / redo annotation ·
`Delete` remove selected annotation · `Esc` back to the select tool

### Known limitations

- Page-structure edits (reorder, rotate, delete, insert, page numbers, watermark, split,
  extract, combine) are refused for **encrypted** documents: pdf-lib cannot re-encrypt.
  Commenting and form filling still work on them.
- Pages combined or inserted from another document keep their content and widgets but
  lose interactive form-field definitions (a pdf-lib limitation).
- No OCR, redaction, digital certificate signing or Office conversion.

## Development

Prerequisites: Node 22+ and Rust. On Windows also Visual Studio Build Tools with the
C++ workload and the WebView2 runtime (bundled with Windows 11); on macOS the Xcode
Command Line Tools; on Linux the WebKitGTK 4.1 development packages (see the workflow).

```bash
npm install
npm run app:dev          # run the desktop app with hot reload
npm run typecheck        # TypeScript check
npm run build            # frontend only (dist/)
npm run app:build        # installers in src-tauri/target/release/bundle/ (nsis+msi, dmg+app, deb+rpm+appimage)
npm run sample           # regenerate dev/sample.pdf (6 pages, bookmarks, form fields)
```

### Building for macOS (and Linux)

Tauri can only produce a platform's bundle *on* that platform, so the `.dmg` has to be
built on a Mac or by CI:

- **On a Mac:** install Xcode Command Line Tools (`xcode-select --install`), Node 22+ and
  Rust (`rustup`), then `npm install && npm run app:build`. The result is
  `src-tauri/target/release/bundle/dmg/Folio PDF_0.1.0_aarch64.dmg` (or `_x64`) plus the
  `.app` in `bundle/macos/`. For a single universal binary:
  `rustup target add aarch64-apple-darwin x86_64-apple-darwin` and
  `npm run tauri build -- --target universal-apple-darwin`.
- **With GitHub Actions:** push the repository to GitHub and either run the
  *Build installers* workflow manually (Actions tab → Run workflow → download the
  `folio-pdf-macos-universal` artifact) or push a tag such as `v0.1.0`, which attaches the
  macOS, Windows and Linux installers to a draft release. See
  [.github/workflows/build.yml](.github/workflows/build.yml).

pdf.js 6 needs a recent JavaScript engine (iterator helpers, `Promise.try`); the app
polyfills these ([src/polyfills.ts](src/polyfills.ts)) so the macOS web view, which uses the
system WebKit, also works on older Safari versions. If the window ever comes up empty, a
red box at the bottom prints the startup error (see `index.html`).

The macOS app is **unsigned** unless you add the `APPLE_*` secrets used by the workflow.
Gatekeeper then blocks the first launch: right-click the app → *Open*, or run
`xattr -cr "/Applications/Folio PDF.app"`. The app targets macOS 13 or newer (WebKit
recent enough for pdf.js). Shortcuts use ⌘ on macOS; files opened from Finder arrive
through the `open-files` event; ⌘Q goes through the unsaved-changes guard.

`npm run app:dev:debug` starts the app under its own identifier (`com.folio.pdf.dev`, so it
can run next to an installed copy) with WebView2 remote debugging on port 9223
(`http://127.0.0.1:9223/json`), which is handy for driving the UI from scripts or the
Chromium DevTools. In development the app also exposes `window.__folio`
(`actions`, `viewers`, `store`, `pdfops`, `files`).

`dev/inspect-annotations.mjs <file.pdf>` and `dev/inspect-pdfjs.mjs <file.pdf> [password]`
list what a saved file contains.

### Layout

```
src/
  app/actions.ts      open / save / print / export and the commit→transform→reload pipeline
  app/viewers.ts      registry of live pdf.js viewers, zoom/navigation/editor-mode helpers
  lib/pdfjs.ts        pdf.js bootstrap (worker, static assets, password handling)
  lib/pdfops.ts       pdf-lib operations (reorder, rotate, merge, insert, numbers, watermark…)
  lib/tauri.ts        dialogs, file system, drag & drop, launch arguments
  components/         title bar (TopBar, AppMenu), CommandBar, QuickTools, RightRail, viewer, home, dialogs
  panels/             tool panels (ToolPanel host + All tools list) and navigation panels (pages, bookmarks, find)
  store.ts            zustand state (tabs, panels, tool, theme, recent files, modals)
src-tauri/            Rust side: plugins (dialog, fs, single-instance), file association
```

### Styling note

pdf.js lays out pages, text/annotation layers and editors with the browser's default
`box-sizing: content-box` and puts a page's 9 px border *outside* the page size. The app's
`border-box` reset therefore excludes the `.pdfViewer` subtree — applying it there shrinks
every layer by 18 px and makes pointer input land beside the cursor.

### How editing works

pdf.js owns annotations and form values while a document is open. Any structural
operation first "commits" those edits (`pdf.saveDocument()`), runs a pdf-lib
transformation on the resulting bytes and reloads the viewer at the same page. Saving
does the same commit and writes the bytes to disk.
