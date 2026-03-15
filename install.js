#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// DomScript v3 — Installer
// install.js
//
// Cara pakai:
//   node install.js           — install global (symlink / PATH)
//   node install.js --uninstall
// ─────────────────────────────────────────────────────────────
"use strict";

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const { execSync } = require("child_process");

const VERSION    = "3.0.0";
const DSC_BIN    = path.resolve(__dirname, "bin", "dsc.js");
const PLATFORM   = process.platform;
const isAndroid  = !!(process.env.TERMUX_VERSION || process.env.PREFIX?.includes("termux") ||
                   (() => { try { return fs.existsSync("/data/data/com.termux"); } catch { return false; } })());
const isWindows  = PLATFORM === "win32";
const isWSL      = !isWindows && !isAndroid && (() => {
  try {
    return fs.existsSync("/proc/version") &&
           fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch { return false; }
})();

const C = {
  bold:"\x1b[1m", reset:"\x1b[0m",
  green:"\x1b[32m", red:"\x1b[31m",
  cyan:"\x1b[36m", gray:"\x1b[90m", yellow:"\x1b[33m",
};
const p  = (c,s) => `${c}${s}${C.reset}`;
const ok = s => console.log(p(C.green, "  ✔ ") + s);
const er = s => console.error(p(C.red, "  ✖ ") + s);
const in2= s => console.log(p(C.cyan, "  ℹ ") + s);

const args = process.argv.slice(2);
const uninstall = args.includes("--uninstall") || args.includes("-u");

console.log(`\n${p(C.bold+C.green, "  DomScript Installer")} ${p(C.gray, "v"+VERSION)}\n`);

// ── Windows installer ─────────────────────────────────────────────
if(isWindows) {
  installWindows();
  process.exit(0);
}

// ── Unix installer (Linux / macOS / Termux) ───────────────────────
installUnix();

function installUnix() {
  // Determine install dir
  let binDirs = [];

  if(isAndroid) {
    binDirs = ["/data/data/com.termux/files/usr/bin", process.env.PREFIX+"/bin"].filter(Boolean);
  } else {
    // Try dirs in PATH
    const PATH = (process.env.PATH||"").split(":");
    const preferred = [
      "/usr/local/bin",
      path.join(os.homedir(), ".local", "bin"),
      path.join(os.homedir(), "bin"),
      "/usr/bin",
    ];
    binDirs = preferred.filter(d => PATH.includes(d) || fs.existsSync(path.dirname(d)));
  }

  if(binDirs.length === 0) {
    er("Tidak bisa menentukan direktori bin. Tambahkan ~/.local/bin ke PATH.");
    printManualInstructions();
    process.exit(1);
  }

  const installDir = binDirs[0];
  const linkPath   = path.join(installDir, "dsc");

  if(uninstall) {
    doUninstallUnix(linkPath);
    return;
  }

  // Ensure install dir exists
  try { fs.mkdirSync(installDir, {recursive:true}); } catch {}

  if(!fs.existsSync(installDir)) {
    er(`Tidak bisa membuat direktori: ${installDir}`);
    printManualInstructions();
    process.exit(1);
  }

  // Remove old link
  try { fs.unlinkSync(linkPath); } catch {}

  // Create symlink
  try {
    // Make bin executable
    fs.chmodSync(DSC_BIN, 0o755);
    fs.symlinkSync(DSC_BIN, linkPath);
    ok(`Terpasang: ${p(C.cyan, linkPath)} → ${path.relative(os.homedir(), DSC_BIN)}`);
  } catch(e) {
    // Fallback: create wrapper script
    const wrapper = `#!/bin/sh\nnode "${DSC_BIN}" "$@"\n`;
    try {
      fs.writeFileSync(linkPath, wrapper, {mode:0o755});
      ok(`Wrapper dibuat: ${p(C.cyan, linkPath)}`);
    } catch(e2) {
      er(`Gagal membuat symlink atau wrapper: ${e2.message}`);
      printManualInstructions();
      process.exit(1);
    }
  }

  // Check if dir is in PATH
  const inPath = (process.env.PATH||"").split(":").includes(installDir);
  if(!inPath) {
    console.log();
    in2(`Tambahkan ke PATH di ~/.bashrc / ~/.zshrc / ~/.profile:`);
    console.log(`\n    ${p(C.cyan, `export PATH="$PATH:${installDir}"`)}\n`);
    in2("Lalu jalankan: source ~/.bashrc");
  }

  console.log();
  ok(`DomScript v${VERSION} terinstal!\n`);
  console.log(`  Coba jalankan: ${p(C.cyan, "dsc --help")}\n`);

  // Verify
  try {
    const result = execSync(`node "${DSC_BIN}" --version`, {encoding:"utf8"}).trim();
    ok(`Verifikasi: ${p(C.gray, result)}`);
  } catch {}
  console.log();
}

function doUninstallUnix(linkPath) {
  if(fs.existsSync(linkPath)) {
    fs.unlinkSync(linkPath);
    ok(`Dihapus: ${linkPath}`);
  } else {
    in2(`Tidak ditemukan: ${linkPath}`);
  }
  console.log();
}

// ── Windows installer ─────────────────────────────────────────────
function installWindows() {
  const homeDir   = os.homedir();
  const installDir = path.join(homeDir, ".domscript", "bin");

  try { fs.mkdirSync(installDir, {recursive:true}); } catch {}

  const batPath = path.join(installDir, "dsc.bat");
  const cmd1Path = path.join(installDir, "dsc.cmd");

  if(uninstall) {
    [batPath, cmd1Path].forEach(f => { try{fs.unlinkSync(f);}catch{} });
    ok("DomScript dihapus.");
    console.log();
    return;
  }

  const bat = `@echo off\nnode "${DSC_BIN}" %*\n`;
  fs.writeFileSync(batPath, bat);
  fs.writeFileSync(cmd1Path, bat);

  ok(`Wrapper dibuat: ${p(C.cyan, batPath)}`);

  // Add to PATH via registry (PowerShell)
  try {
    const currentPath = execSync(
      `powershell -command "[Environment]::GetEnvironmentVariable('PATH','User')"`,
      {encoding:"utf8"}
    ).trim();
    if(!currentPath.includes(installDir)) {
      const newPath = currentPath + ";" + installDir;
      execSync(
        `powershell -command "[Environment]::SetEnvironmentVariable('PATH','${newPath}','User')"`,
        {encoding:"utf8"}
      );
      ok(`Ditambahkan ke PATH pengguna.`);
      in2("Buka terminal baru untuk menggunakan 'dsc'.");
    } else {
      ok("Sudah ada di PATH.");
    }
  } catch {
    in2(`Tambahkan manual ke PATH: ${p(C.cyan, installDir)}`);
  }

  console.log();
  ok(`DomScript v${VERSION} terinstal!\n`);
  console.log(`  Coba jalankan (di terminal baru): ${p(C.cyan, "dsc --help")}\n`);
}

function printManualInstructions() {
  console.log(`
  ${p(C.yellow,"Install manual:")}

  ${p(C.gray,"# Tambahkan alias ke ~/.bashrc atau ~/.zshrc:")}
  ${p(C.cyan,`alias dsc="node ${DSC_BIN}"`)}

  ${p(C.gray,"# Atau buat symlink manual:")}
  ${p(C.cyan,`ln -sf ${DSC_BIN} ~/.local/bin/dsc`)}
  ${p(C.cyan,`chmod +x ${DSC_BIN}`)}
`);
}

