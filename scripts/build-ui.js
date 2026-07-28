#!/usr/bin/env node
// Builds ui.html — the single file Figma loads as the plugin UI.
//
// Figma serves the UI from a sandboxed iframe with no document base, so a
// <link> or a <script src> to a sibling file never resolves. This script takes
// ui/index.html and inlines every local stylesheet and script it references,
// which is what lets the sources stay split (vendored design system / the local
// overrides of it / SnapKit's own styles / SnapKit script) instead of living in
// one unreadable blob. Order is taken from ui/index.html and matters: the DS
// first, then ui/ds-overrides.css, so the overrides win on source order.
//
//   node scripts/build-ui.js          rebuild ui.html
//   node scripts/build-ui.js --check  fail if ui.html is out of date
//
// No dependencies — Node built-ins only.

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SOURCE_DIR = path.join(ROOT, 'ui');
var SOURCE = path.join(SOURCE_DIR, 'index.html');
var OUTPUT = path.join(ROOT, 'ui.html');

var BANNER = [
  '<!-- GENERATED FILE — do not edit.',
  '     Built from ui/index.html by scripts/build-ui.js (npm run build:ui).',
  '     Edit ui/index.html, ui/ds-overrides.css, ui/snapkit.css',
  '     or ui/snapkit.js instead. -->'
].join('\n');

// The vendored design system pulls Inter from rsms.me. A Figma plugin has no
// network access unless the manifest asks for it, and asking would defeat the
// point of vendoring, so remote webfonts are dropped and ui/ds-overrides.css
// falls back to a local font stack. Doing it here keeps the vendored file
// pristine.
function stripRemoteFontFaces(css) {
  var out = '';
  var index = 0;
  while (true) {
    var start = css.indexOf('@font-face', index);
    if (start === -1) {
      out += css.slice(index);
      return out;
    }
    var open = css.indexOf('{', start);
    var end = css.indexOf('}', open);
    if (open === -1 || end === -1) {
      out += css.slice(index);
      return out;
    }
    var block = css.slice(start, end + 1);
    out += css.slice(index, start);
    if (!/url\(\s*["']?https?:/i.test(block)) out += block;
    index = end + 1;
  }
}

function readAsset(href) {
  var file = path.join(SOURCE_DIR, href);
  if (!fs.existsSync(file)) {
    throw new Error('ui/index.html references a file that does not exist: ' + href);
  }
  return fs.readFileSync(file, 'utf8').replace(/\s+$/, '');
}

function build() {
  var html = fs.readFileSync(SOURCE, 'utf8');

  html = html.replace(/[ \t]*<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, function(match, href) {
    if (/^https?:/i.test(href)) {
      throw new Error('remote stylesheet in ui/index.html: ' + href + ' — vendor it under ui/vendor instead');
    }
    return '<style>\n/* ' + href + ' */\n' + stripRemoteFontFaces(readAsset(href)) + '\n</style>';
  });

  html = html.replace(/[ \t]*<script\s+src="([^"]+)"\s*><\/script>/g, function(match, src) {
    if (/^https?:/i.test(src)) {
      throw new Error('remote script in ui/index.html: ' + src + ' — vendor it under ui/vendor instead');
    }
    return '<script>\n' + readAsset(src) + '\n</script>';
  });

  if (/<link\s+rel="stylesheet"/.test(html) || /<script\s+src=/.test(html)) {
    throw new Error('ui.html still references an external file after inlining');
  }

  return html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + BANNER);
}

module.exports = { build: build, OUTPUT: OUTPUT };

if (require.main === module) {
  var built = build();
  if (process.argv.indexOf('--check') !== -1) {
    var current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (current !== built) {
      console.error('ui.html is out of date — run: npm run build:ui');
      process.exit(1);
    }
    console.log('ui.html is up to date');
  } else {
    fs.writeFileSync(OUTPUT, built);
    console.log('wrote ' + path.relative(ROOT, OUTPUT) + ' (' + built.length + ' bytes)');
  }
}
