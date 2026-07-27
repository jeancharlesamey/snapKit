// SnapKit UI tests. The plugin UI is a single HTML string inside code.js, so
// this extracts it, runs its inline <script> against a tiny DOM stub, and
// asserts the wiring: the element-type filter popover, the loader overlay and
// the context-aware button states.
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
// Only what the UI script touches: getElementById, querySelectorAll, classList,
// getAttribute, onclick, offsetWidth and parent.postMessage.
function makeElement(id, attrs) {
  attrs = attrs || {};
  var classes = (attrs['class'] || '').split(' ').filter(Boolean);
  var el = {
    id: id,
    onclick: null,
    disabled: false,
    value: '',
    title: attrs.title || '',
    textContent: '',
    offsetWidth: 0,
    className: classes.join(' '),
    _attrs: attrs,
    classList: {
      add: function(c) {
        if (classes.indexOf(c) === -1) classes.push(c);
        el.className = classes.join(' ');
      },
      remove: function(c) {
        classes = classes.filter(function(x) { return x !== c; });
        el.className = classes.join(' ');
      },
      contains: function(c) { return classes.indexOf(c) !== -1; },
      toggle: function(c, force) {
        var on = arguments.length > 1 ? !!force : classes.indexOf(c) === -1;
        if (on) el.classList.add(c); else el.classList.remove(c);
        return on;
      }
    },
    getAttribute: function(name) { return el._attrs[name] != null ? el._attrs[name] : null; },
    querySelectorAll: function() { return []; }
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
    var attrRe = /([\w-]+)="([^"]*)"/g;
    var a;
    while ((a = attrRe.exec(raw)) !== null) attrs[a[1]] = a[2];
    elements[tag[3]] = makeElement(tag[3], attrs);
  }

  // The popover options have no ids — collect them by data-type, in order.
  var options = [];
  var optRe = /<button class="([^"]*popover-option[^"]*)" data-type="([^"]+)"/g;
  var o;
  while ((o = optRe.exec(html)) !== null) {
    options.push(makeElement('option-' + o[2], { 'class': o[1], 'data-type': o[2] }));
  }
  assert.ok(options.length > 0, 'expected popover options in the html');

  var body = makeElement('body', {});
  var dom = {
    body: body,
    getElementById: function(id) {
      assert.ok(elements[id], 'UI script asked for an unknown element id: ' + id);
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

// Load the UI script and return handles for driving it.
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
  vm.createContext(ctx);
  vm.runInContext(ui.script, ctx, { filename: 'uiHtml' });

  // Fire onclick the way a browser would: the element, then bubble to body.
  function click(el) {
    var stopped = false;
    var event = { stopPropagation: function() { stopped = true; }, shiftKey: false };
    if (el.onclick) el.onclick.call(el, event);
    if (!stopped && dom.body.onclick) dom.body.onclick.call(dom.body, event);
  }

  return {
    html: ui.html,
    el: function(id) { return dom._elements[id]; },
    option: function(type) {
      var found = dom._options.filter(function(o) { return o.getAttribute('data-type') === type; })[0];
      assert.ok(found, 'no popover option for data-type=' + type);
      return found;
    },
    options: dom._options,
    body: dom.body,
    click: click,
    posted: posted,
    // Objects built inside the vm have a foreign prototype, so compare as JSON.
    lastPosted: function() { return posted.length ? JSON.parse(JSON.stringify(posted[posted.length - 1])) : null; },
    send: function(msg) { ctx.window.onmessage({ data: { pluginMessage: msg } }); }
  };
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

test('the UI script loads and asks for the current selection on startup', function() {
  var ui = loadUi();
  assert.deepStrictEqual(ui.lastPosted(), { type: 'check-selection' });
});

test('the filter popover offers exactly the three known element types', function() {
  var ui = loadUi();
  var types = ui.options.map(function(o) { return o.getAttribute('data-type'); });
  assert.deepStrictEqual(types, ['all', 'component', 'non-component']);
});

test('All types is preselected and the filter icon shows no active dot', function() {
  var ui = loadUi();
  assert.ok(ui.option('all').classList.contains('selected'), 'All types should start selected');
  assert.ok(!ui.option('component').classList.contains('selected'));
  assert.ok(!ui.el('filterBtn').classList.contains('active'), 'no dot while the default filter is on');
});

test('clicking the filter icon opens the popover, clicking it again closes it', function() {
  var ui = loadUi();
  ui.click(ui.el('filterBtn'));
  assert.ok(ui.el('filterPopover').classList.contains('show'), 'popover should open');
  ui.click(ui.el('filterBtn'));
  assert.ok(!ui.el('filterPopover').classList.contains('show'), 'popover should close again');
});

test('clicking anywhere else closes the popover', function() {
  var ui = loadUi();
  ui.click(ui.el('filterBtn'));
  ui.click(ui.el('duplicateBtn'));
  assert.ok(!ui.el('filterPopover').classList.contains('show'), 'a click outside should close the popover');
});

test('choosing a type marks it, flags the icon and closes the popover', function() {
  var ui = loadUi();
  ui.click(ui.el('filterBtn'));
  ui.click(ui.option('component'));
  assert.ok(ui.option('component').classList.contains('selected'), 'chosen option should be marked');
  assert.ok(!ui.option('all').classList.contains('selected'), 'the previous option should be unmarked');
  assert.ok(ui.el('filterBtn').classList.contains('active'), 'the icon should show the active dot');
  assert.ok(!ui.el('filterPopover').classList.contains('show'), 'choosing should close the popover');
  assert.ok(/components only/.test(ui.el('filterBtn').title), 'the tooltip should name the filter: ' + ui.el('filterBtn').title);
});

test('going back to All types clears the active dot', function() {
  var ui = loadUi();
  ui.click(ui.option('non-component'));
  assert.ok(ui.el('filterBtn').classList.contains('active'));
  ui.click(ui.option('all'));
  assert.ok(!ui.el('filterBtn').classList.contains('active'), 'the dot should clear on the default filter');
});

test('Select sends the name and the active type filter', function() {
  var ui = loadUi();
  ui.el('frameName').value = ' Card ';
  ui.click(ui.el('selectBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-frame', name: 'Card', typeFilter: 'all' });

  ui.click(ui.option('component'));
  ui.click(ui.el('selectBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-frame', name: 'Card', typeFilter: 'component' });
});

test('the type filter sticks across searches until it is changed', function() {
  var ui = loadUi();
  ui.el('frameName').value = 'Card';
  ui.click(ui.option('non-component'));
  ui.click(ui.el('selectBtn'));
  ui.click(ui.el('selectBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-frame', name: 'Card', typeFilter: 'non-component' });
});

test('Select absolute sends the type filter too, and allows an empty name', function() {
  var ui = loadUi();
  ui.click(ui.option('component'));
  ui.click(ui.el('selectAbsoluteBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-absolute', name: '', typeFilter: 'component' });
});

test('Select with an empty name shows an error instead of searching', function() {
  var ui = loadUi();
  var before = ui.posted.length;
  ui.click(ui.el('selectBtn'));
  assert.strictEqual(ui.posted.length, before, 'nothing should be posted for an empty name');
  assert.ok(/enter a component name/i.test(ui.el('message').textContent), 'expected an error message');
});

test('the loader overlay shows during a search and hides on the result', function() {
  var ui = loadUi();
  ui.el('frameName').value = 'Card';
  ui.click(ui.el('selectBtn'));
  assert.ok(ui.el('overlay').classList.contains('show'), 'overlay should show while searching');
  ui.send({ type: 'success', text: 'Found and selected 2 element(s)' });
  assert.ok(!ui.el('overlay').classList.contains('show'), 'overlay should hide on success');

  ui.click(ui.el('selectBtn'));
  ui.send({ type: 'error', text: 'No elements found' });
  assert.ok(!ui.el('overlay').classList.contains('show'), 'overlay should hide on error too');
});

test('selection-change disables Set to absolute for an already-absolute selection', function() {
  var ui = loadUi();
  ui.send({ type: 'selection-change', hasSelection: true, hasAbsolute: true, hasNonAbsolute: false, hasContainer: false });
  assert.ok(ui.el('absoluteBtn').disabled, 'Set to absolute should be disabled');
  assert.ok(!ui.el('removeAbsBtn').disabled, 'Remove absolute should stay available');
  assert.ok(!ui.el('duplicateBtn').disabled, 'Duplicate should be enabled with a selection');
});

test('selection-change with nothing selected keeps Remove absolute available', function() {
  var ui = loadUi();
  ui.send({ type: 'selection-change', hasSelection: false, hasAbsolute: false, hasNonAbsolute: false, hasContainer: false });
  assert.ok(!ui.el('removeAbsBtn').disabled, 'Remove absolute works page-wide with no selection');
  assert.ok(ui.el('duplicateBtn').disabled, 'Duplicate needs a selection');
  assert.ok(ui.el('deleteBtn').disabled, 'Delete needs a selection');
});

test('the UI string stays parseable: single-quoted, with an escaped script tag', function() {
  var line = CODE.split('\n').filter(function(l) { return /^var uiHtml = /.test(l); });
  assert.strictEqual(line.length, 1, 'uiHtml must stay on one line');
  var inner = line[0].slice('var uiHtml = '.length + 1, -2);
  assert.strictEqual(inner.indexOf("'"), -1, 'no single quotes allowed inside the uiHtml string');
  assert.ok(/<\\\/script>/.test(line[0]), 'the closing script tag must stay escaped as <\\/script>');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
