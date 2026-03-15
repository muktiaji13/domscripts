"use strict";
// ─────────────────────────────────────────────────────────────
// DomScript Parser v3  —  src/parser.js
// ─────────────────────────────────────────────────────────────

const { TK } = require("./lexer");

class ParseError extends Error {
  constructor(msg, tok, file) {
    super(`[ParseError] ${file||""}:${tok?.line||0}:${tok?.col||0}  ${msg}`);
    this.line=tok?.line; this.col=tok?.col;
  }
}

class Parser {
  constructor(tokens, filename="<stdin>") {
    this.tokens=tokens; this.filename=filename; this.pos=0;
  }

  peek(d=0) { return this.tokens[this.pos+d]||{t:TK.EOF}; }
  adv() { return this.tokens[this.pos++]; }
  check(t) { return this.peek().t===t; }
  match(...ts) { if(ts.includes(this.peek().t)) return this.adv(); return null; }
  expect(t) {
    if(!this.check(t)) {
      const tok=this.peek();
      throw new ParseError(`Expected '${t}', got '${tok.t}'${tok.v!==undefined?` (${tok.v})`:""}`, tok, this.filename);
    }
    return this.adv();
  }

  parse() {
    const body=[];
    while(!this.check(TK.EOF)) body.push(this.stmt());
    return {k:"Program", body, file:this.filename};
  }

  stmt() {
    const t=this.peek().t;
    if(t===TK.IMPORT)   return this.importStmt();
    if(t===TK.EXPORT)   return this.exportStmt();
    if(t===TK.LET||t===TK.CONST) return this.varDecl();
    if(t===TK.FUNC)     return this.funcDecl(false);
    if(t===TK.ASYNC)    return this.asyncDecl();
    if(t===TK.RETURN)   return this.returnStmt();
    if(t===TK.IF)       return this.ifStmt();
    if(t===TK.WHILE)    return this.whileStmt();
    if(t===TK.FOR)      return this.forStmt();
    if(t===TK.SWITCH)   return this.switchStmt();
    if(t===TK.TRY)      return this.tryStmt();
    if(t===TK.THROW)    return this.throwStmt();
    if(t===TK.BREAK)    { this.adv(); this.match(TK.SEMI); return {k:"Break"}; }
    if(t===TK.CONTINUE) { this.adv(); this.match(TK.SEMI); return {k:"Continue"}; }
    // I/O statements
    if(t===TK.LOG)   return this.ioStmt("Log");
    if(t===TK.WARN)  return this.ioStmt("Warn");
    if(t===TK.ERROR) return this.ioStmt("ErrLog");
    // DOM statements
    if(t===TK.CREATE)       return this.createStmt();
    if(t===TK.SETTEXT)      return this.domBinary("SetText");
    if(t===TK.SETHTML)      return this.domBinary("SetHtml");
    if(t===TK.SETATTR)      return this.domTernary("SetAttr");
    if(t===TK.SETSTYLE)     return this.domTernary("SetStyle");
    if(t===TK.ADDCLASS)     return this.domBinary("AddClass");
    if(t===TK.REMOVECLASS)  return this.domBinary("RemoveClass");
    if(t===TK.TOGGLECLASS)  return this.domBinary("ToggleClass");
    if(t===TK.APPEND)       return this.appendStmt();
    if(t===TK.PREPEND)      return this.prependStmt();
    if(t===TK.REMOVE)       { const l=this.adv().line; const e=this.expr(); this.match(TK.SEMI); return {k:"Remove",target:e,line:l}; }
    if(t===TK.ON)           return this.onStmt();
    if(t===TK.OFF)          return this.offStmt();
    if(t===TK.MOUNT)        return this.mountStmt();
    if(t===TK.UNMOUNT)      { const l=this.adv().line; const e=this.expr(); this.match(TK.SEMI); return {k:"Unmount",target:e,line:l}; }
    if(t===TK.QUERY)        return this.queryStmt();
    if(t===TK.QUERYALL)     return this.queryAllStmt();
    if(t===TK.LBRACE)       return this.block();
    return this.exprStmt();
  }

  // ── Imports / Exports ─────────────────────────────────────
  importStmt() {
    const line=this.adv().line;
    const specs=[];
    if(this.match(TK.LBRACE)) {
      while(!this.check(TK.RBRACE)&&!this.check(TK.EOF)) {
        const name=this.expect(TK.ID).v;
        const alias=this.match(TK.AS)?this.expect(TK.ID).v:null;
        specs.push({name,alias});
        this.match(TK.COMMA);
      }
      this.expect(TK.RBRACE);
    } else if(this.check(TK.STAR)) {
      this.adv(); this.expect(TK.AS);
      specs.push({name:"*", alias:this.expect(TK.ID).v, namespace:true});
    } else if(this.check(TK.ID)) {
      specs.push({name:this.adv().v, alias:null, isDefault:true});
    }
    this.expect(TK.FROM);
    const src=this.expect(TK.STR).v;
    this.match(TK.SEMI);
    return {k:"Import", specifiers:specs, src, line};
  }

  exportStmt() {
    const line=this.adv().line;
    const isDefault=!!this.match(TK.DEFAULT);
    const decl=this.stmt();
    return {k:"Export", decl, isDefault, line};
  }

  // ── Variable declarations ─────────────────────────────────
  varDecl() {
    const line=this.peek().line;
    const kind=this.adv().t;
    // Array destructuring: let [a, b] = ...
    if(this.check(TK.LBRACK)) {
      this.adv();
      const elems=[];
      while(!this.check(TK.RBRACK)) {
        if(this.match(TK.SPREAD)) elems.push({name:this.expect(TK.ID).v, spread:true});
        else if(this.check(TK.COMMA)) elems.push({name:null});
        else elems.push({name:this.expect(TK.ID).v});
        this.match(TK.COMMA);
      }
      this.expect(TK.RBRACK);
      const init=this.match(TK.ASSIGN)?this.expr():null;
      this.match(TK.SEMI);
      return {k:"VarDestruct", kind, pattern:"array", elems, init, line};
    }
    // Object destructuring: let { a, b } = ...
    if(this.check(TK.LBRACE)) {
      this.adv();
      const props=[];
      while(!this.check(TK.RBRACE)) {
        const key=this.expect(TK.ID).v;
        const alias=this.match(TK.COLON)?this.expect(TK.ID).v:null;
        const def=this.match(TK.ASSIGN)?this.expr():null;
        props.push({key, alias, default:def});
        this.match(TK.COMMA);
      }
      this.expect(TK.RBRACE);
      const init=this.match(TK.ASSIGN)?this.expr():null;
      this.match(TK.SEMI);
      return {k:"VarDestruct", kind, pattern:"object", props, init, line};
    }
    const name=this.expect(TK.ID).v;
    let init=null;
    if(this.match(TK.ASSIGN)) init=this.expr();
    this.match(TK.SEMI);
    return {k:"VarDecl", kind, name, init, line};
  }

  funcDecl(isAsync=false) {
    const line=this.adv().line;
    const name=this.check(TK.ID)?this.adv().v:null;
    this.expect(TK.LPAREN);
    const params=this.parseParams();
    this.expect(TK.RPAREN);
    const body=this.block();
    return {k:"FuncDecl", name, params, body, async:isAsync, line};
  }

  asyncDecl() {
    this.adv(); // consume 'async'
    if(!this.check(TK.FUNC)) throw new ParseError("Expected 'func' after 'async'", this.peek(), this.filename);
    return this.funcDecl(true);
  }

  parseParams() {
    const params=[];
    while(!this.check(TK.RPAREN)) {
      const spread=!!this.match(TK.SPREAD);
      const name=this.expect(TK.ID).v;
      const def=this.match(TK.ASSIGN)?this.expr():null;
      params.push({name, spread, default:def});
      this.match(TK.COMMA);
    }
    return params;
  }

  returnStmt() {
    const line=this.adv().line;
    let value=null;
    if(!this.check(TK.SEMI)&&!this.check(TK.RBRACE)&&!this.check(TK.EOF))
      value=this.expr();
    this.match(TK.SEMI);
    return {k:"Return", value, line};
  }

  ifStmt() {
    const line=this.adv().line;
    this.expect(TK.LPAREN);
    const test=this.expr();
    this.expect(TK.RPAREN);
    const cons=this.stmt();
    let alt=null;
    if(this.match(TK.ELSE)) alt=this.stmt();
    return {k:"If", test, cons, alt, line};
  }

  whileStmt() {
    const line=this.adv().line;
    this.expect(TK.LPAREN);
    const test=this.expr();
    this.expect(TK.RPAREN);
    return {k:"While", test, body:this.stmt(), line};
  }

  forStmt() {
    const line=this.adv().line;
    this.expect(TK.LPAREN);
    // for-of
    if((this.peek().t===TK.LET||this.peek().t===TK.CONST)&&this.peek(1).t===TK.ID&&this.peek(2).t===TK.OF) {
      const kind=this.adv().t, id=this.adv().v; this.adv();
      const iter=this.expr(); this.expect(TK.RPAREN);
      return {k:"ForOf", kind, id, iter, body:this.stmt(), line};
    }
    // for-in
    if((this.peek().t===TK.LET||this.peek().t===TK.CONST)&&this.peek(1).t===TK.ID&&this.peek(2).t===TK.IN) {
      const kind=this.adv().t, id=this.adv().v; this.adv();
      const obj=this.expr(); this.expect(TK.RPAREN);
      return {k:"ForIn", kind, id, obj, body:this.stmt(), line};
    }
    let init=null;
    if(!this.check(TK.SEMI)) {
      if(this.peek().t===TK.LET||this.peek().t===TK.CONST) init=this.varDecl();
      else init=this.exprStmt();
    } else this.adv();
    const test=this.check(TK.SEMI)?null:this.expr();
    this.expect(TK.SEMI);
    const upd=this.check(TK.RPAREN)?null:this.expr();
    this.expect(TK.RPAREN);
    return {k:"For", init, test, upd, body:this.stmt(), line};
  }

  switchStmt() {
    const line=this.adv().line;
    this.expect(TK.LPAREN);
    const disc=this.expr();
    this.expect(TK.RPAREN);
    this.expect(TK.LBRACE);
    const cases=[];
    while(!this.check(TK.RBRACE)&&!this.check(TK.EOF)) {
      if(this.match(TK.CASE)) {
        const test=this.expr(); this.expect(TK.COLON);
        const body=[];
        while(!this.check(TK.CASE)&&!this.check(TK.DEFAULT)&&!this.check(TK.RBRACE)&&!this.check(TK.EOF))
          body.push(this.stmt());
        cases.push({test, body});
      } else if(this.match(TK.DEFAULT)) {
        this.expect(TK.COLON);
        const body=[];
        while(!this.check(TK.CASE)&&!this.check(TK.RBRACE)&&!this.check(TK.EOF))
          body.push(this.stmt());
        cases.push({test:null, isDefault:true, body});
      } else break;
    }
    this.expect(TK.RBRACE);
    return {k:"Switch", disc, cases, line};
  }

  tryStmt() {
    const line=this.adv().line;
    const tryBody=this.block();
    let catchParam=null, catchBody=null, finallyBody=null;
    if(this.check(TK.CATCH)) {
      this.adv();
      if(this.match(TK.LPAREN)) { catchParam=this.expect(TK.ID).v; this.expect(TK.RPAREN); }
      catchBody=this.block();
    }
    if(this.check(TK.FINALLY)) { this.adv(); finallyBody=this.block(); }
    if(!catchBody&&!finallyBody) throw new ParseError("try must have catch or finally", this.peek(), this.filename);
    return {k:"Try", tryBody, catchParam, catchBody, finallyBody, line};
  }

  throwStmt() {
    const line=this.adv().line;
    const value=this.expr();
    this.match(TK.SEMI);
    return {k:"Throw", value, line};
  }

  ioStmt(kind) {
    const line=this.adv().line;
    const args=[];
    // allow multiple args: log "a", "b"
    args.push(this.expr());
    while(this.match(TK.COMMA)) args.push(this.expr());
    this.match(TK.SEMI);
    return {k:kind, args, line};
  }

  // ── DOM Statements ────────────────────────────────────────
  createStmt() {
    const line=this.adv().line;
    const tag=this.expect(TK.STR).v;
    let name=null;
    if(this.check(TK.AS)||(this.peek().t===TK.ID&&this.peek().v==="as")) {
      this.adv(); name=this.expect(TK.ID).v;
    }
    this.match(TK.SEMI);
    return {k:"Create", tag, name, line};
  }

  domBinary(k) {
    const line=this.adv().line;
    const target=this.expr(); this.expect(TK.COMMA);
    const value=this.expr(); this.match(TK.SEMI);
    return {k, target, value, line};
  }

  domTernary(k) {
    const line=this.adv().line;
    const target=this.expr(); this.expect(TK.COMMA);
    const prop=this.expr(); this.expect(TK.COMMA);
    const value=this.expr(); this.match(TK.SEMI);
    return {k, target, prop, value, line};
  }

  appendStmt() {
    const line=this.adv().line;
    const child=this.expr();
    if(this.check(TK.ID)&&this.peek().v==="to") this.adv();
    const parent=this.expr(); this.match(TK.SEMI);
    return {k:"Append", child, parent, line};
  }

  prependStmt() {
    const line=this.adv().line;
    const child=this.expr();
    if(this.check(TK.ID)&&this.peek().v==="to") this.adv();
    const parent=this.expr(); this.match(TK.SEMI);
    return {k:"Prepend", child, parent, line};
  }

  onStmt() {
    const line=this.adv().line;
    const target=this.expr(); this.expect(TK.COMMA);
    const event=this.expr(); this.expect(TK.COMMA);
    const handler=this.expr(); this.match(TK.SEMI);
    return {k:"On", target, event, handler, line};
  }

  offStmt() {
    const line=this.adv().line;
    const target=this.expr(); this.expect(TK.COMMA);
    const event=this.expr(); this.expect(TK.COMMA);
    const handler=this.expr(); this.match(TK.SEMI);
    return {k:"Off", target, event, handler, line};
  }

  mountStmt() {
    const line=this.adv().line;
    const node=this.expr();
    if(this.check(TK.ID)&&this.peek().v==="to") this.adv();
    const container=this.expr(); this.match(TK.SEMI);
    return {k:"Mount", node, container, line};
  }

  queryStmt() {
    const line=this.adv().line;
    const selector=this.expr();
    this.expect(TK.AS);
    const name=this.expect(TK.ID).v;
    this.match(TK.SEMI);
    return {k:"Query", selector, name, line};
  }

  queryAllStmt() {
    const line=this.adv().line;
    const selector=this.expr();
    this.expect(TK.AS);
    const name=this.expect(TK.ID).v;
    this.match(TK.SEMI);
    return {k:"QueryAll", selector, name, line};
  }

  block() {
    const line=this.expect(TK.LBRACE).line;
    const body=[];
    while(!this.check(TK.RBRACE)&&!this.check(TK.EOF)) body.push(this.stmt());
    this.expect(TK.RBRACE);
    return {k:"Block", body, line};
  }

  exprStmt() {
    const e=this.expr();
    this.match(TK.SEMI);
    return {k:"ExprStmt", expr:e};
  }

  // ── Expression parser (Pratt precedence) ──────────────────
  expr()    { return this.assign(); }

  assign() {
    const left=this.ternary();
    const tok=this.match(TK.ASSIGN,TK.PLUSEQ,TK.MINUSEQ,TK.STAREQ,TK.SLASHEQ,TK.PERCENTEQ,TK.NULLISHEQ);
    if(tok) return {k:"Assign", op:tok.t, left, right:this.assign()};
    return left;
  }

  ternary() {
    let e=this.nullish();
    if(this.match(TK.QUESTION)) {
      const cons=this.expr(); this.expect(TK.COLON); const alt=this.expr();
      return {k:"Ternary", test:e, cons, alt};
    }
    return e;
  }

  nullish() { let l=this.or();  while(this.match(TK.NULLISH))  l={k:"BinOp",op:"??",l,r:this.or()};  return l; }
  or()      { let l=this.and(); while(this.match(TK.OR))        l={k:"BinOp",op:"||",l,r:this.and()}; return l; }
  and()     { let l=this.eq();  while(this.match(TK.AND))       l={k:"BinOp",op:"&&",l,r:this.eq()};  return l; }

  eq() {
    let l=this.cmp(); let t;
    while((t=this.match(TK.EQ,TK.NEQ,TK.SEQ,TK.SNEQ)))
      l={k:"BinOp",op:t.t,l,r:this.cmp()};
    return l;
  }

  cmp() {
    let l=this.add(); let t;
    while((t=this.match(TK.LT,TK.GT,TK.LTE,TK.GTE)))
      l={k:"BinOp",op:t.t,l,r:this.add()};
    return l;
  }

  add() {
    let l=this.mul(); let t;
    while((t=this.match(TK.PLUS,TK.MINUS)))
      l={k:"BinOp",op:t.t,l,r:this.mul()};
    return l;
  }

  mul() {
    let l=this.expo(); let t;
    while((t=this.match(TK.STAR,TK.SLASH,TK.PERCENT)))
      l={k:"BinOp",op:t.t,l,r:this.expo()};
    return l;
  }

  expo() {
    let l=this.unary();
    if(this.match(TK.STARSTAR)) return {k:"BinOp",op:"**",l,r:this.expo()};
    return l;
  }

  unary() {
    let t;
    if((t=this.match(TK.NOT,TK.MINUS,TK.TILDE))) return {k:"Unary",op:t.t,v:this.unary()};
    if(this.check(TK.AWAIT)) { const l=this.adv().line; return {k:"Await",value:this.unary(),line:l}; }
    return this.postfix();
  }

  postfix() {
    let e=this.primary();
    while(true) {
      if(this.match(TK.PLUSPLUS))   { e={k:"PostfixOp",op:"++",v:e}; continue; }
      if(this.match(TK.MINUSMINUS)) { e={k:"PostfixOp",op:"--",v:e}; continue; }
      if(this.match(TK.LPAREN)) {
        const args=[];
        while(!this.check(TK.RPAREN)) {
          const spread=!!this.match(TK.SPREAD);
          args.push({spread, value:this.expr()});
          this.match(TK.COMMA);
        }
        this.expect(TK.RPAREN);
        e={k:"Call",callee:e,args};
        continue;
      }
      if(this.match(TK.LBRACK)) {
        const idx=this.expr(); this.expect(TK.RBRACK);
        e={k:"Index",obj:e,idx};
        continue;
      }
      if(this.match(TK.DOT)) {
        const prop=this.peek().t===TK.ID?this.adv().v:this.expect(TK.ID).v;
        e={k:"Member",obj:e,prop};
        continue;
      }
      // Optional chaining ?.
      if(this.check(TK.QUESTION)&&this.peek(1).t===TK.DOT) {
        this.adv(); this.adv();
        if(this.check(TK.LPAREN)) {
          this.adv();
          const args=[];
          while(!this.check(TK.RPAREN)){const sp=!!this.match(TK.SPREAD);args.push({spread:sp,value:this.expr()});this.match(TK.COMMA);}
          this.expect(TK.RPAREN);
          e={k:"OptCall",obj:e,args};
        } else {
          const prop=this.expect(TK.ID).v;
          e={k:"OptChain",obj:e,prop};
        }
        continue;
      }
      break;
    }
    return e;
  }

  primary() {
    const tok=this.peek();

    if(tok.t===TK.NUM)      { this.adv(); return {k:"Lit",v:tok.v,raw:String(tok.v)}; }
    if(tok.t===TK.STR)      { this.adv(); return {k:"Lit",v:tok.v,raw:JSON.stringify(tok.v)}; }
    if(tok.t===TK.BOOL)     { this.adv(); return {k:"Lit",v:tok.v,raw:String(tok.v)}; }
    if(tok.t===TK.NULL)     { this.adv(); return {k:"Lit",v:null,raw:"null"}; }
    if(tok.t==="TEMPLATE")  { this.adv(); return {k:"Template",parts:tok.parts}; }
    if(tok.t===TK.ID)       { this.adv(); return {k:"Ident",name:tok.v}; }

    // new expression
    if(tok.t===TK.ID&&tok.v==="new") {
      this.adv();
      const callee=this.postfix();
      return {k:"New",callee};
    }

    // fetch(...)
    if(tok.t===TK.FETCH) {
      this.adv(); this.expect(TK.LPAREN);
      const args=[];
      while(!this.check(TK.RPAREN)){const sp=!!this.match(TK.SPREAD);args.push({spread:sp,value:this.expr()});this.match(TK.COMMA);}
      this.expect(TK.RPAREN);
      return {k:"Call",callee:{k:"Ident",name:"fetch"},args};
    }

    if(tok.t===TK.LPAREN) {
      this.adv();
      // Try arrow function
      const savedPos=this.pos;
      try {
        const params=this.parseParams();
        this.expect(TK.RPAREN);
        if(this.match(TK.ARROW)) {
          const body=this.check(TK.LBRACE)?this.block():this.expr();
          return {k:"Arrow",params,body};
        }
        this.pos=savedPos;
      } catch { this.pos=savedPos; }
      const e=this.expr(); this.expect(TK.RPAREN);
      return e;
    }

    if(tok.t===TK.LBRACK) {
      this.adv();
      const elems=[];
      while(!this.check(TK.RBRACK)) {
        const spread=!!this.match(TK.SPREAD);
        elems.push({spread,value:this.expr()});
        this.match(TK.COMMA);
      }
      this.expect(TK.RBRACK);
      return {k:"Array",elems};
    }

    if(tok.t===TK.LBRACE) {
      this.adv();
      const props=[];
      while(!this.check(TK.RBRACE)) {
        if(this.match(TK.SPREAD)) { props.push({spread:true,value:this.expr()}); }
        else {
          const keyTok=this.peek();
          let key, computed=false;
          if(keyTok.t===TK.STR) { this.adv(); key=keyTok.v; }
          else if(keyTok.t===TK.LBRACK) {
            this.adv(); key=this.expr(); this.expect(TK.RBRACK); computed=true;
          }
          else { key=this.expect(TK.ID).v; }

          if(this.match(TK.LPAREN)) {
            // Method shorthand: { foo(x) { return x } }
            const params=this.parseParams(); this.expect(TK.RPAREN);
            const body=this.block();
            props.push({key, method:true, value:{k:"Arrow",params,body}, computed});
          } else if(this.match(TK.COLON)) {
            props.push({key, value:this.expr(), computed});
          } else {
            props.push({key, value:{k:"Ident",name:key}, shorthand:true, computed});
          }
        }
        this.match(TK.COMMA);
      }
      this.expect(TK.RBRACE);
      return {k:"Obj",props};
    }

    if(tok.t===TK.FUNC) return this.funcDecl(false);
    if(tok.t===TK.ASYNC) { this.adv(); this.expect(TK.FUNC); return this.funcDecl(true); }

    throw new ParseError(`Unexpected token '${tok.t}'${tok.v?` (${tok.v})`:""}`, tok, this.filename);
  }
}

module.exports = { Parser };
