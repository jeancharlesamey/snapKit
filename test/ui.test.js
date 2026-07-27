// SnapKit UI tests. The plugin UI is an HTML string inside code.js, so this
// extracts it, runs its inline <script> against a tiny DOM stub, and asserts
// the type-filter popover wiring posts the right pluginMessage.
// No dependencies — run with: node test/ui.test.js

'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');
var assert = require('assert');

var CODE = fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8');

// --- extract the UI html and its inline script -------------------------------
function extractUi() {
  var match = CODE.match(/^var uiHtml = '([\s\S]*?)';$/m);
  assert.ok(match, 'could not find the uiHtml string in code.js');
  var html = match[1].replace(/<\\\//g, '</'); // un-escape <\/script>
  var script = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(script, 'could not find the inline UI script');
  return { html: html, script: script[1] };
}

// --- minimal DOM stub -------------------------------------------------------
// Only what the UI script touches: getElementById, querySelectorAll,
// classList, attributes, onclick and parent.postMessage.
function makeElement(id, attrs) {
  var classes = ((attrs && attrs['class']) || '').split(' ').filter(Boolean);
  var el = {
    id: id,
    onclick: null,
    disabled: false,
    value: '',
    title: (attrs && attrs.title) || '',
    textContent: '',
    className: classes.join(' '),
    _attrs: attrs || {},
    classList: {
      add: function(c) { if (classes.indexOf(c) === -1) classes.push(c); el.className = classes.join(' '); },
      remove: function(c) { classes = classes.filter(function(x) { return x !== c; }); el.className = classes.join(' '); },
      contains: function(c) { return classes.indexOf(c) !== -1; }
    },
    getAttribute: function(name) { return el._attrs[name] != null ? el._attrs[name] : null; },
    querySelectorAll: function() { return []; }
  };
  // Fire onclick the way a browser would: this element, then bubble to body.
  el.click = function(dom) {
    var stopped = false;
    var event = { stopPropagation: function() { stopped = true; } };
    if (el.onclick) el.onclick.call(el, event);
    if (!stopped && dom.body.onclick) dom.body.onclick.call(dom.body, event);
  };
  return el;
}

// Parse the ids and the popover options out of the html so the stub mirrors it.
function makeDom(html) {
  var elements = {};
  var idRe = /<(\w+)\b([^>]*)\bid="([^"]+)"([^>]*)>/g;
  var tag;
  while ((tag = idRe.exec(html)) !== null) {
    var raw = tag[2] + tag[4];
    var attrs = {};
    var attrRe = /(\w[\w-]*)="([^"]*)"/g;
    var a;
    while ((a = attrRe.exec(raw)) !== null) attrs[a[1]] = a[2];
    elements[tag[3]] = makeElement(tag[3], attrs);
  }

  // The popover's options have no ids — collect them by data-type, in order.
  var options = [];
  var optRe = /<button class="([^"]*popover-option[^"]*)" data-type="([^"]+)"/g;
  var o;
  while ((o = optRe.exec(html)) !== null) {
    options.push(makeElement('option-' + o[2], { 'class': o[1], 'data-type': o[2] }));
  }
  assert.ok(options.length > 0, 'expected popover options in the html');

  var dom = {
    body: { onclick: null },
    getElementById: function(id) {
      assert.ok(elements[id], 'UI script asked for unknown element id: ' + id);
      return elements[id];
    },
    _elements: elements,
    _options: options
  };
  elements.filterPopover.querySelectorAll = function(selector) {
    return selector === '.popover-option' ? options : [];
  };
  return dom;
}

function loadUi() {
  var ui = extractUi();
  var dom = makeDom(ui.html);
  var posted = [];
  var ctx = {
    document: dom,
    window: {},
    parent: { postMessage: function(msg) { posted.push(msg.pluginMessage); } },
    setTimeout: function() {},
    console: console
  };
  ctx.document.body = dom.body;
  vm.createContext(ctx);
  vm.runInContext(ui.script, ctx, { filename: 'ui.js' });
  return { dom: dom, posted: posted, ctx: ctx, el: dom._elements, options: dom._options };
}

// Posted messages come from another vm context, so their prototype differs from
// this realm's Object — compare them structurally.
function assertLastMessage(ui, expected) {
  var actual = ui.posted[ui.posted.length - 1];
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
}

function optionFor(ui, type) {
  var match = ui.options.filter(function(o) { return o.getAttribute('data-type') === type; });
  assert.strictEqual(match.length, 1, 'expected exactly one "' + type + '" option');
  return match[0];
}

// --- tiny test runner -------------------------------------------------------
var passed = 0;
var failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name);
    console.log('      ' + (e && e.message ? e.message : e));
  }
}

console.log('SnapKit UI tests\n');

test('the popover offers all / component / non-component and starts on all', function() {
  var ui = loadUi();
  var types = ui.options.map(function(o) { return o.getAttribute('data-type'); });
  assert.deepStrictEqual(types, ['all', 'component', 'non-component']);
  assert.ok(optionFor(ui, 'all').classList.contains('selected'), 'All types should be preselected');
  assert.ok(!ui.el.filterBtn.classList.contains('filtered'), 'no filter dot while on the default');
});

test('the filter button toggles the popover open and closed', function() {
  var ui = loadUi();
  assert.ok(!ui.el.filterPopover.classList.contains('show'));
  ui.el.filterBtn.click(ui.dom);
  assert.ok(ui.el.filterPopover.classList.contains('show'), 'first click opens');
  ui.el.filterBtn.click(ui.dom);
  assert.ok(!ui.el.filterPopover.classList.contains('show'), 'second click closes');
});

test('clicking outside closes the popover', function() {
  var ui = loadUi();
  ui.el.filterBtn.click(ui.dom);
  ui.dom.body.onclick();
  assert.ok(!ui.el.filterPopover.classList.contains('show'));
  assert.ok(!ui.el.filterBtn.classList.contains('open'));
});

test('choosing a type marks it, flags the button and closes the popover', function() {
  var ui = loadUi();
  ui.el.filterBtn.click(ui.dom);
  optionFor(ui, 'component').click(ui.dom);
  assert.ok(optionFor(ui, 'component').classList.contains('selected'));
  assert.ok(!optionFor(ui, 'all').classList.contains('selected'), 'only one option stays selected');
  assert.ok(ui.el.filterBtn.classList.contains('filtered'), 'active filter shows the dot');
  assert.ok(/components only/.test(ui.el.filterBtn.title), 'tooltip names the filter');
  assert.ok(!ui.el.filterPopover.classList.contains('show'), 'picking an option closes the popover');
});

test('going back to all types clears the filter flag', function() {
  var ui = loadUi();
  optionFor(ui, 'non-component').click(ui.dom);
  assert.ok(ui.el.filterBtn.classList.contains('filtered'));
  optionFor(ui, 'all').click(ui.dom);
  assert.ok(!ui.el.filterBtn.classList.contains('filtered'));
});

test('select buttons send the active type filter', function() {
  var ui = loadUi();
  ui.el.frameName.value = ' Card ';
  optionFor(ui, 'component').click(ui.dom);

  ui.el.selectBtn.click(ui.dom);
  assertLastMessage(ui, { type: 'select-frame', name: 'Card', typeFilter: 'component' });

  optionFor(ui, 'non-component').click(ui.dom);
  ui.el.selectAbsoluteBtn.click(ui.dom);
  assertLastMessage(ui, { type: 'select-absolute', name: 'Card', typeFilter: 'non-component' });
});

test('select buttons default to the all-types filter', function() {
  var ui = loadUi();
  ui.el.frameName.value = 'Header';
  ui.el.selectBtn.click(ui.dom);
  assertLastMessage(ui, { type: 'select-frame', name: 'Header', typeFilter: 'all' });
});

test('an empty name field posts nothing', function() {
  var ui = loadUi();
  ui.el.frameName.value = '   ';
  var before = ui.posted.length;
  ui.el.selectBtn.click(ui.dom);
  ui.el.selectAbsoluteBtn.click(ui.dom);
  assert.strictEqual(ui.posted.length, before, 'should show an error instead of searching');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
