"use strict";
// ─────────────────────────────────────────────────────────────
// DomScript v3 — Test Suite  test/run.js
// ─────────────────────────────────────────────────────────────

const path = require("path");
const { compile, tokenize, parse } = require(path.join(__dirname, "..", "src", "index"));

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
    passed++;
  } catch(e) {
    console.log(`  \x1b[31m✖\x1b[0m ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if(!cond) throw new Error(msg || "Assertion failed");
}

function assertCompiles(src) {
  const js = compile(src, {module:"none", injectRuntime:false});
  new Function(js); // syntax check
  return js;
}

console.log("\n\x1b[1m  DomScript v3 — Test Suite\x1b[0m\n");

// ── Lexer tests ───────────────────────────────────────────────────
test("Lexer: numbers", () => {
  const toks = tokenize("42 3.14 0xFF 0b1010");
  const nums = toks.filter(t => t.t === "NUM");
  assert(nums[0].v === 42);
  assert(nums[1].v === 3.14);
  assert(nums[2].v === 255);
  assert(nums[3].v === 10);
});

test("Lexer: strings", () => {
  const toks = tokenize('"hello" \'world\'');
  const strs = toks.filter(t => t.t === "STR");
  assert(strs[0].v === "hello");
  assert(strs[1].v === "world");
});

test("Lexer: keywords", () => {
  const toks = tokenize("let const func async await fetch try catch");
  const kws = toks.filter(t => t.t !== "EOF");
  assert(kws.length === 8);
});

test("Lexer: template literal", () => {
  const toks = tokenize("`Hello ${name}!`");
  const tmpl = toks.find(t => t.t === "TEMPLATE");
  assert(tmpl, "TEMPLATE token missing");
  assert(tmpl.parts.length === 3);
});

test("Lexer: single-line comment", () => {
  const toks = tokenize("let x = 1 // comment\nlet y = 2");
  const ids = toks.filter(t => t.t === "ID");
  assert(ids[0].v === "x");
  assert(ids[1].v === "y");
});

test("Lexer: block comment", () => {
  const toks = tokenize("let x /* block comment */ = 5");
  assert(!toks.some(t => t.v === "block"));
});

// ── Parser tests ──────────────────────────────────────────────────
test("Parser: var decl", () => {
  const ast = parse("let x = 42");
  assert(ast.body[0].k === "VarDecl");
  assert(ast.body[0].name === "x");
  assert(ast.body[0].init.v === 42);
});

test("Parser: if/else", () => {
  const ast = parse("if (x > 0) { log x } else { log 0 }");
  assert(ast.body[0].k === "If");
  assert(ast.body[0].alt !== null);
});

test("Parser: for-of", () => {
  const ast = parse("for (const x of arr) { log x }");
  assert(ast.body[0].k === "ForOf");
  assert(ast.body[0].id === "x");
});

test("Parser: async func", () => {
  const ast = parse("async func f() { return await fetch('url') }");
  assert(ast.body[0].k === "FuncDecl");
  assert(ast.body[0].async === true);
});

test("Parser: try/catch", () => {
  const ast = parse("try { let x = 1 } catch (e) { log e }");
  assert(ast.body[0].k === "Try");
  assert(ast.body[0].catchParam === "e");
});

test("Parser: arrow function", () => {
  const ast = parse("const f = (x) => x * 2");
  assert(ast.body[0].init.k === "Arrow");
  assert(ast.body[0].init.params[0].name === "x");
});

test("Parser: object literal with string key", () => {
  const ast = parse('const h = { "Content-Type": "application/json" }');
  assert(ast.body[0].init.k === "Obj");
  assert(ast.body[0].init.props[0].key === "Content-Type");
});

test("Parser: switch/case", () => {
  const ast = parse("switch (x) { case 1: log 1 default: log 0 }");
  assert(ast.body[0].k === "Switch");
  assert(ast.body[0].cases.length === 2);
});

test("Parser: array destructuring", () => {
  const ast = parse("let [a, b, ...rest] = arr");
  assert(ast.body[0].k === "VarDestruct");
  assert(ast.body[0].pattern === "array");
});

test("Parser: object destructuring", () => {
  const ast = parse("let { name, age } = user");
  assert(ast.body[0].k === "VarDestruct");
  assert(ast.body[0].pattern === "object");
});

// ── CodeGen tests ─────────────────────────────────────────────────
test("CodeGen: let/const", () => {
  const js = assertCompiles("let x = 10\nconst y = 20");
  assert(js.includes("let x = 10"));
  assert(js.includes("const y = 20"));
});

test("CodeGen: DOM create", () => {
  const js = assertCompiles('create "div" as box');
  assert(js.includes("__ds.create"));
  assert(js.includes('"div"'));
});

test("CodeGen: DOM setStyle", () => {
  const js = assertCompiles('setStyle box, "color", "red"');
  assert(js.includes("__ds.setStyle"));
});

test("CodeGen: DOM on event", () => {
  const js = assertCompiles('on btn, "click", (e) => { log "clicked" }');
  assert(js.includes("__ds.on"));
  assert(js.includes("click"));
});

test("CodeGen: DOM mount", () => {
  const js = assertCompiles('mount app to "#app"');
  assert(js.includes("__ds.mount"));
  assert(js.includes("#app"));
});

test("CodeGen: async function", () => {
  const js = assertCompiles("async func f() { let x = await fetch('url') }");
  assert(js.includes("async function f"));
  assert(js.includes("await fetch"));
});

test("CodeGen: try/catch", () => {
  const js = assertCompiles("try { let x = 1 } catch (e) { log e }");
  assert(js.includes("try {"));
  assert(js.includes("} catch (e) {"));
});

test("CodeGen: template literal", () => {
  const js = assertCompiles("let s = `Hello ${name}!`");
  assert(js.includes("`Hello"));
});

test("CodeGen: switch", () => {
  const js = assertCompiles("switch (x) { case 1: log 1 default: log 0 }");
  assert(js.includes("switch"));
  assert(js.includes("case 1:"));
  assert(js.includes("default:"));
});

test("CodeGen: object with string keys", () => {
  const js = assertCompiles('const h = { "Content-Type": "application/json" }');
  assert(js.includes('"Content-Type"'));
});

test("CodeGen: addClass / removeClass", () => {
  const js = assertCompiles('addClass el, "active"\nremoveClass el, "hidden"');
  assert(js.includes("__ds.addClass"));
  assert(js.includes("__ds.removeClass"));
});

test("CodeGen: fetch POST", () => {
  const js = assertCompiles(`
async func post() {
  let res = await fetch("https://api.com/data", {
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "body": JSON.stringify({ name: "test" })
  })
  return await res.json()
}
  `);
  assert(js.includes("async function post"));
  assert(js.includes("await fetch"));
  assert(js.includes('"Content-Type"'));
});

test("CodeGen: for-of loop", () => {
  const js = assertCompiles("for (const item of items) { log item }");
  assert(js.includes("for (const item of items)"));
});

test("CodeGen: export works", () => {
  const js = assertCompiles("export func greet() { return 'hi' }");
  assert(js.includes("function greet"));
});

test("CodeGen: log with multiple args", () => {
  const js = assertCompiles('log "a", "b", x');
  assert(js.includes('console.log("a", "b", x)'));
});

test("CodeGen: warn and error", () => {
  const js = assertCompiles('warn "warning"\nerror "err"');
  assert(js.includes("console.warn"));
  assert(js.includes("console.error"));
});

// ── Full integration tests ────────────────────────────────────────
test("Integration: counter app", () => {
  assertCompiles(`
let count = 0
create "div" as app
create "button" as btn
setText btn, "Click"
append btn to app
on btn, "click", (e) => {
  count = count + 1
  setText btn, "Clicked " + count
}
mount app to "#app"
  `);
});

test("Integration: async + DOM", () => {
  assertCompiles(`
create "div" as app
create "div" as status
setText status, "Loading..."
setStyle status, "color", "gray"
append status to app

async func loadData() {
  try {
    let res  = await fetch("https://api.example.com/data")
    let data = await res.json()
    setText status, "Loaded " + len(data) + " items"
    setStyle status, "color", "green"
  } catch (e) {
    setText status, "Error: " + e.message
    setStyle status, "color", "red"
  }
}

on app, "click", (e) => { loadData() }
mount app to "#app"
  `);
});

test("Integration: modular (no bundler)", () => {
  const src = `
export func Button(label) {
  create "button" as el
  setText el, label
  setStyle el, "padding", "10px 20px"
  setStyle el, "cursor", "pointer"
  return el
}
export func Card(title) {
  create "div" as el
  create "h2" as h
  setText h, title
  append h to el
  return el
}
  `;
  const js = assertCompiles(src);
  assert(js.includes("function Button"));
  assert(js.includes("function Card"));
});

// ── Summary ───────────────────────────────────────────────────────
console.log(`\n  ${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if(failed > 0) {
  console.log("  \x1b[31mAda test yang gagal!\x1b[0m\n");
  process.exit(1);
} else {
  console.log("  \x1b[32mSemua test berhasil ✔\x1b[0m\n");
}
