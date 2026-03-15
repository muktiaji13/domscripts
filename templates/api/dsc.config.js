// dsc.config.js — Konfigurasi project DomScript
module.exports = {
  entry:  "src/main.ds",
  output: "dist/bundle.js",
  serve:  "dist",
  port:   3000,
  bundle: true,
  minify: false,
};
