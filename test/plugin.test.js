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

// Load a fresh copy of the plugin bound to the given figma global, then return
// it so the test can drive figma._send(...) and inspect figma._messages.
function loadPlugin(figma) {
  var ctx = { figma: figma, console: console };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx, { filename: 'code.js' });
  return figma;
}

function lastType(messages) {
  return messages.length ? messages[messages.length - 1].type : null;
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
