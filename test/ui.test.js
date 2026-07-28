// SnapKit UI tests. The panel is built from ui/index.html + ui/snapkit.css +
// ui/snapkit.js into ui.html (see scripts/build-ui.js), so this reads the built
// file, runs its inline <script> against a tiny DOM stub, and asserts the
// wiring: the element-type filter menu, the visibility radio group, the loader
// overlay and the context-aware button states.
// No dependencies — run with: node test/ui.test.js

'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');
var assert = require('assert');

var buildUi = require('../scripts/build-ui.js');

var UI_FILE = path.join(__dirname, '..', 'ui.html');
var HTML = fs.readFileSync(UI_FILE, 'utf8');

// --- extract the inline script ----------------------------------------------
function extractUi() {
  var script = HTML.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'could not find the inline UI script in ui.html');
  return { html: HTML, script: script[1] };
}

// The SnapKit styles, without the 2000 vendored design-system rules in front.
function snapkitCss() {
  var marked = HTML.split('/* snapkit.css */');
  assert.strictEqual(marked.length, 2, 'expected the snapkit.css block in ui.html');
  return marked[1].split('</style>')[0];
}

function cssRule(selector) {
  var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var match = snapkitCss().match(new RegExp('(^|\\n)' + escaped + ' \\{([^}]*)\\}'));
  return match ? match[2] : null;
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

// Parse the ids and the type-filter options out of the html so the stub mirrors it.
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

  // The menu items have no ids — collect them by data-type, in order.
  var options = [];
  var optRe = /<div class="([^"]*select-menu__item[^"]*)" data-type="([^"]+)"/g;
  var o;
  while ((o = optRe.exec(html)) !== null) {
    options.push(makeElement('option-' + o[2], { 'class': o[1], 'data-type': o[2] }));
  }
  assert.ok(options.length > 0, 'expected type-filter menu items in the html');

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
    return selector === '.select-menu__item' ? options : [];
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
  vm.runInContext(ui.script, ctx, { filename: 'ui.html' });

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
      assert.ok(found, 'no menu item for data-type=' + type);
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

test('the filter menu offers exactly the three known element types', function() {
  var ui = loadUi();
  var types = ui.options.map(function(o) { return o.getAttribute('data-type'); });
  assert.deepStrictEqual(types, ['all', 'component', 'non-component']);
});

test('All types is preselected and the filter icon shows no active dot', function() {
  var ui = loadUi();
  assert.ok(ui.option('all').classList.contains('select-menu__item--selected'), 'All types should start selected');
  assert.ok(!ui.option('component').classList.contains('select-menu__item--selected'));
  assert.ok(!ui.el('filterBtn').classList.contains('is-active'), 'no dot while the default filter is on');
});

test('clicking the filter icon opens the menu, clicking it again closes it', function() {
  var ui = loadUi();
  ui.click(ui.el('filterBtn'));
  assert.ok(ui.el('filterPopover').classList.contains('select-menu__menu--active'), 'menu should open');
  ui.click(ui.el('filterBtn'));
  assert.ok(!ui.el('filterPopover').classList.contains('select-menu__menu--active'), 'menu should close again');
});

test('clicking anywhere else closes the menu', function() {
  var ui = loadUi();
  ui.click(ui.el('filterBtn'));
  ui.click(ui.el('duplicateBtn'));
  assert.ok(!ui.el('filterPopover').classList.contains('select-menu__menu--active'), 'a click outside should close the menu');
});

test('choosing a type marks it, flags the icon and closes the menu', function() {
  var ui = loadUi();
  ui.click(ui.el('filterBtn'));
  ui.click(ui.option('component'));
  assert.ok(ui.option('component').classList.contains('select-menu__item--selected'), 'chosen option should be marked');
  assert.ok(!ui.option('all').classList.contains('select-menu__item--selected'), 'the previous option should be unmarked');
  assert.ok(ui.el('filterBtn').classList.contains('is-active'), 'the icon should show the active dot');
  assert.ok(!ui.el('filterPopover').classList.contains('select-menu__menu--active'), 'choosing should close the menu');
  assert.ok(/components only/.test(ui.el('filterBtn').title), 'the tooltip should name the filter: ' + ui.el('filterBtn').title);
});

test('going back to All types clears the active dot', function() {
  var ui = loadUi();
  ui.click(ui.option('non-component'));
  assert.ok(ui.el('filterBtn').classList.contains('is-active'));
  ui.click(ui.option('all'));
  assert.ok(!ui.el('filterBtn').classList.contains('is-active'), 'the dot should clear on the default filter');
});

test('Select sends the name and the active type filter', function() {
  var ui = loadUi();
  ui.el('frameName').value = ' Card ';
  ui.click(ui.el('selectBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-frame', name: 'Card', typeFilter: 'all', visibility: 'all' });

  ui.click(ui.option('component'));
  ui.click(ui.el('selectBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-frame', name: 'Card', typeFilter: 'component', visibility: 'all' });
});

test('the visibility radios are Visible / Hidden / All, with All preselected', function() {
  var ui = loadUi();
  var labels = ui.html.match(/data-visibility="(\w+)"/g).map(function(m) { return m.split('"')[1]; });
  assert.deepStrictEqual(labels, ['visible', 'hidden', 'all']);
  assert.strictEqual(ui.el('visAll').checked, true, 'All should start selected');
  assert.strictEqual(ui.el('visVisible').checked, false);
  assert.strictEqual(ui.el('visHidden').checked, false);
});

test('the three visibility radios sit on one line under a Select title', function() {
  var ui = loadUi();
  assert.ok(/<div class="section-title">Select<\/div>/.test(ui.html), 'expected a Select section title');
  var rule = cssRule('.snapkit-radios');
  assert.ok(rule && /display: flex/.test(rule), 'the radio row should be a single flex line: ' + rule);
  assert.ok(/class="radio__button"/.test(ui.html), 'the radios should use the design system radio');
});

test('the Actions title comes before the absolute / fixed scroll line', function() {
  var ui = loadUi();
  var actions = ui.html.indexOf('<div class="section-title">Actions</div>');
  assert.ok(actions !== -1, 'expected an Actions section title');
  assert.ok(actions < ui.html.indexOf('id="absoluteBtn"'), 'Actions should come before Set to absolute');
  var line = ui.html.slice(actions).match(/<div class="snapkit-grid snapkit-grid--2">([\s\S]*?)<\/div>/);
  assert.ok(line && /absoluteBtn/.test(line[1]) && /fixedScrollBtn/.test(line[1]),
    'Set to absolute and Set fixed scroll should share one row: ' + (line && line[1]));
});

test('picking a visibility radio sends it and unchecks the others', function() {
  var ui = loadUi();
  ui.el('frameName').value = 'Card';
  ui.click(ui.el('visHidden'));
  assert.strictEqual(ui.el('visHidden').checked, true);
  assert.strictEqual(ui.el('visAll').checked, false, 'only one radio stays checked');
  ui.click(ui.el('selectBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-frame', name: 'Card', typeFilter: 'all', visibility: 'hidden' });

  ui.click(ui.el('visVisible'));
  ui.click(ui.el('selectAbsoluteBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-absolute', name: 'Card', typeFilter: 'all', visibility: 'visible' });
});

test('the loader context names the chosen visibility', function() {
  var ui = loadUi();
  ui.el('frameName').value = 'Card';
  ui.click(ui.el('selectBtn'));
  assert.ok(/visible and hidden/.test(ui.el('overlayContext').textContent), 'the default should say both are searched');

  ui.click(ui.el('visHidden'));
  ui.click(ui.el('selectBtn'));
  assert.ok(/hidden elements only/.test(ui.el('overlayContext').textContent),
    'should name the visibility filter: ' + ui.el('overlayContext').textContent);
});

test('the type filter sticks across searches until it is changed', function() {
  var ui = loadUi();
  ui.el('frameName').value = 'Card';
  ui.click(ui.option('non-component'));
  ui.click(ui.el('selectBtn'));
  ui.click(ui.el('selectBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-frame', name: 'Card', typeFilter: 'non-component', visibility: 'all' });
});

test('Select absolute sends the type filter too, and allows an empty name', function() {
  var ui = loadUi();
  ui.click(ui.option('component'));
  ui.click(ui.el('selectAbsoluteBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'select-absolute', name: '', typeFilter: 'component', visibility: 'all' });
});

test('Select with an empty name shows an error instead of searching', function() {
  var ui = loadUi();
  var before = ui.posted.length;
  ui.click(ui.el('selectBtn'));
  assert.strictEqual(ui.posted.length, before, 'nothing should be posted for an empty name');
  assert.ok(/enter a component name/i.test(ui.el('message').textContent), 'expected an error message');
  assert.ok(/snapkit-toast--error/.test(ui.el('message').className), 'errors should use the error toast: ' + ui.el('message').className);
});

test('the loader overlay shows during a search and hides on the result', function() {
  var ui = loadUi();
  ui.el('frameName').value = 'Card';
  ui.click(ui.el('selectBtn'));
  assert.ok(ui.el('overlay').classList.contains('is-visible'), 'overlay should show while searching');
  ui.send({ type: 'success', text: 'Found and selected 2 element(s)' });
  assert.ok(!ui.el('overlay').classList.contains('is-visible'), 'overlay should hide on success');

  ui.click(ui.el('selectBtn'));
  ui.send({ type: 'error', text: 'No elements found' });
  assert.ok(!ui.el('overlay').classList.contains('is-visible'), 'overlay should hide on error too');
});

test('the loader spells out what is being searched: name, type filter and scope', function() {
  var ui = loadUi();
  ui.el('frameName').value = 'Header';
  ui.click(ui.el('selectBtn'));
  var context = ui.el('overlayContext').textContent;
  assert.ok(/Searching for elements/.test(context), 'should name what is searched: ' + context);
  assert.ok(/Header/.test(context), 'should quote the searched name: ' + context);
  assert.ok(/all types/.test(context), 'should name the active type filter: ' + context);
  assert.ok(/across the whole page/.test(context), 'should name the scope: ' + context);
});

test('the loader context follows the type filter and the selection scope', function() {
  var ui = loadUi();
  ui.send({ type: 'selection-change', hasSelection: true, hasAbsolute: false, hasNonAbsolute: true, hasContainer: true });
  ui.click(ui.option('component'));
  ui.el('frameName').value = 'Card, Tile';
  ui.click(ui.el('selectBtn'));
  var context = ui.el('overlayContext').textContent;
  assert.ok(/components only/.test(context), 'should name the chosen filter: ' + context);
  assert.ok(/inside the current selection/.test(context), 'should say it stays in the selection: ' + context);
  assert.ok(/Card/.test(context) && /Tile/.test(context), 'should list every name: ' + context);
});

test('Select absolute says absolute, and empty name reads as any name', function() {
  var ui = loadUi();
  ui.click(ui.el('selectAbsoluteBtn'));
  var context = ui.el('overlayContext').textContent;
  assert.ok(/absolute elements/.test(context), 'should say absolute elements: ' + context);
  assert.ok(/with any name/.test(context), 'an empty field means any name: ' + context);
});

test('the active-filter dot is red and bigger than the old green one', function() {
  var rule = cssRule('.snapkit-filter__dot');
  assert.ok(rule, 'expected a .snapkit-filter__dot rule in the SnapKit css');
  assert.ok(/background-color: var\(--red\)/.test(rule), 'the dot should use the design system red: ' + rule);
  assert.ok(/--red: #f24822/.test(HTML), 'the design system red should be a red');
  var size = rule.match(/width: (\d+)px/);
  assert.ok(size && Number(size[1]) >= 10, 'the dot should be at least 10px wide: ' + rule);
});

test('the search field keeps the icon-button grey fill at rest and on focus', function() {
  var rest = cssRule('.input__field:focus');
  assert.ok(rest && /background-color: var\(--hover-fill\)/.test(rest),
    'the field should always carry the hover fill, the same grey as an icon button: ' + rest);
  assert.ok(/--hover-fill: rgba\(0, 0, 0, \.06\)/.test(HTML), 'the hover fill token should be a light grey');
  // Two greys side by side on the same row make a height mismatch obvious.
  var box = cssRule('.input__field');
  assert.ok(box && /height: var\(--size-medium\)/.test(box) && /margin: 0/.test(box),
    'the grey field should be as tall as the icon button beside it: ' + box);
});

test('the filter trigger keeps its glyph centred and solid', function() {
  var rule = cssRule('.snapkit-filter__button .icon');
  assert.ok(rule && /margin: 0/.test(rule) && /opacity: 1/.test(rule),
    'the DS `.select-menu .icon` rule offsets and fades the glyph inside the ' +
    'icon button; SnapKit has to undo it: ' + rule);
});

test('the icon buttons carry the grey fill at rest, not only on hover', function() {
  var rule = cssRule('.icon-button');
  assert.ok(rule && /background-color: var\(--hover-fill\)/.test(rule),
    'align and filter buttons should show their fill at all times: ' + rule);
  assert.ok(!/background-color: transparent/.test(rule), 'no transparent resting state left: ' + rule);
});

test('the magnifier drops out once the field has something in it', function() {
  var ui = loadUi();
  assert.ok(ui.html.indexOf('id="frameName"') < ui.html.indexOf('icon icon--search'),
    'the icon must follow the field for the sibling selector to reach it');
  var hidden = cssRule('.input__field:not(:placeholder-shown) + .icon');
  assert.ok(hidden && /display: none/.test(hidden), 'a filled field should hide its icon: ' + hidden);
  var padding = cssRule('.input__field:not(:placeholder-shown)');
  assert.ok(padding && /padding-left: var\(--size-xxsmall\)/.test(padding),
    'the text should reclaim the space the icon reserved: ' + padding);
});

test('the section titles share a left edge with the buttons below them', function() {
  var rule = cssRule('.section-title');
  assert.ok(rule && /padding-left: 0/.test(rule), 'the DS title indent should be removed: ' + rule);
});

test('the selected radio dot sits centred in its circle', function() {
  var dot = cssRule('.radio__button:checked + .radio__label:before');
  assert.ok(dot && /background-position: center/.test(dot),
    'the DS pins the dot at a hard-coded 2px 2px, which is off centre once the ' +
    'border eats into the 10px circle — centre it instead: ' + dot);
  var circle = cssRule('.radio__label:before');
  assert.ok(circle && /margin-top: 0/.test(circle),
    'the DS baseline nudge tips the circle off its label: ' + circle);
});

test('the cleanup button reads Delete absolute', function() {
  var ui = loadUi();
  assert.ok(/<button id="deleteAbsBtn"[^>]*>Delete absolute<\/button>/.test(ui.html),
    'the absolute cleanup button should be labelled Delete absolute');
  assert.ok(!/Remove absolute/.test(ui.html), 'no Remove absolute copy should be left in the panel');
  ui.click(ui.el('deleteAbsBtn'));
  assert.deepStrictEqual(ui.lastPosted(), { type: 'remove-absolute' });
});

test('selection-change disables Set to absolute for an already-absolute selection', function() {
  var ui = loadUi();
  ui.send({ type: 'selection-change', hasSelection: true, hasAbsolute: true, hasNonAbsolute: false, hasContainer: false });
  assert.ok(ui.el('absoluteBtn').disabled, 'Set to absolute should be disabled');
  assert.ok(!ui.el('deleteAbsBtn').disabled, 'Delete absolute should stay available');
  assert.ok(!ui.el('duplicateBtn').disabled, 'Duplicate should be enabled with a selection');
});

test('selection-change with nothing selected keeps Delete absolute available', function() {
  var ui = loadUi();
  ui.send({ type: 'selection-change', hasSelection: false, hasAbsolute: false, hasNonAbsolute: false, hasContainer: false });
  assert.ok(!ui.el('deleteAbsBtn').disabled, 'Delete absolute works page-wide with no selection');
  assert.ok(ui.el('duplicateBtn').disabled, 'Duplicate needs a selection');
  assert.ok(ui.el('deleteBtn').disabled, 'Delete needs a selection');
});

test('the panel is built on the vendored figma-plugin-ds', function() {
  var ui = loadUi();
  ['button button--primary', 'button--secondary', 'input__field', 'radio__button',
   'select-menu__menu', 'icon icon--search', 'icon--align-left', 'section-title'
  ].forEach(function(cls) {
    assert.ok(ui.html.indexOf('"' + cls) !== -1 || ui.html.indexOf(cls + '"') !== -1 || ui.html.indexOf(cls + ' ') !== -1,
      'expected the design system class "' + cls + '" in the panel');
  });
  assert.ok(/--blue: #18a0fb/.test(ui.html), 'expected the design system tokens to be inlined');
});

test('the built panel pulls nothing from the network', function() {
  assert.ok(!/<link\b/.test(HTML), 'ui.html must not link an external stylesheet');
  assert.ok(!/<script[^>]+src=/.test(HTML), 'ui.html must not load an external script');
  assert.ok(!/url\(\s*["']?https?:/i.test(HTML), 'ui.html must not fetch remote assets (fonts, images)');
  assert.ok(!/rsms\.me/.test(HTML), 'the remote Inter webfont should be stripped at build time');
});

test('ui.html is in sync with the sources in ui/', function() {
  assert.strictEqual(HTML, buildUi.build(),
    'ui.html is stale — run: npm run build:ui');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
