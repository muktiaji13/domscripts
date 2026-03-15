# DomScript Changelog

## v3.0.0 — Rilis Utama

### Fitur Baru
- **`dsc run <file.ds>`** — compile + buka browser langsung dengan watch mode
- **`dsc dev`** — full dev mode: build + HTTP server + live reload + file watcher
- **`dsc create`** — scaffold project baru dari template (default, minimal, api)
- **`dsc serve`** — HTTP server dengan WebSocket live reload (tanpa dependency)
- **`dsc compile`** — one-shot compile dengan opsi `--tokens` dan `--ast` untuk debug
- **`dsc info`** — tampilkan info sistem, platform, Node.js version

### Bahasa
- `async func` + `await` — fungsi async penuh
- `fetch(url, opts)` — keyword khusus untuk Fetch API
- `try / catch / finally` — error handling lengkap
- `throw Error(msg)` — lempar error manual
- `switch / case / default` — percabangan multi-nilai
- Template literal `` `${expr}` `` — string interpolasi
- Array destructuring `let [a, b, ...rest] = arr`
- Object destructuring `let { nama, umur } = user`
- Spread operator `{ ...base, key: val }`
- Optional chaining `obj?.prop`
- Nullish coalescing `a ?? b`
- Exponentiation `2 ** 10`
- Hex `0xFF`, binary `0b1010`, underscore `1_000_000`
- `warn` dan `error` untuk console.warn / console.error
- `log a, b, c` — log multi-argumen

### DOM API Baru
- `setHtml` — set innerHTML
- `addClass`, `removeClass`, `toggleClass` — class manipulation
- `prepend` — insert sebelum child pertama
- `unmount` — lepas elemen dari parent
- `queryAll` — querySelectorAll → Array
- `getText`, `getAttr` — getter DOM
- `off` — removeEventListener

### Runtime
- Runtime dimuat sebagai `__ds` object (namespace)
- Semua DOM call null-safe (tidak crash jika elemen null)
- Live reload via WebSocket tanpa dependensi eksternal

### Tooling
- Cross-platform: Linux, macOS, Windows, Android Termux, WSL
- Auto-deteksi platform untuk membuka browser
- `install.js` — installer cross-platform
- `dsc.config.js` — file konfigurasi project
- Source map dasar (line mapping)
- 35 test cases otomatis

---

## v2.1.0

- Tambah `async` / `await` / `fetch`
- Tambah `try` / `catch` / `throw`
- Fix object key dengan string (misal `"Content-Type"`)

## v2.0.0

- Parser + AST + CodeGen penuh
- Bundler dengan topological sort
- IDE browser dengan token viewer dan AST viewer
- 4 contoh program (counter, todo, color palette, calculator)

## v1.0.0

- Interpreter sederhana (tanpa compile ke JS)
- 3 perintah: `print`, `add`, `var`
