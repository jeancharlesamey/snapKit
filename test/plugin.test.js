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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
