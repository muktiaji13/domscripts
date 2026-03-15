#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
// DomScript CLI v3  —  bin/dsc.js
//
// Commands:
//   dsc run <file.ds>           — compile + open in browser (default)
//   dsc build [entry]           — compile to JS
//   dsc serve [dir]             — serve with live reload
//   dsc dev                     — build + serve + watch (full dev mode)
//   dsc create <name> [--template <t>]  — scaffold new project
//   dsc compile <file> [opts]   — one-shot compile to stdout or file
//   dsc info                    — show compiler info
//   dsc --help / -h             — help
//   dsc --version / -v          — version
// ─────────────────────────────────────────────────────────────────
"use strict";

const fs       = require("fs");
const path     = require("path");
const os       = require("os");
const { execSync, spawn, exec } = require("child_process");

// ── Resolve src directory relative to this bin ────────────────────
const BIN_DIR = __dirname;
const SRC_DIR = path.join(BIN_DIR, "..", "src");
const TPL_DIR = path.join(BIN_DIR, "..", "templates");

const { Lexer }   = require(path.join(SRC_DIR, "lexer"));
const { Parser }  = require(path.join(SRC_DIR, "parser"));
const { CodeGen } = require(path.join(SRC_DIR, "codegen"));
const { Bundler } = require(path.join(SRC_DIR, "bundler"));

const VERSION = "3.0.0";

// ── ANSI colours (auto-disable on Windows without terminal) ──────
const isCI   = process.env.CI || process.env.NO_COLOR;
const isTTY  = process.stdout.isTTY && !isCI;
const C = {
  reset: isTTY?"\x1b[0m":"",  bold:  isTTY?"\x1b[1m":"",
  dim:   isTTY?"\x1b[2m":"",  red:   isTTY?"\x1b[31m":"",
  green: isTTY?"\x1b[32m":"", yellow:isTTY?"\x1b[33m":"",
  blue:  isTTY?"\x1b[34m":"", cyan:  isTTY?"\x1b[36m":"",
  white: isTTY?"\x1b[37m":"", gray:  isTTY?"\x1b[90m":"",
  orange:isTTY?"\x1b[38;5;208m":"",
};
const p  = (c, s) => `${c}${s}${C.reset}`;
const ok  = msg => console.log(p(C.green,  "  ✔ ") + msg);
const inf = msg => console.log(p(C.cyan,   "  ℹ ") + msg);
const wrn = msg => console.warn(p(C.yellow,"  ⚠ ") + msg);
const err = msg => console.error(p(C.red,  "  ✖ ") + msg);
const die = msg => { err(msg); process.exit(1); };

// ── Utilities ─────────────────────────────────────────────────────
const fmt = bytes => bytes < 1024 ? bytes + "B" : (bytes/1024).toFixed(1) + "KB";
const ms  = t0 => (Date.now()-t0) + "ms";
const ensureDir = d => { if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); };

function loadConfig(dir=".") {
  const cfgPath = path.resolve(dir, "dsc.config.js");
  if(fs.existsSync(cfgPath)) {
    try { return require(cfgPath); }
    catch(e) { wrn("dsc.config.js error: " + e.message); }
  }
  return {};
}

// ── Compile a single .ds file ──────────────────────────────────────
function compileFile(inputPath, opts={}) {
  const src = fs.readFileSync(inputPath, "utf8");
  const t0  = Date.now();
  const toks = new Lexer(src, inputPath).tokenize();
  const ast  = new Parser(toks, inputPath).parse();
  const gen  = new CodeGen({ module: opts.module||"iife", injectRuntime: opts.runtime!==false, minify: opts.minify||false });
  const js   = gen.generate(ast);
  return { js, tokens: toks.length, time: Date.now()-t0 };
}

// ── Bundle an entry .ds + all imports ─────────────────────────────
function bundleFiles(entryPath, opts={}) {
  const t0 = Date.now();
  const bundler = new Bundler({
    minify:  opts.minify || false,
    module:  opts.module || "iife",
    banner:  opts.banner || `// Built by DomScript v${VERSION} — ${new Date().toISOString()}\n`,
  });
  const js = bundler.bundle(entryPath);
  return { js, modules: bundler.modules.size, time: Date.now()-t0 };
}

// ── Write output file ──────────────────────────────────────────────
function writeOutput(js, outputPath) {
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, js, "utf8");
  return Buffer.byteLength(js, "utf8");
}

// ── Open browser cross-platform ───────────────────────────────────
function openBrowser(url) {
  const platform = process.platform;
  const isAndroid = process.env.ANDROID_DATA || process.env.TERMUX_VERSION ||
                    fs.existsSync("/data/data/com.termux");
  try {
    if(isAndroid) {
      // Termux: use termux-open-url or xdg-open
      try { execSync(`termux-open-url ${url}`, {stdio:"ignore"}); return; } catch {}
      try { execSync(`xdg-open ${url}`,        {stdio:"ignore"}); return; } catch {}
      inf(`Buka di browser: ${p(C.cyan, url)}`);
    } else if(platform === "darwin") {
      execSync(`open "${url}"`, {stdio:"ignore"});
    } else if(platform === "win32") {
      execSync(`start "" "${url}"`, {stdio:"ignore",shell:true});
    } else {
      // Linux: try multiple openers
      const openers = ["xdg-open","sensible-browser","x-www-browser","gnome-open"];
      for(const opener of openers) {
        try { execSync(`${opener} "${url}"`, {stdio:"ignore"}); return; } catch {}
      }
      inf(`Buka di browser: ${p(C.cyan, url)}`);
    }
  } catch {
    inf(`Buka di browser: ${p(C.cyan, url)}`);
  }
}

// ── Watch files for changes ────────────────────────────────────────
function watchDir(dir, extensions, callback) {
  const watchers = [];
  function watchPath(p) {
    if(!fs.existsSync(p)) return;
    const stat = fs.statSync(p);
    if(stat.isDirectory()) {
      try {
        const w = fs.watch(p, {recursive:false}, (ev, fname) => {
          if(!fname) return;
          const ext = path.extname(fname).toLowerCase();
          if(extensions.includes(ext)) callback(path.join(p, fname));
        });
        watchers.push(w);
        // Also watch subdirs
        for(const entry of fs.readdirSync(p)) {
          const full = path.join(p, entry);
          if(fs.statSync(full).isDirectory()) watchPath(full);
        }
      } catch {}
    }
  }
  watchPath(dir);
  return { close: () => watchers.forEach(w => { try{w.close()}catch{} }) };
}

// ── Commands ──────────────────────────────────────────────────────

// dsc run <file.ds> — compile to temp file + serve + open browser
async function cmdRun(args) {
  const inputPath = args[0];
  if(!inputPath) die("Usage: dsc run <file.ds>");
  if(!fs.existsSync(inputPath)) die(`File not found: ${inputPath}`);

  const absInput  = path.resolve(inputPath);
  const baseName  = path.basename(inputPath, path.extname(inputPath));
  const tmpDir    = path.join(os.tmpdir(), `dsc-run-${Date.now()}`);
  const outJS     = path.join(tmpDir, "bundle.js");
  const outHTML   = path.join(tmpDir, "index.html");

  ensureDir(tmpDir);

  console.log(`\n${p(C.bold+C.orange,"  DomScript")} ${p(C.gray,"v"+VERSION)}\n`);
  inf(`Menjalankan ${p(C.white, inputPath)}`);

  // Initial build
  function build() {
    try {
      const result = compileFile(absInput, {bundle:false});
      writeOutput(result.js, outJS);
      return result;
    } catch(e) {
      err(e.message);
      return null;
    }
  }

  // Create HTML wrapper
  const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${baseName}</title>
  <style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}</style>
</head>
<body>
  <div id="app"></div>
  <script src="bundle.js"></script>
</body>
</html>`;
  fs.writeFileSync(outHTML, htmlContent, "utf8");

  const r = build();
  if(r) ok(`Dikompilasi — ${r.tokens} token, ${ms(Date.now()-r.time-r.time)}`);

  // Start server
  const cfg = loadConfig(path.dirname(absInput));
  const port = cfg.port || 3000;
  const { createServer } = require(path.join(SRC_DIR, "server"));
  const srv = createServer({ root:tmpDir, port });

  srv.start((p2) => {
    const url = `http://localhost:${p2}`;
    ok(`Server berjalan: ${p(C.cyan, url)}`);
    ok(`Direktori temp: ${p(C.gray, tmpDir)}`);
    openBrowser(url);
    inf(`Watch mode aktif — tekan ${p(C.white,"Ctrl+C")} untuk berhenti\n`);

    // Watch for changes
    const watcher = fs.watch(absInput, () => {
      process.stdout.write(p(C.gray, `\r  ↻ ${path.basename(absInput)} berubah — rebuild...`));
      const r2 = build();
      if(r2) {
        process.stdout.write(`\r${p(C.green,"  ✔")} Rebuild selesai — ${r2.tokens} token        \n`);
        srv.reload();
      }
    });

    process.on("SIGINT", () => {
      watcher.close();
      srv.httpServer.close();
      // Cleanup temp
      try { fs.rmSync(tmpDir, {recursive:true,force:true}); } catch {}
      console.log(p(C.gray, "\n  Berhenti."));
      process.exit(0);
    });
  });
}

// dsc build — compile project
function cmdBuild(args, flags) {
  const cfg    = loadConfig();
  const entry  = args[0] || cfg.entry  || "src/main.ds";
  const output = flags.output || flags.o || cfg.output || "dist/bundle.js";
  const minify = flags.minify || flags.m || cfg.minify || false;
  const useBundle = flags.bundle || flags.b || cfg.bundle || fs.existsSync(entry);

  if(!fs.existsSync(entry)) die(`Entry tidak ditemukan: ${entry}`);

  console.log(`\n${p(C.bold+C.orange,"  DomScript")} ${p(C.gray,"v"+VERSION)} — Build\n`);
  inf(`Entry:  ${p(C.white, entry)}`);
  inf(`Output: ${p(C.white, output)}`);
  if(minify) inf("Mode: minified");

  const t0 = Date.now();
  try {
    let result;
    if(useBundle) {
      result = bundleFiles(path.resolve(entry), {minify, module:flags.module||"iife"});
      const size = writeOutput(result.js, path.resolve(output));
      ok(`Bundle ${p(C.white, result.modules + " modul")} → ${p(C.white, output)} (${fmt(size)}, ${ms(t0)})`);
    } else {
      result = compileFile(path.resolve(entry), {minify, module:flags.module||"iife"});
      const size = writeOutput(result.js, path.resolve(output));
      ok(`Kompilasi → ${p(C.white, output)} (${fmt(size)}, ${result.tokens} token, ${ms(t0)})`);
    }
    if(minify) {
      const minPath = output.replace(/\.js$/, ".min.js");
      const r2 = bundleFiles(path.resolve(entry), {minify:true, module:flags.module||"iife"});
      const sz = writeOutput(r2.js, path.resolve(minPath));
      ok(`Minified → ${p(C.white, minPath)} (${fmt(sz)})`);
    }
  } catch(e) {
    die(e.message);
  }
  console.log();
}

// dsc serve [dir] — HTTP server with live reload
function cmdServe(args, flags) {
  const cfg  = loadConfig();
  const root = args[0] || cfg.serve || "dist";
  const port = parseInt(flags.port || flags.p || cfg.port || 3000);

  if(!fs.existsSync(root)) die(`Direktori tidak ditemukan: ${root}`);

  console.log(`\n${p(C.bold+C.orange,"  DomScript")} ${p(C.gray,"v"+VERSION)} — Serve\n`);

  const { createServer } = require(path.join(SRC_DIR, "server"));
  const srv = createServer({ root, port });

  srv.start((p2) => {
    const url = `http://localhost:${p2}`;
    ok(`Serving ${p(C.white, root)}`);
    ok(`URL: ${p(C.cyan, url)}`);
    inf(`Jaringan: ${p(C.cyan, `http://${getLocalIP()}:${p2}`)}`);
    inf(`Tekan ${p(C.white,"Ctrl+C")} untuk berhenti\n`);
    if(!flags["no-open"] && !flags.n) openBrowser(url);
  });

  process.on("SIGINT", () => {
    srv.httpServer.close();
    console.log(p(C.gray, "\n  Server berhenti."));
    process.exit(0);
  });
}

// dsc dev — build + serve + watch (full dev mode)
function cmdDev(args, flags) {
  const cfg    = loadConfig();
  const entry  = args[0] || cfg.entry  || "src/main.ds";
  const output = flags.output || flags.o || cfg.output || "dist/bundle.js";
  const port   = parseInt(flags.port || flags.p || cfg.port || 3000);
  const root   = cfg.serve || "dist";

  if(!fs.existsSync(entry)) die(`Entry tidak ditemukan: ${entry}`);

  console.log(`\n${p(C.bold+C.orange,"  DomScript")} ${p(C.gray,"v"+VERSION)} — Dev Mode\n`);
  inf(`Entry:  ${p(C.white, entry)}`);
  inf(`Output: ${p(C.white, output)}`);

  const { createServer } = require(path.join(SRC_DIR, "server"));
  const srv = createServer({ root, port });

  let buildErrors = 0;

  function build(silent=false) {
    const t0 = Date.now();
    try {
      const result = bundleFiles(path.resolve(entry), {module:"iife"});
      writeOutput(result.js, path.resolve(output));
      if(!silent) ok(`Build → ${p(C.white, output)} (${result.modules} modul, ${ms(t0)})`);
      buildErrors = 0;
      return true;
    } catch(e) {
      err(e.message);
      buildErrors++;
      return false;
    }
  }

  // Initial build
  build();
  ensureDir(root);

  // Create index.html if missing
  const indexPath = path.join(root, "index.html");
  if(!fs.existsSync(indexPath)) {
    const projName = path.basename(process.cwd());
    fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${projName}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app"></div>
  <script src="bundle.js"></script>
</body>
</html>`, "utf8");
  }

  // Watch src directory
  const srcDir = path.dirname(path.resolve(entry));
  let debounce;
  const watcher = watchDir(srcDir, [".ds", ".domscript"], (changedFile) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const rel = path.relative(process.cwd(), changedFile);
      process.stdout.write(p(C.gray, `\r  ↻ ${rel} — rebuild...`));
      const ok2 = build(true);
      if(ok2) {
        process.stdout.write(`\r${p(C.green,"  ✔")} ${rel} → rebuild OK       \n`);
        srv.reload();
      } else {
        process.stdout.write(`\r${p(C.red,"  ✖")} Build gagal — cek error di atas\n`);
      }
    }, 80);
  });

  srv.start((p2) => {
    const url = `http://localhost:${p2}`;
    console.log();
    ok(`Dev server: ${p(C.cyan, url)}`);
    ok(`Jaringan:   ${p(C.cyan, `http://${getLocalIP()}:${p2}`)}`);
    inf(`Watch: ${p(C.white, srcDir)}`);
    inf(`Tekan ${p(C.white,"Ctrl+C")} untuk berhenti\n`);
    if(!flags["no-open"] && !flags.n) openBrowser(url);
  });

  process.on("SIGINT", () => {
    watcher.close();
    srv.httpServer.close();
    console.log(p(C.gray, "\n  Dev server berhenti."));
    process.exit(0);
  });
}

// dsc create <name> [--template <t>] — scaffold project
function cmdCreate(args, flags) {
  const projName = args[0];
  if(!projName) die("Usage: dsc create <nama-project> [--template default|minimal|api]");

  const template = flags.template || flags.t || "default";
  const targetDir = path.resolve(projName);

  if(fs.existsSync(targetDir)) die(`Direktori sudah ada: ${targetDir}`);

  const tplDir = path.join(TPL_DIR, template);
  if(!fs.existsSync(tplDir)) die(`Template tidak ditemukan: ${template}\nTemplate tersedia: default, minimal, api`);

  console.log(`\n${p(C.bold+C.orange,"  DomScript")} ${p(C.gray,"v"+VERSION)} — Create\n`);
  inf(`Membuat project: ${p(C.white, projName)}`);
  inf(`Template: ${p(C.white, template)}`);

  // Copy template recursively
  function copyDir(src, dest) {
    ensureDir(dest);
    for(const entry of fs.readdirSync(src)) {
      const srcPath  = path.join(src, entry);
      const destPath = path.join(dest, entry);
      const stat     = fs.statSync(srcPath);
      if(stat.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        let content = fs.readFileSync(srcPath, "utf8");
        // Replace template variables
        content = content.replace(/\{\{PROJECT_NAME\}\}/g, projName);
        fs.writeFileSync(destPath, content, "utf8");
      }
    }
  }
  copyDir(tplDir, targetDir);

  // Create package.json
  const pkg = {
    name: projName.toLowerCase().replace(/\s+/g, "-"),
    version: "1.0.0",
    scripts: {
      dev:   "dsc dev",
      build: "dsc build",
      serve: "dsc serve"
    }
  };
  fs.writeFileSync(path.join(targetDir, "package.json"), JSON.stringify(pkg, null, 2), "utf8");

  // Create .gitignore
  fs.writeFileSync(path.join(targetDir, ".gitignore"), "node_modules/\ndist/bundle.js\ndist/bundle.min.js\n", "utf8");

  console.log();
  ok(`Project ${p(C.white, projName)} berhasil dibuat!\n`);
  console.log(`  ${p(C.gray, "Langkah selanjutnya:")}`);
  console.log(`  ${p(C.cyan,  "cd " + projName)}`);
  console.log(`  ${p(C.cyan,  "dsc dev")}          ${p(C.gray, "— build + server + watch")}`);
  console.log(`  ${p(C.cyan,  "dsc build")}        ${p(C.gray, "— build saja")}`);
  console.log(`  ${p(C.cyan,  "dsc run src/main.ds")} ${p(C.gray, "— run langsung")}\n`);
}

// dsc compile <file> — quick one-shot compile
function cmdCompile(args, flags) {
  const inputPath = args[0];
  if(!inputPath) die("Usage: dsc compile <file.ds> [-o output.js] [--bundle] [--minify]");
  if(!fs.existsSync(inputPath)) die(`File tidak ditemukan: ${inputPath}`);

  const output   = flags.output || flags.o;
  const doBundle = flags.bundle || flags.b;
  const minify   = flags.minify || flags.m;
  const tokensOnly = flags.tokens;
  const astOnly    = flags.ast;

  if(tokensOnly) {
    const src  = fs.readFileSync(inputPath, "utf8");
    const toks = new Lexer(src, inputPath).tokenize();
    console.log(JSON.stringify(toks, null, 2));
    return;
  }

  if(astOnly) {
    const src  = fs.readFileSync(inputPath, "utf8");
    const toks = new Lexer(src, inputPath).tokenize();
    const ast  = new Parser(toks, inputPath).parse();
    console.log(JSON.stringify(ast, null, 2));
    return;
  }

  const t0 = Date.now();
  try {
    let js, meta;
    if(doBundle) {
      const r = bundleFiles(path.resolve(inputPath), {minify, module:flags.module||"iife"});
      js=r.js; meta=`${r.modules} modul`;
    } else {
      const r = compileFile(path.resolve(inputPath), {minify, module:flags.module||"iife"});
      js=r.js; meta=`${r.tokens} token`;
    }

    if(output) {
      const size = writeOutput(js, path.resolve(output));
      console.log(`\n${p(C.bold+C.orange,"  DomScript")} ${p(C.gray,"v"+VERSION)}\n`);
      ok(`→ ${p(C.white, output)} (${fmt(size)}, ${meta}, ${ms(t0)})\n`);
    } else {
      // Print to stdout
      process.stdout.write(js + "\n");
    }
  } catch(e) {
    die(e.message);
  }
}

// dsc info — show system and compiler info
function cmdInfo() {
  const platform = process.platform;
  const isAndroid = process.env.TERMUX_VERSION || fs.existsSync("/data/data/com.termux");
  const isWSL  = fs.existsSync("/proc/version") &&
                 fs.readFileSync("/proc/version","utf8").toLowerCase().includes("microsoft");

  console.log(`\n${p(C.bold+C.orange,"  DomScript")} ${p(C.white,"v"+VERSION)}\n`);
  console.log(`  ${p(C.gray,"Platform:")}  ${platform}${isAndroid?" (Termux/Android)":isWSL?" (WSL)":""}`);
  console.log(`  ${p(C.gray,"Node.js:")}   ${process.version}`);
  console.log(`  ${p(C.gray,"Arch:")}      ${process.arch}`);
  console.log(`  ${p(C.gray,"Compiler:")}  ${path.resolve(__dirname)}`);
  console.log(`  ${p(C.gray,"Templates:")} ${TPL_DIR}`);
  const localIP = getLocalIP();
  if(localIP !== "127.0.0.1") console.log(`  ${p(C.gray,"Local IP:")}  ${localIP}`);
  console.log();
}

// ── Argument parser ────────────────────────────────────────────────
function parseArgs(argv) {
  const args = [], flags = {};
  let i = 0;
  while(i < argv.length) {
    const a = argv[i];
    if(a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i+1];
      if(next && !next.startsWith("-")) { flags[key]=next; i+=2; }
      else { flags[key]=true; i++; }
    } else if(a.startsWith("-") && a.length === 2) {
      const key = a.slice(1);
      const next = argv[i+1];
      if(next && !next.startsWith("-")) { flags[key]=next; i+=2; }
      else { flags[key]=true; i++; }
    } else {
      args.push(a); i++;
    }
  }
  return {args, flags};
}

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for(const name of Object.keys(ifaces)) {
    for(const iface of ifaces[name]||[]) {
      if(iface.family==="IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

// ── Help text ──────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${p(C.bold+C.orange,"  DomScript")} ${p(C.gray,"v"+VERSION)} — Compiler & Toolchain

${p(C.bold,"  PENGGUNAAN")}
  ${p(C.cyan,"dsc")} <command> [options]

${p(C.bold,"  COMMANDS")}
  ${p(C.cyan,"run")}    <file.ds>              Compile + buka di browser (auto watch)
  ${p(C.cyan,"dev")}                           Build + serve + watch (full dev mode)
  ${p(C.cyan,"build")}  [entry.ds]             Compile ke JS (gunakan dsc.config.js)
  ${p(C.cyan,"serve")}  [dir]                  HTTP server dengan live reload
  ${p(C.cyan,"create")} <nama> [--template t]  Buat project baru
  ${p(C.cyan,"compile")} <file.ds>             One-shot compile (ke stdout atau -o file)
  ${p(C.cyan,"info")}                          Informasi sistem & compiler

${p(C.bold,"  OPTIONS UTAMA")}
  ${p(C.cyan,"-o, --output <file>")}    File output JS
  ${p(C.cyan,"-b, --bundle")}           Bundle semua import jadi satu file
  ${p(C.cyan,"-m, --minify")}           Minify output
  ${p(C.cyan,"-p, --port <n>")}         Port server (default: 3000)
  ${p(C.cyan,"-n, --no-open")}          Jangan buka browser otomatis
  ${p(C.cyan,"--module <type>")}        Format: iife (default), cjs, none
  ${p(C.cyan,"--template <t>")}         Template: default, minimal, api
  ${p(C.cyan,"--tokens")}              Debug: print token stream
  ${p(C.cyan,"--ast")}                 Debug: print AST (JSON)
  ${p(C.cyan,"-v, --version")}         Versi
  ${p(C.cyan,"-h, --help")}            Bantuan ini

${p(C.bold,"  CONTOH")}
  ${p(C.gray,"# Jalankan file .ds langsung")}
  ${p(C.cyan,"dsc run src/app.ds")}

  ${p(C.gray,"# Buat project baru")}
  ${p(C.cyan,"dsc create my-app")}
  ${p(C.cyan,"cd my-app && dsc dev")}

  ${p(C.gray,"# Build untuk production")}
  ${p(C.cyan,"dsc build --minify")}

  ${p(C.gray,"# Serve folder dist")}
  ${p(C.cyan,"dsc serve dist --port 8080")}

  ${p(C.gray,"# Compile satu file ke stdout")}
  ${p(C.cyan,"dsc compile src/app.ds")}

  ${p(C.gray,"# Debug: lihat token stream")}
  ${p(C.cyan,"dsc compile src/app.ds --tokens")}

  ${p(C.gray,"# Template API")}
  ${p(C.cyan,"dsc create my-api --template api")}

${p(C.bold,"  FILE KONFIGURASI")}  ${p(C.gray,"dsc.config.js")}
  ${p(C.gray,"module.exports = {")}
  ${p(C.gray,"  entry:  \"src/main.ds\",")}
  ${p(C.gray,"  output: \"dist/bundle.js\",")}
  ${p(C.gray,"  serve:  \"dist\",")}
  ${p(C.gray,"  port:   3000,")}
  ${p(C.gray,"  bundle: true,")}
  ${p(C.gray,"  minify: false,")}
  ${p(C.gray,"}")}
`);
}

// ── Main entry ────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const {args, flags} = parseArgs(rawArgs);
const cmd = args[0];
const rest = args.slice(1);

if(flags.version || flags.v || cmd === "version") {
  console.log("DomScript v" + VERSION);
  process.exit(0);
}

if(flags.help || flags.h || !cmd) {
  printHelp();
  process.exit(cmd ? 0 : 1);
}

// Route commands
switch(cmd) {
  case "run":     cmdRun(rest, flags);         break;
  case "dev":     cmdDev(rest, flags);         break;
  case "build":   cmdBuild(rest, flags);       break;
  case "serve":   cmdServe(rest, flags);       break;
  case "create":  cmdCreate(rest, flags);      break;
  case "compile": cmdCompile(rest, flags);     break;
  case "info":    cmdInfo();                   break;
  default:
    // Shortcut: dsc file.ds → same as dsc run file.ds
    if(cmd.endsWith(".ds") || cmd.endsWith(".domscript")) {
      cmdRun(args, flags);
    } else {
      die(`Perintah tidak dikenal: '${cmd}'\nJalankan ${p(C.cyan,"dsc --help")} untuk bantuan.`);
    }
}
