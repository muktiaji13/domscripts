"use strict";
// ─────────────────────────────────────────────────────────────
// DomScript Bundler v3  —  src/bundler.js
// Resolves .ds imports → single JS output
// ─────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");
const { Lexer }   = require("./lexer");
const { Parser }  = require("./parser");
const { CodeGen, RUNTIME_SRC } = require("./codegen");

class Module {
  constructor(id, absPath, src) {
    this.id=id; this.absPath=absPath; this.src=src;
    this.ast=null; this.exports=new Set(); this.imports=[]; this.js="";
  }
}

class Bundler {
  constructor(opts={}) {
    this.opts = { minify:false, banner:"", module:"iife", ...opts };
    this.modules = new Map();
    this.order   = [];
    this._nextId = 0;
  }

  bundle(entryPath) {
    const abs = path.resolve(entryPath);
    if(!fs.existsSync(abs)) throw new Error(`Entry not found: ${abs}`);
    this._load(abs);
    this._topoSort(abs);
    this.order.forEach(p => this._codegen(this.modules.get(p)));
    return this._link();
  }

  _load(absPath) {
    if(this.modules.has(absPath)) return;
    const src = fs.readFileSync(absPath, "utf8");
    const mod = new Module(this._nextId++, absPath, src);
    this.modules.set(absPath, mod);

    const toks = new Lexer(src, absPath).tokenize();
    const ast  = new Parser(toks, absPath).parse();
    mod.ast = ast;

    for(const stmt of ast.body) {
      if(stmt.k==="Import") {
        const resolved = this._resolve(stmt.src, absPath);
        if(resolved) {
          mod.imports.push({names:stmt.specifiers, srcStr:stmt.src, absPath:resolved});
          this._load(resolved);
        }
      }
      if(stmt.k==="Export") {
        const name = stmt.decl?.name;
        if(name) mod.exports.add(name);
      }
    }
  }

  _resolve(importPath, fromFile) {
    const dir = path.dirname(fromFile);
    const exts = ["", ".ds", ".domscript"];
    for(const ext of exts) {
      const full = path.resolve(dir, importPath + ext);
      if(fs.existsSync(full)) return full;
    }
    return null; // external / node_modules — skip
  }

  _topoSort(entry) {
    const inDeg = new Map(), graph = new Map();
    for(const [p] of this.modules) { inDeg.set(p,0); graph.set(p,new Set()); }
    for(const [p, mod] of this.modules) {
      for(const imp of mod.imports) {
        if(this.modules.has(imp.absPath)) {
          graph.get(imp.absPath).add(p);
          inDeg.set(p, (inDeg.get(p)||0)+1);
        }
      }
    }
    const q=[];
    for(const [p,d] of inDeg) if(d===0) q.push(p);
    while(q.length) {
      const cur=q.shift(); this.order.push(cur);
      for(const dep of graph.get(cur)||[]) {
        const d=inDeg.get(dep)-1; inDeg.set(dep,d);
        if(d===0) q.push(dep);
      }
    }
    if(this.order.length < this.modules.size) throw new Error("Circular dependency detected");
  }

  _codegen(mod) {
    const gen = new CodeGen({ minify:this.opts.minify, module:"none", injectRuntime:false });
    const stmts = mod.ast.body.map(s => {
      if(s.k==="Export") return s.decl;
      if(s.k==="Import") return null;
      return s;
    }).filter(Boolean);
    stmts.forEach(s => gen.genStmt(s));
    mod.js = gen.output;
  }

  _link() {
    const parts = [];
    if(this.opts.banner) parts.push(this.opts.banner);

    // IIFE wrapper
    if(this.opts.module==="iife") {
      parts.push("(function() {");
      parts.push('"use strict";');
    }

    // Runtime (once)
    parts.push(RUNTIME_SRC);
    parts.push("");

    // Modules
    const rel = abs => path.relative(process.cwd(), abs).replace(/\\/g, "/");
    for(const modPath of this.order) {
      const mod = this.modules.get(modPath);
      if(!this.opts.minify) parts.push(`\n// ── ${rel(modPath)} ──`);
      parts.push(mod.js);
    }

    if(this.opts.module==="iife") parts.push("})();");

    return parts.join("\n");
  }
}

module.exports = { Bundler };
