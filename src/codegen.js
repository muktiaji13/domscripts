"use strict";
// ─────────────────────────────────────────────────────────────
// DomScript CodeGen v3  —  src/codegen.js
// AST → JavaScript (ES2020)
// ─────────────────────────────────────────────────────────────

const RUNTIME_SRC = `
const __ds = {
  create:(tag)=>document.createElement(tag),
  setText:(el,t)=>{if(el)el.textContent=String(t);},
  setHtml:(el,h)=>{if(el)el.innerHTML=h;},
  setAttr:(el,a,v)=>{if(el)el.setAttribute(String(a),String(v));},
  getAttr:(el,a)=>el?el.getAttribute(a):null,
  getText:(el)=>el?el.textContent:"",
  setStyle:(el,p,v)=>{if(el)el.style[p.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;},
  addClass:(el,c)=>{if(el)el.classList.add(...c.split(" ").filter(Boolean));},
  removeClass:(el,c)=>{if(el)el.classList.remove(...c.split(" ").filter(Boolean));},
  toggleClass:(el,c)=>{if(el)el.classList.toggle(c);},
  append:(child,parent)=>{if(parent&&child)parent.appendChild(child);},
  prepend:(child,parent)=>{if(parent&&child)parent.insertBefore(child,parent.firstChild);},
  remove:(el)=>{if(el)el.remove();},
  on:(el,ev,h)=>{if(el)el.addEventListener(ev,h);return h;},
  off:(el,ev,h)=>{if(el)el.removeEventListener(ev,h);},
  mount:(node,container)=>{
    const p=typeof container==="string"?document.querySelector(container):container;
    if(!p)throw new Error("Mount target not found: "+container);
    if(node)p.appendChild(node);
  },
  unmount:(el)=>{if(el&&el.parentNode)el.parentNode.removeChild(el);},
  query:(sel,root)=>(root||document).querySelector(sel),
  queryAll:(sel,root)=>Array.from((root||document).querySelectorAll(sel)),
};
`.trim();

class CodeGen {
  constructor(opts={}) {
    this.opts = { minify:false, module:"iife", injectRuntime:true, sourceMap:false, ...opts };
    this.lines = [];
    this.indent = 0;
    this._tempCount = 0;
  }

  ind()  { return this.opts.minify ? "" : "  ".repeat(this.indent); }
  nl()   { return this.opts.minify ? "" : "\n"; }

  emit(code, srcLine) {
    this.lines.push({ code: this.ind() + code, srcLine });
  }
  raw(code) { this.lines.push({ code }); }

  get output() {
    return this.lines.map(l => l.code).join(this.nl() || "");
  }

  tempVar() { return `__t${this._tempCount++}`; }

  generate(ast) {
    if(this.opts.module === "iife") {
      this.raw("(function() {");
      this.raw('"use strict";');
      this.indent++;
    } else if(this.opts.module === "cjs") {
      this.raw('"use strict";');
    }

    if(this.opts.injectRuntime) {
      RUNTIME_SRC.split("\n").forEach(l => this.raw(l));
      this.raw("");
    }

    ast.body.forEach(s => this.genStmt(s));

    if(this.opts.module === "iife") {
      this.indent--;
      this.raw("})();");
    }
    return this.output;
  }

  // ── Statements ───────────────────────────────────────────
  genStmt(node) {
    if(!node) return;
    switch(node.k) {

      case "Import":
        this.emit(`// import { ${node.specifiers.map(s=>s.namespace?`* as ${s.alias}`:s.alias?`${s.name} as ${s.alias}`:s.name).join(", ")} } from "${node.src}"`);
        break;

      case "Export":
        this.genStmt(node.decl);
        break;

      case "VarDecl": {
        const kw = node.kind === "const" ? "const" : "let";
        const init = node.init ? ` = ${this.genExpr(node.init)}` : "";
        this.emit(`${kw} ${node.name}${init};`, node.line);
        break;
      }

      case "VarDestruct": {
        const kw = node.kind === "const" ? "const" : "let";
        let pat;
        if(node.pattern === "array") {
          pat = `[${node.elems.map(e=>e?e.spread?"..."+e.name:e.name:"").join(", ")}]`;
        } else {
          pat = `{ ${node.props.map(p => p.alias?`${p.key}: ${p.alias}`:p.default?`${p.key} = ${this.genExpr(p.default)}`:p.key).join(", ")} }`;
        }
        const init = node.init ? ` = ${this.genExpr(node.init)}` : "";
        this.emit(`${kw} ${pat}${init};`, node.line);
        break;
      }

      case "FuncDecl": {
        const a = node.async ? "async " : "";
        const n = node.name || "";
        const ps = this._genParams(node.params);
        this.emit(`${a}function ${n}(${ps}) {`, node.line);
        this.indent++;
        node.body.body.forEach(s => this.genStmt(s));
        this.indent--;
        this.emit("}");
        break;
      }

      case "Return":
        this.emit(`return${node.value ? " " + this.genExpr(node.value) : ""};`, node.line);
        break;

      case "Break":    this.emit("break;");    break;
      case "Continue": this.emit("continue;"); break;

      case "Throw":
        this.emit(`throw ${this.genExpr(node.value)};`, node.line);
        break;

      case "Try": {
        this.emit("try {", node.line);
        this.indent++;
        node.tryBody.body.forEach(s => this.genStmt(s));
        this.indent--;
        if(node.catchBody) {
          const p = node.catchParam ? `(${node.catchParam})` : "(e)";
          this.emit(`} catch ${p} {`);
          this.indent++;
          node.catchBody.body.forEach(s => this.genStmt(s));
          this.indent--;
        }
        if(node.finallyBody) {
          this.emit("} finally {");
          this.indent++;
          node.finallyBody.body.forEach(s => this.genStmt(s));
          this.indent--;
        }
        this.emit("}");
        break;
      }

      case "If": {
        this.emit(`if (${this.genExpr(node.test)}) {`, node.line);
        this.indent++;
        this._flatBlock(node.cons);
        this.indent--;
        if(node.alt) {
          if(node.alt.k === "If") {
            this.emit(`} else if (${this.genExpr(node.alt.test)}) {`);
            this.indent++;
            this._flatBlock(node.alt.cons);
            this.indent--;
            if(node.alt.alt) { this.emit("} else {"); this.indent++; this._flatBlock(node.alt.alt); this.indent--; }
          } else {
            this.emit("} else {");
            this.indent++;
            this._flatBlock(node.alt);
            this.indent--;
          }
        }
        this.emit("}");
        break;
      }

      case "While":
        this.emit(`while (${this.genExpr(node.test)}) {`, node.line);
        this.indent++;
        this._flatBlock(node.body);
        this.indent--;
        this.emit("}");
        break;

      case "For": {
        const init = node.init ? this._inlineStmt(node.init) : "";
        const test = node.test ? this.genExpr(node.test) : "";
        const upd  = node.upd  ? this.genExpr(node.upd)  : "";
        this.emit(`for (${init} ${test}; ${upd}) {`, node.line);
        this.indent++;
        this._flatBlock(node.body);
        this.indent--;
        this.emit("}");
        break;
      }

      case "ForOf":
        this.emit(`for (${node.kind} ${node.id} of ${this.genExpr(node.iter)}) {`, node.line);
        this.indent++;
        this._flatBlock(node.body);
        this.indent--;
        this.emit("}");
        break;

      case "ForIn":
        this.emit(`for (${node.kind} ${node.id} in ${this.genExpr(node.obj)}) {`, node.line);
        this.indent++;
        this._flatBlock(node.body);
        this.indent--;
        this.emit("}");
        break;

      case "Switch": {
        this.emit(`switch (${this.genExpr(node.disc)}) {`, node.line);
        this.indent++;
        for(const c of node.cases) {
          if(c.isDefault) this.emit("default:");
          else this.emit(`case ${this.genExpr(c.test)}:`);
          this.indent++;
          c.body.forEach(s => this.genStmt(s));
          this.indent--;
        }
        this.indent--;
        this.emit("}");
        break;
      }

      case "Log":    this.emit(`console.log(${node.args.map(a=>this.genExpr(a)).join(", ")});`, node.line); break;
      case "Warn":   this.emit(`console.warn(${node.args.map(a=>this.genExpr(a)).join(", ")});`, node.line); break;
      case "ErrLog": this.emit(`console.error(${node.args.map(a=>this.genExpr(a)).join(", ")});`, node.line); break;

      // ── DOM ─────────────────────────────────────────
      case "Create":
        this.emit(node.name
          ? `let ${node.name} = __ds.create(${JSON.stringify(node.tag)});`
          : `__ds.create(${JSON.stringify(node.tag)});`, node.line);
        break;
      case "SetText":       this.emit(`__ds.setText(${this.genExpr(node.target)}, ${this.genExpr(node.value)});`,                                       node.line); break;
      case "SetHtml":       this.emit(`__ds.setHtml(${this.genExpr(node.target)}, ${this.genExpr(node.value)});`,                                       node.line); break;
      case "SetAttr":       this.emit(`__ds.setAttr(${this.genExpr(node.target)}, ${this.genExpr(node.prop)}, ${this.genExpr(node.value)});`,            node.line); break;
      case "SetStyle":      this.emit(`__ds.setStyle(${this.genExpr(node.target)}, ${this.genExpr(node.prop)}, ${this.genExpr(node.value)});`,           node.line); break;
      case "AddClass":      this.emit(`__ds.addClass(${this.genExpr(node.target)}, ${this.genExpr(node.value)});`,                                       node.line); break;
      case "RemoveClass":   this.emit(`__ds.removeClass(${this.genExpr(node.target)}, ${this.genExpr(node.value)});`,                                    node.line); break;
      case "ToggleClass":   this.emit(`__ds.toggleClass(${this.genExpr(node.target)}, ${this.genExpr(node.value)});`,                                    node.line); break;
      case "Append":        this.emit(`__ds.append(${this.genExpr(node.child)}, ${this.genExpr(node.parent)});`,                                         node.line); break;
      case "Prepend":       this.emit(`__ds.prepend(${this.genExpr(node.child)}, ${this.genExpr(node.parent)});`,                                        node.line); break;
      case "Remove":        this.emit(`__ds.remove(${this.genExpr(node.target)});`,                                                                      node.line); break;
      case "On":            this.emit(`__ds.on(${this.genExpr(node.target)}, ${this.genExpr(node.event)}, ${this.genExpr(node.handler)});`,              node.line); break;
      case "Off":           this.emit(`__ds.off(${this.genExpr(node.target)}, ${this.genExpr(node.event)}, ${this.genExpr(node.handler)});`,             node.line); break;
      case "Mount":         this.emit(`__ds.mount(${this.genExpr(node.node)}, ${this.genExpr(node.container)});`,                                        node.line); break;
      case "Unmount":       this.emit(`__ds.unmount(${this.genExpr(node.target)});`,                                                                     node.line); break;
      case "Query":         this.emit(`let ${node.name} = __ds.query(${this.genExpr(node.selector)});`,                                                  node.line); break;
      case "QueryAll":      this.emit(`let ${node.name} = __ds.queryAll(${this.genExpr(node.selector)});`,                                               node.line); break;

      case "Block":
        node.body.forEach(s => this.genStmt(s));
        break;

      case "ExprStmt":
        this.emit(`${this.genExpr(node.expr)};`);
        break;

      default:
        throw new Error(`[CodeGen] Unknown statement kind: '${node.k}' at line ${node.line}`);
    }
  }

  _flatBlock(node) {
    if(node.k==="Block") node.body.forEach(s => this.genStmt(s));
    else this.genStmt(node);
  }

  _inlineStmt(node) {
    if(node.k==="VarDecl") return `${node.kind==="const"?"const":"let"} ${node.name}${node.init?" = "+this.genExpr(node.init):""}`;
    if(node.k==="ExprStmt") return this.genExpr(node.expr);
    return "";
  }

  _genParams(params) {
    return params.map(p =>
      (p.spread ? "..." : "") + p.name + (p.default ? ` = ${this.genExpr(p.default)}` : "")
    ).join(", ");
  }

  // ── Expressions ──────────────────────────────────────────
  genExpr(node) {
    if(!node) return "undefined";
    switch(node.k) {
      case "Lit": return node.raw;

      case "Ident": return node.name;

      case "Template": {
        let out = "`";
        for(const part of node.parts) {
          if(part.type==="text") {
            out += part.value.replace(/`/g, "\\`").replace(/\$/g, "\\$");
          } else {
            // Re-compile the embedded expression
            try {
              const {Lexer} = require("./lexer");
              const {Parser} = require("./parser");
              const toks = new Lexer(part.src).tokenize();
              const ast  = new Parser(toks).parse();
              if(ast.body.length===1&&ast.body[0].k==="ExprStmt")
                out += "${" + this.genExpr(ast.body[0].expr) + "}";
              else out += "${" + part.src + "}";
            } catch { out += "${" + part.src + "}"; }
          }
        }
        out += "`";
        return out;
      }

      case "Assign": {
        const opMap = {"=":"=","+=":"+=","-=":"-=","*=":"*=","/=":"/=","%=":"%=","??=":"??="};
        return `${this.genExpr(node.left)} ${opMap[node.op]||node.op} ${this.genExpr(node.right)}`;
      }

      case "BinOp":
        return `(${this.genExpr(node.l)} ${node.op} ${this.genExpr(node.r)})`;

      case "Unary":
        return `${node.op}${this.genExpr(node.v)}`;

      case "PostfixOp":
        return `${this.genExpr(node.v)}${node.op}`;

      case "Ternary":
        return `(${this.genExpr(node.test)} ? ${this.genExpr(node.cons)} : ${this.genExpr(node.alt)})`;

      case "Await":
        return `await ${this.genExpr(node.value)}`;

      case "Call": {
        const callee = this.genExpr(node.callee);
        const args = node.args.map(a => (a.spread?"...":"")+this.genExpr(a.value)).join(", ");
        return `${callee}(${args})`;
      }

      case "OptCall": {
        const args = node.args.map(a => (a.spread?"...":"")+this.genExpr(a.value)).join(", ");
        return `${this.genExpr(node.obj)}?.(${args})`;
      }

      case "Index":
        return `${this.genExpr(node.obj)}[${this.genExpr(node.idx)}]`;

      case "Member":
        return `${this.genExpr(node.obj)}.${node.prop}`;

      case "OptChain":
        return `${this.genExpr(node.obj)}?.${node.prop}`;

      case "New": {
        const callee = this.genExpr(node.callee);
        return `new ${callee}`;
      }

      case "Arrow": {
        const ps = this._genParams(node.params);
        if(node.body.k==="Block") {
          const saved = this.indent;
          const savedLen = this.lines.length;
          this.indent = 0;
          node.body.body.forEach(s => this.genStmt(s));
          const inner = this.lines.splice(savedLen).map(l => "  " + l.code).join("\n");
          this.indent = saved;
          return `(${ps}) => {\n${inner}\n${this.ind()}}`;
        }
        return `(${ps}) => ${this.genExpr(node.body)}`;
      }

      case "FuncDecl": {
        const a = node.async ? "async " : "";
        const n = node.name || "";
        const ps = this._genParams(node.params);
        const saved=this.indent, savedLen=this.lines.length;
        this.indent=0;
        node.body.body.forEach(s=>this.genStmt(s));
        const inner=this.lines.splice(savedLen).map(l=>"  "+l.code).join("\n");
        this.indent=saved;
        return `${a}function ${n}(${ps}) {\n${inner}\n${this.ind()}}`;
      }

      case "Array": {
        const elems = node.elems.map(e => (e.spread?"...":"")+this.genExpr(e.value)).join(", ");
        return `[${elems}]`;
      }

      case "Obj": {
        const safeKey = k => typeof k==="object" ? `[${this.genExpr(k)}]` : /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        const props = node.props.map(p => {
          if(p.spread) return `...${this.genExpr(p.value)}`;
          if(p.shorthand) return safeKey(p.key);
          if(p.method) {
            const arrowBody = p.value;
            const ps = this._genParams(arrowBody.params);
            const saved=this.indent, savedLen=this.lines.length;
            this.indent=1;
            arrowBody.body.body.forEach(s=>this.genStmt(s));
            const inner=this.lines.splice(savedLen).map(l=>l.code).join("\n");
            this.indent=saved;
            return `${safeKey(p.key)}(${ps}) {\n${inner}\n${this.ind()}}`;
          }
          return `${safeKey(p.key)}: ${this.genExpr(p.value)}`;
        }).join(", ");
        return `{ ${props} }`;
      }

      default:
        return `/* unknown: ${node.k} */`;
    }
  }
}

module.exports = { CodeGen, RUNTIME_SRC };
