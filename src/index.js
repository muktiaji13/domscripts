"use strict";
// ─────────────────────────────────────────────────────────────
// DomScript v3 — Public API  src/index.js
// ─────────────────────────────────────────────────────────────

const path = require("path");
const fs   = require("fs");
const { Lexer }            = require("./lexer");
const { Parser }           = require("./parser");
const { CodeGen, RUNTIME_SRC } = require("./codegen");
const { Bundler }          = require("./bundler");

/**
 * Compile source string to JavaScript.
 * @param {string} src  DomScript source
 * @param {object} opts { module, minify, injectRuntime, filename }
 * @returns {string} JavaScript output
 */
function compile(src, opts = {}) {
  const filename = opts.filename || "<stdin>";
  const toks = new Lexer(src, filename).tokenize();
  const ast  = new Parser(toks, filename).parse();
  const gen  = new CodeGen({
    module:        opts.module        || "iife",
    minify:        opts.minify        || false,
    injectRuntime: opts.injectRuntime !== false,
  });
  return gen.generate(ast);
}

/**
 * Tokenize source string.
 * @param {string} src
 * @returns {Array} tokens
 */
function tokenize(src, filename = "<stdin>") {
  return new Lexer(src, filename).tokenize();
}

/**
 * Parse source string to AST.
 * @param {string} src
 * @returns {object} AST root node (Program)
 */
function parse(src, filename = "<stdin>") {
  const toks = tokenize(src, filename);
  return new Parser(toks, filename).parse();
}

/**
 * Bundle entry .ds file with all imports.
 * @param {string} entryPath  absolute or relative path
 * @param {object} opts       { minify, module, banner }
 * @returns {string} bundled JavaScript
 */
function bundle(entryPath, opts = {}) {
  const b = new Bundler(opts);
  return b.bundle(path.resolve(entryPath));
}

/**
 * Compile a .ds file to JS file.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} opts
 */
function compileFile(inputPath, outputPath, opts = {}) {
  const src  = fs.readFileSync(inputPath, "utf8");
  const js   = compile(src, { ...opts, filename: inputPath });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, js, "utf8");
  return js.length;
}

module.exports = {
  compile,
  tokenize,
  parse,
  bundle,
  compileFile,
  RUNTIME_SRC,
  Lexer,
  Parser,
  CodeGen,
  Bundler,
  VERSION: "3.0.0",
};
