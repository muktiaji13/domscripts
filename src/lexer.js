"use strict";
// ─────────────────────────────────────────────────────────────
// DomScript Lexer v3  —  src/lexer.js
// ─────────────────────────────────────────────────────────────

const TK = {
  // Literals
  NUM:"NUM", STR:"STR", BOOL:"BOOL", NULL:"NULL",
  // Identifiers / keywords
  ID:"ID",
  // Control
  LET:"let", CONST:"const", FUNC:"func", RETURN:"return",
  IF:"if", ELSE:"else", WHILE:"while", FOR:"for", OF:"of", IN:"in",
  BREAK:"break", CONTINUE:"continue", SWITCH:"switch", CASE:"case", DEFAULT:"default",
  // Async / API
  ASYNC:"async", AWAIT:"await", FETCH:"fetch",
  TRY:"try", CATCH:"catch", FINALLY:"finally", THROW:"throw",
  // Module
  IMPORT:"import", EXPORT:"export", FROM:"from", AS:"as",
  // DOM
  CREATE:"create", SETTEXT:"setText", SETATTR:"setAttr", SETSTYLE:"setStyle",
  ADDCLASS:"addClass", REMOVECLASS:"removeClass", TOGGLECLASS:"toggleClass",
  APPEND:"append", PREPEND:"prepend", REMOVE:"remove",
  ON:"on", OFF:"off", EMIT:"emit",
  MOUNT:"mount", UNMOUNT:"unmount", QUERY:"query", QUERYALL:"queryAll",
  SETHTML:"setHtml", GETTEXT:"getText", GETATTR:"getAttr",
  // I/O
  LOG:"log", WARN:"warn", ERROR:"error",
  // Operators
  PLUS:"+", MINUS:"-", STAR:"*", SLASH:"/", PERCENT:"%", STARSTAR:"**",
  PLUSEQ:"+=", MINUSEQ:"-=", STAREQ:"*=", SLASHEQ:"/=", PERCENTEQ:"%=",
  PLUSPLUS:"++", MINUSMINUS:"--",
  EQ:"==", NEQ:"!=", SEQ:"===", SNEQ:"!==",
  LT:"<", GT:">", LTE:"<=", GTE:">=",
  AND:"&&", OR:"||", NOT:"!", NULLISH:"??", NULLISHEQ:"??=",
  ASSIGN:"=", QUESTION:"?", COLON:":", SPREAD:"...", ARROW:"=>",
  AMPERSAND:"&", PIPE:"|", CARET:"^", TILDE:"~",
  // Punctuation
  LPAREN:"(", RPAREN:")", LBRACE:"{", RBRACE:"}",
  LBRACK:"[", RBRACK:"]",
  SEMI:";", COMMA:",", DOT:".", AT:"@",
  EOF:"EOF",
};

const KEYWORDS = new Set([
  TK.LET,TK.CONST,TK.FUNC,TK.RETURN,
  TK.IF,TK.ELSE,TK.WHILE,TK.FOR,TK.OF,TK.IN,TK.BREAK,TK.CONTINUE,
  TK.SWITCH,TK.CASE,TK.DEFAULT,
  TK.ASYNC,TK.AWAIT,TK.FETCH,TK.TRY,TK.CATCH,TK.FINALLY,TK.THROW,
  TK.IMPORT,TK.EXPORT,TK.FROM,TK.AS,
  TK.CREATE,TK.SETTEXT,TK.SETATTR,TK.SETSTYLE,
  TK.ADDCLASS,TK.REMOVECLASS,TK.TOGGLECLASS,
  TK.APPEND,TK.PREPEND,TK.REMOVE,
  TK.ON,TK.OFF,TK.EMIT,
  TK.MOUNT,TK.UNMOUNT,TK.QUERY,TK.QUERYALL,
  TK.SETHTML,TK.GETTEXT,TK.GETATTR,
  TK.LOG,TK.WARN,TK.ERROR,
]);

class LexError extends Error {
  constructor(msg, line, col, file) {
    super(`[LexError] ${file||""}:${line}:${col}  ${msg}`);
    this.line=line; this.col=col; this.file=file;
  }
}

class Lexer {
  constructor(src, filename="<stdin>") {
    this.src=src; this.filename=filename;
    this.pos=0; this.line=1; this.col=1;
  }

  err(msg) { throw new LexError(msg, this.line, this.col, this.filename); }
  peek(d=0) { return this.src[this.pos+d]; }
  adv() {
    const c=this.src[this.pos++];
    if(c==="\n"){this.line++;this.col=1;}else this.col++;
    return c;
  }

  skip() {
    while(this.pos < this.src.length) {
      const c = this.peek();
      if(" \t\r\n".includes(c)) { this.adv(); continue; }
      // single-line comment
      if(c==="/"&&this.peek(1)==="/") {
        while(this.pos<this.src.length&&this.peek()!=="\n") this.adv();
        continue;
      }
      // multi-line comment
      if(c==="/"&&this.peek(1)==="*") {
        this.adv(); this.adv();
        while(this.pos<this.src.length) {
          if(this.peek()==="*"&&this.peek(1)==="/"){this.adv();this.adv();break;}
          this.adv();
        }
        continue;
      }
      // shebang line
      if(c==="#"&&this.peek(1)==="!"&&this.line===1) {
        while(this.pos<this.src.length&&this.peek()!=="\n") this.adv();
        continue;
      }
      break;
    }
  }

  readStr(q) {
    this.adv();
    let s="";
    while(this.pos<this.src.length && this.peek()!==q) {
      if(this.peek()==="\\") {
        this.adv();
        const esc={n:"\n",t:"\t",r:"\r","\\":"\\","'":"'",'"':'"','0':'\0'};
        s+=esc[this.peek()]??this.peek();
        this.adv();
      } else {
        s+=this.adv();
      }
    }
    if(this.pos>=this.src.length) this.err("Unterminated string");
    this.adv();
    return s;
  }

  // Template literal with ${expr} interpolation
  readTemplate() {
    this.adv(); // consume `
    const parts = [];
    let raw = "";
    while(this.pos<this.src.length && this.peek()!=="`") {
      if(this.peek()==="$" && this.peek(1)==="{") {
        parts.push({type:"text", value:raw}); raw="";
        this.adv(); this.adv(); // consume ${
        let src=""; let depth=1;
        while(this.pos<this.src.length && depth>0) {
          if(this.peek()==="{") depth++;
          if(this.peek()==="}") { depth--; if(depth===0){this.adv();break;} }
          src+=this.adv();
        }
        parts.push({type:"expr", src});
      } else if(this.peek()==="\\") {
        this.adv();
        const esc={n:"\n",t:"\t","\\":"\\","`":"`","$":"$"};
        raw+=esc[this.peek()]??this.peek(); this.adv();
      } else {
        raw+=this.adv();
      }
    }
    parts.push({type:"text", value:raw});
    if(this.pos<this.src.length) this.adv(); // consume `
    return parts;
  }

  tokenize() {
    const toks=[];
    while(true) {
      this.skip();
      if(this.pos>=this.src.length){toks.push({t:TK.EOF,line:this.line,col:this.col});break;}
      const line=this.line, col=this.col, c=this.peek();

      // Template literal
      if(c==="`") {
        const parts=this.readTemplate();
        toks.push({t:"TEMPLATE",parts,line,col});
        continue;
      }

      // String
      if(c==='"'||c==="'") {
        toks.push({t:TK.STR, v:this.readStr(c), line, col});
        continue;
      }

      // Number (hex, binary, decimal, scientific)
      if(/\d/.test(c)||(c==="."&&/\d/.test(this.peek(1)))) {
        this.adv(); // consume first char c
        let n = c;
        if(c==="0"&&(this.peek()==="x"||this.peek()==="X")) {
          n += this.adv(); // x/X
          while(this.pos<this.src.length&&/[0-9a-fA-F_]/.test(this.peek())){const ch=this.adv();if(ch!=="_")n+=ch;}
          toks.push({t:TK.NUM,v:parseInt(n,16),line,col}); continue;
        }
        if(c==="0"&&(this.peek()==="b"||this.peek()==="B")) {
          n += this.adv(); // b/B
          while(this.pos<this.src.length&&/[01_]/.test(this.peek())){const ch=this.adv();if(ch!=="_")n+=ch;}
          toks.push({t:TK.NUM,v:Number(n),line,col}); continue;
        }
        while(this.pos<this.src.length&&/[\d._]/.test(this.peek())){const ch=this.adv();if(ch!=="_")n+=ch;}
        if(this.peek()==="e"||this.peek()==="E"){n+=this.adv();if(this.peek()==="+"||this.peek()==="-")n+=this.adv();while(this.pos<this.src.length&&/\d/.test(this.peek()))n+=this.adv();}
        toks.push({t:TK.NUM,v:parseFloat(n),line,col}); continue;
      }

      // Identifier / keyword
      if(/[a-zA-Z_$]/.test(c)) {
        this.adv(); // consume first char c
        let id = c;
        while(this.pos<this.src.length&&/[\w$]/.test(this.peek()))id+=this.adv();
        if(id==="true") toks.push({t:TK.BOOL,v:true,line,col});
        else if(id==="false") toks.push({t:TK.BOOL,v:false,line,col});
        else if(id==="null") toks.push({t:TK.NULL,line,col});
        else if(id==="undefined") toks.push({t:TK.NULL,v:undefined,line,col});
        else if(KEYWORDS.has(id)) toks.push({t:id,line,col});
        else toks.push({t:TK.ID,v:id,line,col});
        continue;
      }

      this.adv();
      const four=c+this.peek()+this.peek(1)+this.peek(2);
      const three=c+this.peek()+this.peek(1);
      const two=c+this.peek();

      // 4-char (none yet, reserved)
      // 3-char
      const t3={"===":TK.SEQ,"!==":TK.SNEQ,"...":TK.SPREAD,"**=":"**="};
      if(t3[three]){this.adv();this.adv();toks.push({t:t3[three],line,col});continue;}

      // 2-char
      const t2={
        "==":TK.EQ,"!=":TK.NEQ,"<=":TK.LTE,">=":TK.GTE,
        "&&":TK.AND,"||":TK.OR,"??":TK.NULLISH,
        "+=":TK.PLUSEQ,"-=":TK.MINUSEQ,"*=":TK.STAREQ,"/=":TK.SLASHEQ,"%=":TK.PERCENTEQ,
        "++":TK.PLUSPLUS,"--":TK.MINUSMINUS,"=>":TK.ARROW,
        "**":TK.STARSTAR,"??=":TK.NULLISHEQ,
      };
      if(t2[two]){this.adv();toks.push({t:t2[two],line,col});continue;}

      // 1-char
      const t1={
        "+":TK.PLUS,"-":TK.MINUS,"*":TK.STAR,"/":TK.SLASH,"%":TK.PERCENT,
        "<":TK.LT,">":TK.GT,"=":TK.ASSIGN,"!":TK.NOT,
        "&":TK.AMPERSAND,"|":TK.PIPE,"^":TK.CARET,"~":TK.TILDE,
        "(":TK.LPAREN,")":TK.RPAREN,"{":TK.LBRACE,"}":TK.RBRACE,
        "[":TK.LBRACK,"]":TK.RBRACK,
        ";":TK.SEMI,",":TK.COMMA,".":TK.DOT,"?":TK.QUESTION,":":TK.COLON,"@":TK.AT,
      };
      if(t1[c]){toks.push({t:t1[c],line,col});continue;}

      this.err(`Unknown character: '${c}'`);
    }
    return toks;
  }
}

module.exports = { Lexer, TK, KEYWORDS };
