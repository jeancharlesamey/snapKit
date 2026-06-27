// Minimal mock of the Figma plugin API, just enough to exercise SnapKit's
// code.js (figma.*) outside of the Figma editor. Build a document tree with
// makeNode(), drive figma.ui.onmessage(...), and inspect figma._messages.

'use strict';

var nodeId = 0;

// Build a scene node. Only the keys you pass are added, so `in` checks
// (e.g. 'children' in node, 'layoutPositioning' in node) behave like Figma's.
function makeNode(spec) {
  spec = spec || {};
  var node = {
    id: 'n' + (nodeId++),
    name: spec.name != null ? spec.name : 'node',
    type: spec.type || 'FRAME',
    x: spec.x != null ? spec.x : 0,
    y: spec.y != null ? spec.y : 0,
    width: spec.width != null ? spec.width : 100,
    height: spec.height != null ? spec.height : 100,
    parent: null,
    _spec: spec
  };

  // Optional properties — only present when the spec asks for them, so that
  // `'prop' in node` matches the real API surface.
  if ('layoutMode' in spec) node.layoutMode = spec.layoutMode;
  if ('layoutPositioning' in spec) node.layoutPositioning = spec.layoutPositioning;
  if ('layoutAlign' in spec) node.layoutAlign = spec.layoutAlign;
  if ('constraints' in spec) node.constraints = spec.constraints;
  if ('primaryAxisAlignItems' in spec) node.primaryAxisAlignItems = spec.primaryAxisAlignItems;
  if ('counterAxisAlignItems' in spec) node.counterAxisAlignItems = spec.counterAxisAlignItems;
  if ('numberOfFixedChildren' in spec) node.numberOfFixedChildren = spec.numberOfFixedChildren;

  // Every scene node can be cloned and removed.
  node.clone = function() {
    var copySpec = Object.assign({}, spec);
    delete copySpec.children; // a clone is a leaf in this mock
    var copy = makeNode(copySpec);
    copy.name = node.name;
    if (node.parent) {
      copy.parent = node.parent;
      node.parent.children.push(copy);
    }
    return copy;
  };

  node.remove = function() {
    if (node.parent && node.parent.children) {
      var idx = node.parent.children.indexOf(node);
      if (idx !== -1) node.parent.children.splice(idx, 1);
    }
    node._removed = true;
  };

  if ('children' in spec) {
    node.children = spec.children || [];
    for (var i = 0; i < node.children.length; i++) {
      node.children[i].parent = node;
    }
    node.insertChild = function(index, child) {
      if (child.parent && child.parent.children) {
        var cur = child.parent.children.indexOf(child);
        if (cur !== -1) child.parent.children.splice(cur, 1);
      }
      node.children.splice(index, 0, child);
      child.parent = node;
    };
  }

  return node;
}

// Create a fresh figma global backed by the given page children.
function makeFigma(pageChildren) {
  var page = makeNode({ type: 'PAGE', name: 'Page 1', children: pageChildren || [] });
  page.selection = [];

  var listeners = {};

  var figma = {
    currentPage: page,
    _messages: [],            // everything posted to the UI, in order
    _ui: { handler: null },
    viewport: {
      scrollAndZoomIntoView: function() {}
    },
    showUI: function() {},
    on: function(event, cb) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    },
    _emit: function(event) {
      (listeners[event] || []).forEach(function(cb) { cb(); });
    },
    ui: {
      postMessage: function(msg) { figma._messages.push(msg); },
      set onmessage(fn) { figma._ui.handler = fn; },
      get onmessage() { return figma._ui.handler; }
    },
    // Convenience: deliver a message from the UI to the plugin.
    _send: function(msg) {
      figma._messages = [];
      figma._ui.handler(msg);
      return figma._messages;
    }
  };

  return figma;
}

module.exports = { makeNode: makeNode, makeFigma: makeFigma };
