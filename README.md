# DomScript v3

Bahasa pemrograman frontend yang dikompilasi ke JavaScript.
Tulis `.ds`, jalankan di browser — di mana saja.

```
dsc run src/app.ds        # compile + buka browser langsung
dsc create my-app         # buat project baru
dsc dev                   # dev server + live reload + watch
dsc build --minify        # build untuk production
```

---

## Install

### Linux / macOS / WSL

```bash
# Clone atau ekstrak domscript-v3/
cd domscript-v3
node install.js
```

### Android (Termux)

```bash
pkg install nodejs
cd domscript-v3
node install.js
```

### Windows

```cmd
cd domscript-v3
node install.js
```

### Tanpa install (langsung pakai)

```bash
node /path/to/domscript-v3/bin/dsc.js --help
```

### Alias manual (`.bashrc` / `.zshrc`)

```bash
alias dsc="node /path/to/domscript-v3/bin/dsc.js"
```

---

## Quick Start

```bash
# 1. Buat project
dsc create my-app
cd my-app

# 2. Jalankan dev mode (build + server + watch)
dsc dev

# 3. Buka http://localhost:3000
```

---

## Commands

| Command | Fungsi |
|---------|--------|
| `dsc run <file.ds>` | Compile + buka browser + watch |
| `dsc dev` | Build + serve + auto watch (full dev mode) |
| `dsc build` | Compile project ke JS |
| `dsc serve [dir]` | HTTP server + live reload |
| `dsc create <nama>` | Scaffold project baru |
| `dsc compile <file>` | One-shot compile ke stdout |
| `dsc info` | Info sistem & compiler |

### Options

```
-o, --output <file>     Output file
-b, --bundle            Bundle semua import
-m, --minify            Minify output
-p, --port <n>          Port server (default: 3000)
-n, --no-open           Jangan buka browser otomatis
--module <type>         Format: iife (default), cjs, none
--template <t>          Template: default, minimal, api
--tokens                Debug: print token stream (JSON)
--ast                   Debug: print AST (JSON)
```

---

## Syntax

### Variabel

```ds
let nama    = "Budi"
const PI    = 3.14159
let aktif   = true
let kosong  = null
let hex     = 0xFF      // 255
let bin     = 0b1010    // 10
```

### Template Literal

```ds
let salam = `Halo, ${nama}!`
log `Nilai PI: ${PI}`
```

### Fungsi

```ds
func tambah(a, b) {
  return a + b
}

// Arrow function
const kuadrat = (n) => n * n
const greet   = (nama) => `Halo, ${nama}!`
```

### Async / Fetch

```ds
async func getData(url) {
  try {
    let res  = await fetch(url)
    let data = await res.json()
    return data
  } catch (e) {
    log "Error:", e.message
    return null
  }
}

async func kirim(payload) {
  let res = await fetch("https://api.example.com/posts", {
    "method":  "POST",
    "headers": { "Content-Type": "application/json" },
    "body":    JSON.stringify(payload)
  })
  return await res.json()
}
```

### Control Flow

```ds
// If / else if / else
if (x > 0) {
  log "positif"
} else if (x < 0) {
  log "negatif"
} else {
  log "nol"
}

// While
while (i < 10) {
  i = i + 1
}

// For biasa
for (let i = 0; i < 10; i++) {
  log i
}

// For-of (array)
for (const item of items) {
  log item
}

// Switch
switch (hari) {
  case 1: log "Senin"
  case 2: log "Selasa"
  default: log "Hari lain"
}
```

### Error Handling

```ds
try {
  let data = await getData(url)
  if (!data) {
    throw Error("Data kosong")
  }
  log data
} catch (e) {
  log "Gagal:", e.message
} finally {
  log "Selesai"
}
```

### Array & Destructuring

```ds
let angka = [1, 2, 3, 4, 5]
let [a, b, ...rest] = angka

angka.push(6)
let panjang = angka.length
let dua_kali = angka.map((n) => n * 2)
let genap    = angka.filter((n) => n % 2 == 0)
```

### Object & Destructuring

```ds
let user = { nama: "Siti", umur: 25 }
let { nama, umur } = user

// Spread
let base   = { debug: false, port: 3000 }
let config = { ...base, port: 8080 }
```

### Import / Export

```ds
// utils.ds
export func formatUang(n) {
  return "Rp " + n.toLocaleString("id-ID")
}

export const VERSION = "3.0.0"

// main.ds
import { formatUang, VERSION } from "./utils"

log formatUang(150000)  // Rp 150.000
```

---

## Perintah DOM

| Perintah | Sintaks | Fungsi |
|----------|---------|--------|
| `create` | `create "div" as el` | Buat elemen HTML |
| `setText` | `setText el, "teks"` | Set teks konten |
| `setHtml` | `setHtml el, "<b>bold</b>"` | Set innerHTML |
| `setStyle` | `setStyle el, "color", "red"` | Set CSS style |
| `setAttr` | `setAttr el, "id", "main"` | Set atribut HTML |
| `addClass` | `addClass el, "aktif"` | Tambah CSS class |
| `removeClass` | `removeClass el, "hidden"` | Hapus CSS class |
| `toggleClass` | `toggleClass el, "aktif"` | Toggle CSS class |
| `append` | `append anak to induk` | Tambah child element |
| `prepend` | `prepend anak to induk` | Prepend child element |
| `remove` | `remove el` | Hapus elemen dari DOM |
| `on` | `on el, "click", handler` | Pasang event listener |
| `off` | `off el, "click", handler` | Lepas event listener |
| `mount` | `mount el to "#app"` | Mount ke container |
| `unmount` | `unmount el` | Unmount dari parent |
| `query` | `query "#id" as el` | Cari satu elemen |
| `queryAll` | `queryAll ".cls" as list` | Cari semua elemen |
| `getText` | `getText(el)` | Ambil teks konten |
| `getAttr` | `getAttr(el, "href")` | Ambil nilai atribut |

---

## Contoh Lengkap

### Counter

```ds
// src/main.ds
let count = 0

create "div" as app
setStyle app, "text-align",  "center"
setStyle app, "padding",     "40px"
setStyle app, "font-family", "sans-serif"

create "h1" as display
setText  display, "0"
setStyle display, "font-size",   "80px"
setStyle display, "color",       "#3b82f6"
setStyle display, "font-weight", "300"
append display to app

create "div" as row
setStyle row, "display",         "flex"
setStyle row, "gap",             "12px"
setStyle row, "justify-content", "center"
setStyle row, "margin-top",      "24px"

create "button" as btnMin
create "button" as btnRst
create "button" as btnPlus

setText btnMin, "−"
setText btnRst, "↺"
setText btnPlus, "+"

for (const btn of [btnMin, btnRst, btnPlus]) {
  setStyle btn, "font-size",    "28px"
  setStyle btn, "padding",      "12px 28px"
  setStyle btn, "border",       "2px solid #e2e8f0"
  setStyle btn, "border-radius","8px"
  setStyle btn, "background",   "white"
  setStyle btn, "cursor",       "pointer"
}

append btnMin  to row
append btnRst  to row
append btnPlus to row
append row     to app

func refresh() {
  setText display, count
  setStyle display, "color", count > 0 ? "#22c55e" : count < 0 ? "#ef4444" : "#3b82f6"
}

on btnPlus, "click", (e) => { count++; refresh() }
on btnMin,  "click", (e) => { count--; refresh() }
on btnRst,  "click", (e) => { count = 0; refresh() }

mount app to "#app"
```

---

## Konfigurasi Project

File `dsc.config.js` di root project:

```js
module.exports = {
  entry:  "src/main.ds",    // file entry point
  output: "dist/bundle.js", // output JS
  serve:  "dist",           // folder untuk dev server
  port:   3000,             // port server
  bundle: true,             // bundle semua import
  minify: false,            // minify output
};
```

---

## Struktur Project

```
my-app/
├── src/
│   ├── main.ds        ← entry point
│   ├── app.ds         ← komponen utama
│   └── utils.ds       ← fungsi pembantu
├── dist/
│   ├── index.html     ← HTML host
│   ├── style.css      ← stylesheet
│   └── bundle.js      ← output (auto-generated)
├── dsc.config.js      ← konfigurasi
└── package.json
```

---

## Templates

| Template | Isi |
|----------|-----|
| `default` | Counter button + multi-module |
| `minimal` | Satu file, langsung jalan |
| `api` | Fetch + DOM render |

```bash
dsc create my-app --template default
dsc create my-api --template api
dsc create simple --template minimal
```

---

## Sebagai Library Node.js

```js
const { compile, bundle, parse, tokenize } = require("./domscript-v3/src/index");

// Compile string
const js = compile(`
  create "h1" as h
  setText h, "Hello!"
  mount h to "#app"
`, { module: "iife" });

// Bundle dari file
const bundled = bundle("./src/main.ds", { minify: true });

// Parse ke AST
const ast = parse(`let x = 42`);
console.log(ast.body[0]); // { k: "VarDecl", name: "x", ... }
```

---

## Platform Support

| Platform | Status | Catatan |
|----------|--------|---------|
| Linux | ✅ | Semua distro |
| macOS | ✅ | Intel & Apple Silicon |
| Windows | ✅ | CMD, PowerShell, Git Bash |
| Android (Termux) | ✅ | `pkg install nodejs` |
| WSL | ✅ | Windows Subsystem for Linux |

**Requirement:** Node.js ≥ 14, tanpa npm install apapun (zero dependency).

---

## Lisensi

MIT
