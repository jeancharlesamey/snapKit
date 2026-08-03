// SnapKit plugin tests. Runs code.js (the Figma "main" thread) against a
// mocked figma API and asserts each UI message produces the right result.
// No dependencies — run with: node test/plugin.test.js

'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');
var assert = require('assert');
var mock = require('./figma-mock');

var CODE = fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8');

// Figma injects the manifest's `ui` file as the __html__ global; ui.html is
// built from ui/ by scripts/build-ui.js.
var UI_HTML = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');

// Load a fresh copy of the plugin bound to the given figma global, then return
// it so the test can drive figma._send(...) and inspect figma._messages.
function loadPlugin(figma) {
  var ctx = { figma: figma, console: console, __html__: UI_HTML };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx, { filename: 'code.js' });
  return figma;
}

function lastType(messages) {
  return messages.length ? messages[messages.length - 1].type : null;
}

function lastText(messages) {
  return messages.length ? messages[messages.length - 1].text : null;
}

// Compare the current selection to the exact nodes expected, by identity. Mock
// nodes hold circular parent/selection references, so deepStrictEqual is out.
function assertSelection(figma, expected) {
  var ids = function(nodes) {
    return nodes.map(function(n) { return n.type + ':' + n.name; }).join(', ');
  };
  var actual = figma.currentPage.selection;
  assert.strictEqual(ids(actual), ids(expected), 'expected [' + ids(expected) + '] but got [' + ids(actual) + ']');
  for (var i = 0; i < expected.length; i++) {
    assert.strictEqual(actual[i], expected[i], 'selection[' + i + '] should be the same node instance');
  }
}

// replace-all is the plugin's first async action (it awaits figma.loadFontAsync
// before editing text content), so its tests need to wait past every pending
// .then() before asserting. setImmediate runs after all queued microtasks, so
// it's a safe point to check the result regardless of how many .then() hops
// the promise chain under test takes.
function afterAsync(fn) {
  return new Promise(function(resolve) {
    setImmediate(function() {
      fn();
      resolve();
    });
  });
}

// --- tiny test runner -------------------------------------------------------
// Tests queue instead of running immediately, since replace-all is the first
// async action in the plugin (it has to await figma.loadFontAsync before
// editing text content) — a test for it has to await the result too, and
// process.exit() must not fire until every queued test has actually settled.
var passed = 0;
var failed = 0;
var queued = [];
function test(name, fn) {
  queued.push({ name: name, fn: fn });
}

function runNext(i) {
  if (i >= queued.length) {
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed === 0 ? 0 : 1);
    return;
  }
  var t = queued[i];
  function onFail(e) {
    failed++;
    console.log('  ✗ ' + t.name);
    console.log('      ' + (e && e.message ? e.message : e));
    runNext(i + 1);
  }
  var result;
  try {
    result = t.fn();
  } catch (e) {
    onFail(e);
    return;
  }
  if (result && typeof result.then === 'function') {
    result.then(function() {
      passed++;
      console.log('  ✓ ' + t.name);
      runNext(i + 1);
    }, onFail);
  } else {
    passed++;
    console.log('  ✓ ' + t.name);
    runNext(i + 1);
  }
}

console.log('SnapKit plugin tests\n');

test('plugin loads and registers a UI message handler', function() {
  var figma = loadPlugin(mock.makeFigma([]));
  assert.strictEqual(typeof figma.ui.onmessage, 'function');
});

test('check-selection reports current selection state', function() {
  var figma = loadPlugin(mock.makeFigma([]));
  var msgs = figma._send({ type: 'check-selection' });
  assert.strictEqual(msgs[0].type, 'selection-change');
  assert.strictEqual(msgs[0].hasSelection, false);
});

test('selectionchange event posts the new selection state', function() {
  var node = mock.makeNode({ name: 'Header' });
  var figma = loadPlugin(mock.makeFigma([node]));
  figma.currentPage.selection = [node];
  figma._messages = [];
  figma._emit('selectionchange');
  assert.strictEqual(figma._messages[0].type, 'selection-change');
  assert.strictEqual(figma._messages[0].hasSelection, true);
  // The count feeds the "Selection (n)" title in the panel.
  assert.strictEqual(figma._messages[0].count, 1);
});

test('selection-change reports how many elements are selected', function() {
  var a = mock.makeNode({ name: 'Header' });
  var b = mock.makeNode({ name: 'Footer' });
  var figma = loadPlugin(mock.makeFigma([a, b]));
  assert.strictEqual(figma._send({ type: 'check-selection' })[0].count, 0);
  figma.currentPage.selection = [a, b];
  assert.strictEqual(figma._send({ type: 'check-selection' })[0].count, 2);
});

test('select-frame finds nested components by name (whole page)', function() {
  var header = mock.makeNode({ name: 'Header' });
  var frame = mock.makeNode({ name: 'Screen', children: [header] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  var msgs = figma._send({ type: 'select-frame', name: 'Header' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(figma.currentPage.selection.length, 1);
  assert.strictEqual(figma.currentPage.selection[0].name, 'Header');
});

test('select-frame supports multiple comma-separated names', function() {
  var header = mock.makeNode({ name: 'Header' });
  var tab = mock.makeNode({ name: 'TapBar' });
  var frame = mock.makeNode({ name: 'Screen', children: [header, tab] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  var msgs = figma._send({ type: 'select-frame', name: 'Header, TapBar' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(figma.currentPage.selection.length, 2);
});

test('select-frame reports an error when nothing matches', function() {
  var frame = mock.makeNode({ name: 'Screen', children: [] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  var msgs = figma._send({ type: 'select-frame', name: 'Nope' });
  assert.strictEqual(lastType(msgs), 'error');
});

test('select-absolute only selects absolute-positioned matches', function() {
  var absHeader = mock.makeNode({ name: 'Header', layoutPositioning: 'ABSOLUTE' });
  var flowHeader = mock.makeNode({ name: 'Header', layoutPositioning: 'AUTO' });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [absHeader, flowHeader] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  var msgs = figma._send({ type: 'select-absolute', name: 'Header' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(figma.currentPage.selection.length, 1);
  assert.strictEqual(figma.currentPage.selection[0].layoutPositioning, 'ABSOLUTE');
});

// --- name patterns and empty-name search ------------------------------------

test('select-frame supports * as a wildcard in a name', function() {
  var a = mock.makeNode({ name: 'Section 1' });
  var b = mock.makeNode({ name: 'Section 2' });
  var c = mock.makeNode({ name: 'Header' });
  var frame = mock.makeNode({ name: 'Screen', children: [a, b, c] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  var msgs = figma._send({ type: 'select-frame', name: 'Section*' });
  assert.strictEqual(lastType(msgs), 'success');
  assertSelection(figma, [a, b]);
});

test('select-frame also matches a top-level selected item itself', function() {
  var inner = mock.makeNode({ name: 'Deep' });
  var section2 = mock.makeNode({ name: 'Section 2', children: [inner] });
  var figma = loadPlugin(mock.makeFigma([section2]));
  figma.currentPage.selection = [section2];
  figma._send({ type: 'select-frame', name: 'Section*' });
  assertSelection(figma, [section2]);
});

test('select-absolute with an empty name selects every absolute element', function() {
  var abs1 = mock.makeNode({ name: 'Sticky', layoutPositioning: 'ABSOLUTE' });
  var abs2 = mock.makeNode({ name: 'Fab', layoutPositioning: 'ABSOLUTE' });
  var flow = mock.makeNode({ name: 'Body', layoutPositioning: 'AUTO' });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [abs1, abs2, flow] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  var msgs = figma._send({ type: 'select-absolute', name: '' });
  assert.strictEqual(lastType(msgs), 'success');
  assertSelection(figma, [abs1, abs2]);
});

// --- selection state reported to the UI -------------------------------------

test('check-selection reports absolute / non-absolute / container flags', function() {
  var abs = mock.makeNode({ name: 'Sticky', type: 'FRAME', layoutPositioning: 'ABSOLUTE' });
  var text = mock.makeNode({ name: 'Label', type: 'TEXT' });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [abs, text] });
  var figma = loadPlugin(mock.makeFigma([frame]));

  figma.currentPage.selection = [abs];
  var msg = figma._send({ type: 'check-selection' })[0];
  assert.strictEqual(msg.hasSelection, true);
  assert.strictEqual(msg.hasAbsolute, true);
  assert.strictEqual(msg.hasNonAbsolute, false);
  assert.strictEqual(msg.hasContainer, true);

  figma.currentPage.selection = [text];
  msg = figma._send({ type: 'check-selection' })[0];
  assert.strictEqual(msg.hasAbsolute, false);
  assert.strictEqual(msg.hasNonAbsolute, true);
  assert.strictEqual(msg.hasContainer, false, 'a TEXT node is not a container');
});

// Regression test: selectionchange used to exclude FRAME/SECTION from
// hasNonAbsolute while check-selection did not, so "Set to absolute" stayed
// disabled after selecting a plain (non-absolute) frame via the live event.
// Both handlers now share computeSelectionState, so they must agree.
test('selectionchange counts a non-absolute frame as non-absolute, same as check-selection', function() {
  var frame = mock.makeNode({ name: 'Header', type: 'FRAME' });
  var screen = mock.makeNode({ name: 'Screen', children: [frame] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma.currentPage.selection = [frame];
  figma._messages = [];
  figma._emit('selectionchange');
  assert.strictEqual(figma._messages[0].hasNonAbsolute, true, 'a selected non-absolute FRAME should enable "Set to absolute"');
});

test('align with shift retargets an absolute autolayout frame internal alignment', function() {
  var spec = { name: 'Card', layoutMode: 'VERTICAL', layoutPositioning: 'ABSOLUTE', primaryAxisAlignItems: 'MIN', width: 40, height: 20, x: 0, y: 0, constraints: { horizontal: 'MIN', vertical: 'MIN' }, children: [] };
  var frame = mock.makeNode(spec);
  var page = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', width: 200, height: 100, children: [frame] });
  var figma = loadPlugin(mock.makeFigma([page]));
  figma.currentPage.selection = [frame];

  // Without shift the absolute frame is moved via x/y.
  figma._send({ type: 'align', position: 'bottom' });
  assert.strictEqual(frame.primaryAxisAlignItems, 'MIN');
  assert.strictEqual(frame.y, 100 - 20);

  // With shift the frame's own internal alignment is changed instead.
  figma._send({ type: 'align', position: 'bottom', shift: true });
  assert.strictEqual(frame.primaryAxisAlignItems, 'MAX');
});

// --- element type filter (issue #2, and part 1 of issue #5) -----------------
// A component, an instance and a plain frame all named "Card", so only the type
// filter can tell the matches apart.
function makeTypeFixture() {
  var comp = mock.makeNode({ name: 'Card', type: 'COMPONENT' });
  var inst = mock.makeNode({ name: 'Card', type: 'INSTANCE' });
  var frame = mock.makeNode({ name: 'Card', type: 'FRAME' });
  var screen = mock.makeNode({ name: 'Screen', children: [comp, inst, frame] });
  return { screen: screen, comp: comp, inst: inst, frame: frame };
}

test('select-frame with no type filter matches every type (default)', function() {
  var f = makeTypeFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card' });
  assert.strictEqual(lastType(msgs), 'success');
  assertSelection(figma, [f.comp, f.inst, f.frame]);
});

test('select-frame typeFilter "all" matches every type', function() {
  var f = makeTypeFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'all' });
  assertSelection(figma, [f.comp, f.inst, f.frame]);
});

test('select-frame typeFilter "component" keeps components and instances only', function() {
  var f = makeTypeFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'component' });
  assert.strictEqual(lastType(msgs), 'success');
  assertSelection(figma, [f.comp, f.inst]);
});

test('select-frame typeFilter "component" also keeps variant sets', function() {
  var set = mock.makeNode({ name: 'Card', type: 'COMPONENT_SET' });
  var frame = mock.makeNode({ name: 'Card', type: 'FRAME' });
  var screen = mock.makeNode({ name: 'Screen', children: [set, frame] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'component' });
  assertSelection(figma, [set]);
});

test('select-frame typeFilter "non-component" keeps the frame only', function() {
  var f = makeTypeFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'non-component' });
  assert.strictEqual(lastType(msgs), 'success');
  assertSelection(figma, [f.frame]);
});

test('an unknown typeFilter falls back to matching every type', function() {
  var f = makeTypeFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'nonsense' });
  assertSelection(figma, [f.comp, f.inst, f.frame]);
});

test('the active type filter is named in the result message', function() {
  var f = makeTypeFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'component' });
  assert.ok(/components only/.test(lastText(msgs)), 'success text should name the filter: ' + lastText(msgs));

  msgs = figma._send({ type: 'select-frame', name: 'Card' });
  assert.ok(!/only/.test(lastText(msgs)), 'the default filter should add nothing: ' + lastText(msgs));
});

test('the type filter is named in the error when it rules out every name match', function() {
  var comp = mock.makeNode({ name: 'Card', type: 'COMPONENT' });
  var screen = mock.makeNode({ name: 'Screen', children: [comp] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'non-component' });
  assert.strictEqual(lastType(msgs), 'error');
  assert.ok(/non-component/.test(lastText(msgs)), 'error should name the filter: ' + lastText(msgs));
});

test('the type filter still descends into filtered-out containers', function() {
  // The wrapper frame is filtered out, but the component nested inside it is not.
  var comp = mock.makeNode({ name: 'Card', type: 'COMPONENT' });
  var wrapper = mock.makeNode({ name: 'Card', type: 'FRAME', children: [comp] });
  var screen = mock.makeNode({ name: 'Screen', children: [wrapper] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'component' });
  assertSelection(figma, [comp]);
});

test('the type filter combines with wildcards', function() {
  var comp = mock.makeNode({ name: 'Card large', type: 'COMPONENT' });
  var frame = mock.makeNode({ name: 'Card small', type: 'FRAME' });
  var screen = mock.makeNode({ name: 'Screen', children: [comp, frame] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma._send({ type: 'select-frame', name: 'Card*', typeFilter: 'component' });
  assertSelection(figma, [comp]);
});

test('select-absolute honours the type filter', function() {
  var comp = mock.makeNode({ name: 'Card', type: 'COMPONENT', layoutPositioning: 'ABSOLUTE' });
  var frame = mock.makeNode({ name: 'Card', type: 'FRAME', layoutPositioning: 'ABSOLUTE' });
  var screen = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [comp, frame] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  var msgs = figma._send({ type: 'select-absolute', name: 'Card', typeFilter: 'component' });
  assert.strictEqual(lastType(msgs), 'success');
  assertSelection(figma, [comp]);
});

test('select-absolute with an empty name honours the type filter', function() {
  var comp = mock.makeNode({ name: 'Card', type: 'COMPONENT', layoutPositioning: 'ABSOLUTE' });
  var frame = mock.makeNode({ name: 'Banner', type: 'FRAME', layoutPositioning: 'ABSOLUTE' });
  var screen = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [comp, frame] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma._send({ type: 'select-absolute', name: '', typeFilter: 'non-component' });
  assertSelection(figma, [frame]);
});

// --- visibility filter (part of issue #5) ------------------------------------
// Two frames named "Card": one visible, one with its layer visibility off, so
// only the visibility filter can tell them apart.
function makeVisibilityFixture() {
  var shown = mock.makeNode({ name: 'Card', type: 'FRAME', visible: true });
  var hidden = mock.makeNode({ name: 'Card', type: 'FRAME', visible: false });
  var untouched = mock.makeNode({ name: 'Card', type: 'FRAME' }); // never had `visible` set
  var screen = mock.makeNode({ name: 'Screen', children: [shown, hidden, untouched] });
  return { screen: screen, shown: shown, hidden: hidden, untouched: untouched };
}

test('select-frame with no visibility filter matches visible and hidden (default)', function() {
  var f = makeVisibilityFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  figma._send({ type: 'select-frame', name: 'Card' });
  assertSelection(figma, [f.shown, f.hidden, f.untouched]);
});

test('select-frame visibility "hidden" keeps the hidden element only', function() {
  var f = makeVisibilityFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card', visibility: 'hidden' });
  assert.strictEqual(lastType(msgs), 'success');
  assertSelection(figma, [f.hidden]);
});

test('select-frame visibility "visible" skips the hidden element', function() {
  var f = makeVisibilityFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  figma._send({ type: 'select-frame', name: 'Card', visibility: 'visible' });
  assertSelection(figma, [f.shown, f.untouched]);
});

test('an unknown visibility filter falls back to matching everything', function() {
  var f = makeVisibilityFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  figma._send({ type: 'select-frame', name: 'Card', visibility: 'nonsense' });
  assertSelection(figma, [f.shown, f.hidden, f.untouched]);
});

test('the visibility filter still descends into hidden containers', function() {
  // The wrapper is hidden, the card inside it is not: searching for visible
  // elements must still reach the card.
  var card = mock.makeNode({ name: 'Card', type: 'FRAME', visible: true });
  var wrapper = mock.makeNode({ name: 'Wrapper', type: 'FRAME', visible: false, children: [card] });
  var screen = mock.makeNode({ name: 'Screen', children: [wrapper] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma._send({ type: 'select-frame', name: 'Card', visibility: 'visible' });
  assertSelection(figma, [card]);
});

test('the visibility filter combines with the type filter', function() {
  var comp = mock.makeNode({ name: 'Card', type: 'COMPONENT', visible: false });
  var frame = mock.makeNode({ name: 'Card', type: 'FRAME', visible: false });
  var shownComp = mock.makeNode({ name: 'Card', type: 'COMPONENT', visible: true });
  var screen = mock.makeNode({ name: 'Screen', children: [comp, frame, shownComp] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'component', visibility: 'hidden' });
  assertSelection(figma, [comp]);
});

test('both active filters are named in the result message', function() {
  var f = makeVisibilityFixture();
  var figma = loadPlugin(mock.makeFigma([f.screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card', typeFilter: 'non-component', visibility: 'hidden' });
  var text = lastText(msgs);
  assert.ok(/non-component elements only/.test(text), 'should name the type filter: ' + text);
  assert.ok(/hidden only/.test(text), 'should name the visibility filter: ' + text);
});

test('the visibility filter is named in the error when nothing matches', function() {
  var screen = mock.makeNode({ name: 'Screen', children: [mock.makeNode({ name: 'Card', visible: true })] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  var msgs = figma._send({ type: 'select-frame', name: 'Card', visibility: 'hidden' });
  assert.strictEqual(lastType(msgs), 'error');
  assert.ok(/hidden only/.test(lastText(msgs)), 'error should name the filter: ' + lastText(msgs));
});

test('select-absolute honours the visibility filter, with or without a name', function() {
  var hidden = mock.makeNode({ name: 'Header', type: 'FRAME', visible: false, layoutPositioning: 'ABSOLUTE' });
  var shown = mock.makeNode({ name: 'Header', type: 'FRAME', visible: true, layoutPositioning: 'ABSOLUTE' });
  var screen = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [hidden, shown] });
  var figma = loadPlugin(mock.makeFigma([screen]));
  figma._send({ type: 'select-absolute', name: 'Header', visibility: 'hidden' });
  assertSelection(figma, [hidden]);

  figma._send({ type: 'select-absolute', name: '', visibility: 'hidden' });
  assertSelection(figma, [hidden]);
});

test('duplicate clones a free element and offsets it to the right', function() {
  var box = mock.makeNode({ name: 'Box', x: 10, y: 20, width: 100, height: 50 });
  var frame = mock.makeNode({ name: 'Canvas', children: [box] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [box];
  var msgs = figma._send({ type: 'duplicate' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(frame.children.length, 2);
  var dup = figma.currentPage.selection[0];
  assert.strictEqual(dup.x, 10 + 100 + 8);
  assert.strictEqual(dup.y, 20);
});

test('duplicate inside autolayout inserts clone right after the original', function() {
  var a = mock.makeNode({ name: 'A' });
  var b = mock.makeNode({ name: 'B' });
  var frame = mock.makeNode({ name: 'Stack', layoutMode: 'VERTICAL', children: [a, b] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [a];
  figma._send({ type: 'duplicate' });
  // Order should be A, clone(A), B
  assert.strictEqual(frame.children.length, 3);
  assert.strictEqual(frame.children[0], a);
  assert.strictEqual(frame.children[1].name, 'A');
  assert.strictEqual(frame.children[2], b);
});

test('set-absolute converts an autolayout child and resets x/y', function() {
  var child = mock.makeNode({ name: 'Nav', layoutPositioning: 'AUTO', constraints: { horizontal: 'MIN', vertical: 'MIN' }, x: 5, y: 5 });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [child] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [child];
  var msgs = figma._send({ type: 'set-absolute' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(child.layoutPositioning, 'ABSOLUTE');
  assert.strictEqual(child.x, 0);
  assert.strictEqual(child.y, 0);
});

test('set-absolute skips sections', function() {
  var section = mock.makeNode({ name: 'Sec', type: 'SECTION', children: [] });
  var frame = mock.makeNode({ name: 'Wrap', children: [section] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [section];
  var msgs = figma._send({ type: 'set-absolute' });
  assert.strictEqual(lastType(msgs), 'error');
});

test('align centers an absolute child via x/y', function() {
  var child = mock.makeNode({ name: 'Logo', layoutPositioning: 'ABSOLUTE', width: 40, height: 20, x: 0, y: 0, constraints: { horizontal: 'MIN', vertical: 'MIN' } });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', width: 200, height: 100, children: [child] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [child];
  figma._send({ type: 'align', position: 'center' });
  assert.strictEqual(child.x, (200 - 40) / 2);
  assert.strictEqual(child.constraints.horizontal, 'CENTER');
});

test('align changes an autolayout container\'s own alignment', function() {
  var frame = mock.makeNode({ name: 'Stack', layoutMode: 'HORIZONTAL', primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN', children: [] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [frame];
  figma._send({ type: 'align', position: 'right' });
  assert.strictEqual(frame.primaryAxisAlignItems, 'MAX');
});

test('remove-absolute removes a selected absolute element', function() {
  var abs = mock.makeNode({ name: 'Sticky', layoutPositioning: 'ABSOLUTE' });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [abs] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [abs];
  var msgs = figma._send({ type: 'remove-absolute' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(frame.children.length, 0);
});

test('remove-absolute clears all absolute elements page-wide with no selection', function() {
  var abs1 = mock.makeNode({ name: 'A', layoutPositioning: 'ABSOLUTE' });
  var keep = mock.makeNode({ name: 'B', layoutPositioning: 'AUTO' });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [abs1, keep] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [];
  var msgs = figma._send({ type: 'remove-absolute' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(frame.children.length, 1);
  assert.strictEqual(frame.children[0].name, 'B');
});

// Regression test: removeAbsoluteFromContainer used to only search one level
// into a selected frame's own children, so an absolute element wrapped in an
// intermediate frame was silently skipped.
test('remove-absolute finds an absolute element nested more than one level deep inside a selected frame', function() {
  var deepAbs = mock.makeNode({ name: 'Fab', layoutPositioning: 'ABSOLUTE' });
  var wrapper = mock.makeNode({ name: 'Wrapper', children: [deepAbs] });
  var frame = mock.makeNode({ name: 'Screen', layoutMode: 'VERTICAL', children: [wrapper] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [frame];
  var msgs = figma._send({ type: 'remove-absolute' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(wrapper.children.length, 0, 'the absolute element two levels deep should be removed');
});

// Regression test: removeAbsoluteFromContainer used to only descend
// section -> frame -> frame's direct children, so an absolute element nested
// deeper inside a section (e.g. behind an extra wrapper frame) was missed.
test('remove-absolute finds an absolute element nested deeper than one frame inside a section', function() {
  var deepAbs = mock.makeNode({ name: 'Fab', layoutPositioning: 'ABSOLUTE' });
  var wrapper = mock.makeNode({ name: 'Wrapper', children: [deepAbs] });
  var innerFrame = mock.makeNode({ name: 'Inner', children: [wrapper] });
  var section = mock.makeNode({ name: 'Sec', type: 'SECTION', children: [innerFrame] });
  var figma = loadPlugin(mock.makeFigma([section]));
  figma.currentPage.selection = [];
  var msgs = figma._send({ type: 'remove-absolute' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(wrapper.children.length, 0, 'an absolute element three levels inside a section should be removed');
});

test('clear-selection empties the canvas selection', function() {
  var a = mock.makeNode({ name: 'A' });
  var frame = mock.makeNode({ name: 'Canvas', children: [a] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [a];
  figma._send({ type: 'clear-selection' });
  assert.strictEqual(figma.currentPage.selection.length, 0);
});

test('resize asks Figma to resize the window to the height the UI measured, keeping the width fixed', function() {
  var figma = loadPlugin(mock.makeFigma([]));
  figma._send({ type: 'resize', height: 462 });
  assert.deepStrictEqual(figma._resized, { width: 320, height: 462 });
});

// --- replace-all (the Replace filter option) ---------------------------------

test('replace-all replaces matching text content, case-insensitively', function() {
  var text = mock.makeNode({ name: 'Label', type: 'TEXT', characters: 'Hello WORLD', fontName: { family: 'Inter', style: 'Regular' } });
  var frame = mock.makeNode({ name: 'Screen', children: [text] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma._send({ type: 'replace-all', name: 'world', replaceWith: 'Figma' });
  return afterAsync(function() {
    assert.strictEqual(lastType(figma._messages), 'success');
    assert.strictEqual(text.characters, 'Hello Figma');
  });
});

test('replace-all replaces a matching layer name, not just text content', function() {
  var header = mock.makeNode({ name: 'Header', type: 'FRAME' });
  var frame = mock.makeNode({ name: 'Screen', children: [header] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma._send({ type: 'replace-all', name: 'Header', replaceWith: 'Banner' });
  return afterAsync(function() {
    assert.strictEqual(lastType(figma._messages), 'success');
    assert.strictEqual(header.name, 'Banner');
  });
});

test('replace-all replaces both the name and the content when both match on the same node', function() {
  var text = mock.makeNode({ name: 'Header', type: 'TEXT', characters: 'Header text', fontName: { family: 'Inter', style: 'Regular' } });
  var frame = mock.makeNode({ name: 'Screen', children: [text] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma._send({ type: 'replace-all', name: 'Header', replaceWith: 'Title' });
  return afterAsync(function() {
    assert.strictEqual(text.name, 'Title');
    assert.strictEqual(text.characters, 'Title text');
  });
});

test('replace-all replaces every occurrence within a single string and counts them', function() {
  var text = mock.makeNode({ name: 'Repeats', type: 'TEXT', characters: 'cat cat cat', fontName: { family: 'Inter', style: 'Regular' } });
  var frame = mock.makeNode({ name: 'Screen', children: [text] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma._send({ type: 'replace-all', name: 'cat', replaceWith: 'dog' });
  return afterAsync(function() {
    assert.strictEqual(text.characters, 'dog dog dog');
    assert.ok(/Replaced 3 occurrence/.test(lastText(figma._messages)), 'should report 3 occurrences: ' + lastText(figma._messages));
  });
});

test('replace-all is scoped to the current selection, not the whole page', function() {
  var insideText = mock.makeNode({ name: 'Inside', type: 'TEXT', characters: 'find me', fontName: { family: 'Inter', style: 'Regular' } });
  var selectedFrame = mock.makeNode({ name: 'Selected', children: [insideText] });
  var outsideText = mock.makeNode({ name: 'Outside', type: 'TEXT', characters: 'find me', fontName: { family: 'Inter', style: 'Regular' } });
  var otherFrame = mock.makeNode({ name: 'Other', children: [outsideText] });
  var figma = loadPlugin(mock.makeFigma([selectedFrame, otherFrame]));
  figma.currentPage.selection = [selectedFrame];
  figma._send({ type: 'replace-all', name: 'find me', replaceWith: 'found' });
  return afterAsync(function() {
    assert.strictEqual(insideText.characters, 'found', 'the match inside the selection should be replaced');
    assert.strictEqual(outsideText.characters, 'find me', 'the match outside the selection should be untouched');
  });
});

// Regression test: one match failing to load its font (deleted/unavailable
// font — a common real Figma situation) used to abort every match queued
// after it and report a bare "Could not complete the replace", discarding the
// ones that had already succeeded. Matches now run independently.
test('replace-all keeps going when one match cannot load its font, and reports it honestly', function() {
  var before = mock.makeNode({ name: 'Before', type: 'TEXT', characters: 'BIOMÉTRIE', fontName: { family: 'Inter', style: 'Regular' } });
  var broken = mock.makeNode({ name: 'Broken', type: 'TEXT', characters: 'BIOMÉTRIE', fontName: { family: '__MISSING_FONT__', style: 'Regular' } });
  var after = mock.makeNode({ name: 'After', type: 'TEXT', characters: 'BIOMÉTRIE', fontName: { family: 'Inter', style: 'Regular' } });
  var frame = mock.makeNode({ name: 'Screen', children: [before, broken, after] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma._send({ type: 'replace-all', name: 'BIOMÉTRIE', replaceWith: 'Biométrie' });
  return afterAsync(function() {
    assert.strictEqual(lastType(figma._messages), 'success', 'the whole run should not be reported as a failure');
    assert.strictEqual(before.characters, 'Biométrie', 'the match before the broken one should still be replaced');
    assert.strictEqual(after.characters, 'Biométrie', 'the match after the broken one should still be replaced — not skipped');
    assert.strictEqual(broken.characters, 'BIOMÉTRIE', 'the one that could not load its font is left untouched, not corrupted');
    assert.ok(/could not be updated/.test(lastText(figma._messages)), 'should say one element could not be updated: ' + lastText(figma._messages));
  });
});

test('replace-all reports an error and changes nothing when there are no matches', function() {
  var text = mock.makeNode({ name: 'Label', type: 'TEXT', characters: 'Hello world', fontName: { family: 'Inter', style: 'Regular' } });
  var frame = mock.makeNode({ name: 'Screen', children: [text] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  var msgs = figma._send({ type: 'replace-all', name: 'Nope', replaceWith: 'x' });
  assert.strictEqual(lastType(msgs), 'error');
  assert.strictEqual(text.characters, 'Hello world');
});

test('replace-all requires non-empty text to find', function() {
  var figma = loadPlugin(mock.makeFigma([]));
  var msgs = figma._send({ type: 'replace-all', name: '', replaceWith: 'x' });
  assert.strictEqual(lastType(msgs), 'error');
});

// --- replace scope: everywhere / structure (frames+sections) / text --------

test('replace-all scope "structure" only renames FRAME/SECTION names, ignoring text content and other types', function() {
  var frame = mock.makeNode({ name: 'Header', type: 'FRAME' });
  var section = mock.makeNode({ name: 'Header', type: 'SECTION', children: [] });
  var comp = mock.makeNode({ name: 'Header', type: 'COMPONENT' });
  var text = mock.makeNode({ name: 'Header', type: 'TEXT', characters: 'Header', fontName: { family: 'Inter', style: 'Regular' } });
  var page = mock.makeNode({ name: 'Page', children: [frame, section, comp, text] });
  var figma = loadPlugin(mock.makeFigma([page]));
  figma._send({ type: 'replace-all', name: 'Header', replaceWith: 'Banner', scope: 'structure' });
  return afterAsync(function() {
    assert.strictEqual(frame.name, 'Banner', 'a FRAME name should be renamed');
    assert.strictEqual(section.name, 'Banner', 'a SECTION name should be renamed');
    assert.strictEqual(comp.name, 'Header', 'a COMPONENT name should be left alone — not a frame or section');
    assert.strictEqual(text.name, 'Header', 'a TEXT node\'s own name should be left alone in structure scope');
    assert.strictEqual(text.characters, 'Header', 'text content should be untouched in structure scope');
  });
});

test('replace-all scope "text" only rewrites TEXT content, ignoring every name', function() {
  var text = mock.makeNode({ name: 'Header', type: 'TEXT', characters: 'Header', fontName: { family: 'Inter', style: 'Regular' } });
  var frame = mock.makeNode({ name: 'Header', type: 'FRAME' });
  var page = mock.makeNode({ name: 'Page', children: [text, frame] });
  var figma = loadPlugin(mock.makeFigma([page]));
  figma._send({ type: 'replace-all', name: 'Header', replaceWith: 'Banner', scope: 'text' });
  return afterAsync(function() {
    assert.strictEqual(text.characters, 'Banner', 'the text content should be rewritten');
    assert.strictEqual(text.name, 'Header', 'the TEXT node\'s own name should be left alone in text scope');
    assert.strictEqual(frame.name, 'Header', 'a FRAME name should be left alone in text scope');
  });
});

test('replace-all with no scope (or an unknown one) falls back to everywhere', function() {
  var text = mock.makeNode({ name: 'Header', type: 'TEXT', characters: 'Header', fontName: { family: 'Inter', style: 'Regular' } });
  var frame = mock.makeNode({ name: 'Header', type: 'FRAME' });
  var page = mock.makeNode({ name: 'Page', children: [text, frame] });
  var figma = loadPlugin(mock.makeFigma([page]));
  figma._send({ type: 'replace-all', name: 'Header', replaceWith: 'Banner', scope: 'nonsense' });
  return afterAsync(function() {
    assert.strictEqual(text.characters, 'Banner');
    assert.strictEqual(frame.name, 'Banner');
  });
});

test('replace-all names the active scope in the result message', function() {
  var frame = mock.makeNode({ name: 'Header', type: 'FRAME' });
  var page = mock.makeNode({ name: 'Page', children: [frame] });
  var figma = loadPlugin(mock.makeFigma([page]));
  figma._send({ type: 'replace-all', name: 'Header', replaceWith: 'Banner', scope: 'structure' });
  return afterAsync(function() {
    assert.ok(/in section and frames only/.test(lastText(figma._messages)), 'should name the scope: ' + lastText(figma._messages));
  });
});

test('delete-selected removes the selected nodes', function() {
  var a = mock.makeNode({ name: 'A' });
  var b = mock.makeNode({ name: 'B' });
  var frame = mock.makeNode({ name: 'Canvas', children: [a, b] });
  var figma = loadPlugin(mock.makeFigma([frame]));
  figma.currentPage.selection = [a, b];
  var msgs = figma._send({ type: 'delete-selected' });
  assert.strictEqual(lastType(msgs), 'success');
  assert.strictEqual(frame.children.length, 0);
  assert.strictEqual(figma.currentPage.selection.length, 0);
});

test('actions on an empty selection return a helpful error', function() {
  var figma = loadPlugin(mock.makeFigma([]));
  figma.currentPage.selection = [];
  ['duplicate', 'set-absolute', 'delete-selected'].forEach(function(type) {
    var msgs = figma._send({ type: type });
    assert.strictEqual(lastType(msgs), 'error', type + ' should error on empty selection');
  });
});

runNext(0);
