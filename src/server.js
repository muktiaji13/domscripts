"use strict";
// ─────────────────────────────────────────────────────────────
// DomScript Dev Server  —  src/server.js
// HTTP + WebSocket live-reload server
// ─────────────────────────────────────────────────────────────

const http = require("http");
const fs   = require("fs");
const path = require("path");
const net  = require("net");

const MIME = {
  ".html":"text/html;charset=utf-8", ".js":"application/javascript;charset=utf-8",
  ".css":"text/css;charset=utf-8",   ".json":"application/json",
  ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml",
  ".ico":"image/x-icon", ".woff2":"font/woff2", ".woff":"font/woff",
  ".ttf":"font/ttf", ".map":"application/json",
};

// Tiny WebSocket server (no dependencies)
class WSServer {
  constructor(httpServer) {
    this.clients = new Set();
    httpServer.on("upgrade", (req, socket, head) => {
      const key = req.headers["sec-websocket-key"];
      if(!key) { socket.destroy(); return; }
      const accept = require("crypto")
        .createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      socket.on("error", () => this.clients.delete(socket));
      socket.on("close", () => this.clients.delete(socket));
      this.clients.add(socket);
    });
  }

  broadcast(msg) {
    const data = Buffer.from(msg, "utf8");
    const frame = Buffer.allocUnsafe(2 + data.length);
    frame[0] = 0x81; // FIN + text
    frame[1] = data.length;
    data.copy(frame, 2);
    for(const client of this.clients) {
      try { client.write(frame); } catch { this.clients.delete(client); }
    }
  }
}

// Live-reload script injected into HTML
const LIVERELOAD_SCRIPT = `
<script>
(function(){
  let ws, retry=0;
  function connect(){
    ws=new WebSocket("ws://"+location.host+"/__ds_live");
    ws.onmessage=function(e){if(e.data==="reload")location.reload();};
    ws.onclose=function(){if(retry++<50)setTimeout(connect,500);};
    ws.onerror=function(){ws.close();};
  }
  connect();
  console.log("[DomScript] Live reload connected");
})();
</script>`;

function createServer(opts={}) {
  const { root="dist", port=3000, onReload } = opts;
  const absRoot = path.resolve(root);

  const httpServer = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if(urlPath === "/") urlPath = "/index.html";

    const filePath = path.join(absRoot, urlPath);

    // Security: prevent path traversal
    if(!filePath.startsWith(absRoot)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }

    let target = filePath;
    // Try appending .html if not found
    if(!fs.existsSync(target) && fs.existsSync(target + ".html")) target += ".html";
    // Try index.html in directory
    if(!fs.existsSync(target) && fs.existsSync(path.join(target, "index.html")))
      target = path.join(target, "index.html");

    if(!fs.existsSync(target)) {
      res.writeHead(404, {"Content-Type":"text/plain"});
      res.end(`Not found: ${urlPath}`);
      return;
    }

    const ext = path.extname(target).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    let content = fs.readFileSync(target);

    // Inject live-reload into HTML
    if(ext === ".html") {
      let html = content.toString("utf8");
      if(!html.includes("__ds_live")) {
        html = html.replace("</body>", LIVERELOAD_SCRIPT + "\n</body>");
        if(!html.includes("</body>")) html += LIVERELOAD_SCRIPT;
      }
      content = Buffer.from(html, "utf8");
    }

    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
  });

  const ws = new WSServer(httpServer);

  function reload() {
    ws.broadcast("reload");
    if(onReload) onReload();
  }

  return { httpServer, ws, reload, start(cb) {
    httpServer.listen(port, "0.0.0.0", () => {
      if(cb) cb(port);
    });
  }};
}

module.exports = { createServer };
