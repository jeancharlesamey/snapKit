// SnapKit - Figma Plugin v1.0.7-alpha
// Comprehensive plugin with alignment, absolute positioning, and component selection

// The panel markup lives in ui/ (built into ui.html by npm run build:ui) and is
// injected here as __html__ through the manifest ui field.
figma.showUI(__html__, { width: 320, height: 420 });

// --- selection state ----------------------------------------------------------
// Shared by the 'selectionchange' event and the 'check-selection' request so
// the two can never drift out of sync on what counts as absolute / non-absolute
// / a container.
function computeSelectionState(selection) {
  var hasAbsolute = false;
  var hasNonAbsolute = false;
  var hasContainer = false;
  for (var i = 0; i < selection.length; i++) {
    var n = selection[i];
    if (isAbsolute(n)) {
      hasAbsolute = true;
    } else {
      hasNonAbsolute = true;
    }
    if (n.type === 'FRAME' || n.type === 'SECTION' || n.type === 'COMPONENT' || n.type === 'INSTANCE' || n.type === 'GROUP') {
      hasContainer = true;
    }
  }
  return {
    hasSelection: selection.length > 0,
    hasAbsolute: hasAbsolute,
    hasNonAbsolute: hasNonAbsolute,
    hasContainer: hasContainer,
    count: selection.length
  };
}

function postSelectionState(selection) {
  var state = computeSelectionState(selection);
  figma.ui.postMessage({
    type: 'selection-change',
    hasSelection: state.hasSelection,
    hasAbsolute: state.hasAbsolute,
    hasNonAbsolute: state.hasNonAbsolute,
    hasContainer: state.hasContainer,
    count: state.count
  });
}

// Listen for selection changes and update UI button states
figma.on('selectionchange', function() {
  postSelectionState(figma.currentPage.selection);
});

// --- name matching --------------------------------------------------------------
// Match a node name against a pattern. * is a wildcard that matches any sequence
// of characters. No wildcard → exact match. Examples: "Section*", "*Nav*", "Tab*Bar".
//
// Patterns are compiled once per search (compileNamePatterns), not once per node
// visited — a search walks every node in scope, and rebuilding a RegExp on every
// visit is wasted work on a large document.
function compileNamePatterns(names) {
  return names.map(function(pattern) {
    if (pattern.indexOf('*') === -1) {
      return function(name) { return name === pattern; };
    }
    var regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    var re = new RegExp('^' + regexStr + '$');
    return function(name) { return re.test(name); };
  });
}

// True when the name matches any of the compiled patterns. No patterns means
// "no name filter" and matches everything.
function nameMatches(name, matchers) {
  if (matchers.length === 0) return true;
  for (var m = 0; m < matchers.length; m++) {
    // Return on the first hit so a name repeated in the input can't double-push.
    if (matchers[m](name)) return true;
  }
  return false;
}

// --- element type filter ----------------------------------------------------
// Name searches can be narrowed to a kind of element. 'all' (the default)
// matches every type; 'component' keeps only real components, variant sets and
// instances; 'non-component' keeps everything else (frames, groups, text...).
var COMPONENT_TYPES = ['COMPONENT', 'COMPONENT_SET', 'INSTANCE'];

// Accept only the filters we know about, so an unset or stale value from the UI
// falls back to the permissive default instead of matching nothing.
function normalizeTypeFilter(typeFilter) {
  return typeFilter === 'component' || typeFilter === 'non-component' ? typeFilter : 'all';
}

function matchesTypeFilter(node, typeFilter) {
  var isComponent = COMPONENT_TYPES.indexOf(node.type) !== -1;
  if (typeFilter === 'component') return isComponent;
  if (typeFilter === 'non-component') return !isComponent;
  return true;
}

// --- visibility filter ------------------------------------------------------
// Name searches can also be narrowed to what is visible or to what is hidden.
// "Hidden" means the layer's own visibility is off (the eye icon in Figma) —
// opacity 0 or sitting inside a hidden parent are different states and do not
// count as hidden here. 'all' (the default) matches both.
function normalizeVisibilityFilter(visibility) {
  return visibility === 'visible' || visibility === 'hidden' ? visibility : 'all';
}

function matchesVisibilityFilter(node, visibility) {
  // Nodes that never expose `visible` (sections in older files, mocks) count as visible.
  if (visibility === 'visible') return node.visible !== false;
  if (visibility === 'hidden') return node.visible === false;
  return true;
}

// Suffix for result messages, so the plugin says out loud what it searched for.
function searchFilterLabel(typeFilter, visibility) {
  var parts = [];
  if (typeFilter === 'component') parts.push('components only');
  else if (typeFilter === 'non-component') parts.push('non-component elements only');
  if (visibility === 'visible') parts.push('visible only');
  else if (visibility === 'hidden') parts.push('hidden only');
  return parts.length > 0 ? ' (' + parts.join(', ') + ')' : '';
}

// --- tree walking ----------------------------------------------------------
// Visit every descendant of container, depth-first. Every recursive search and
// cleanup below is built on this one traversal, so a fix to how deep a search
// reaches only ever has to happen in one place.
function walkTree(container, visit) {
  if (!('children' in container)) return;
  var children = container.children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    visit(child);
    if ('children' in child) {
      walkTree(child, visit);
    }
  }
}

function isAbsolute(node) {
  return 'layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE';
}

// Find every descendant matching the compiled name patterns, the type filter
// and the visibility filter.
function findByName(container, matchers, results, typeFilter, visibility) {
  walkTree(container, function(child) {
    if (nameMatches(child.name, matchers) && matchesTypeFilter(child, typeFilter) && matchesVisibilityFilter(child, visibility)) {
      results.push(child);
    }
  });
}

// Find every absolute-positioned descendant matching the compiled name
// patterns, the type filter and the visibility filter. Empty matchers means
// "no name filter" (collects every absolute element in scope).
function findAbsoluteByName(container, matchers, results, typeFilter, visibility) {
  walkTree(container, function(child) {
    if (isAbsolute(child) && nameMatches(child.name, matchers) && matchesTypeFilter(child, typeFilter) && matchesVisibilityFilter(child, visibility)) {
      results.push(child);
    }
  });
}

// --- search scope ------------------------------------------------------------
// Nothing selected → the whole page is in scope; otherwise the search stays
// within the current selection. Shared by every action below that needs this.
function getSearchTargets() {
  var selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return { items: figma.currentPage.children, pageWide: true };
  }
  return { items: selection, pageWide: false };
}

// --- replace mode --------------------------------------------------------------
// 'replace' is the element-type filter's 4th option, but it isn't really a type
// filter: picking it swaps the search for a wider rule — a literal, case-
// insensitive substring match against a node's name, or (for TEXT nodes) its
// rendered characters — instead of narrowing by node type. No wildcards, no
// comma-separated list: this is meant to behave like Figma's own Find and
// replace, not the name-search syntax used everywhere else in the plugin.
function escapeRegExp(str) {
  return str.replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

function containsSubstring(haystack, needle) {
  return haystack.toLowerCase().indexOf(needle.toLowerCase()) !== -1;
}

function replaceAllOccurrences(haystack, needle, replacement) {
  var re = new RegExp(escapeRegExp(needle), 'gi');
  return haystack.replace(re, replacement);
}

function countOccurrences(haystack, needle) {
  var re = new RegExp(escapeRegExp(needle), 'gi');
  var found = haystack.match(re);
  return found ? found.length : 0;
}

// Where Replace should look. 'everywhere' (the default) checks a node's name
// AND, for TEXT nodes, its rendered content. 'structure' narrows to just the
// names of FRAME/SECTION nodes (renaming layers, not touching any text).
// 'text' narrows to just TEXT nodes' rendered content (rewriting copy,
// leaving every layer name alone).
function normalizeReplaceScope(scope) {
  return scope === 'structure' || scope === 'text' ? scope : 'everywhere';
}

function replaceScopeLabel(scope) {
  if (scope === 'structure') return ' (in section and frames only)';
  if (scope === 'text') return ' (in text only)';
  return '';
}

// Find every match in scope. The container itself counts as a candidate,
// same as the name search above.
function findReplaceMatches(container, needle, visibility, scope, results) {
  var check = function(node) {
    if (!matchesVisibilityFilter(node, visibility)) return;
    var nameMatch = false;
    var contentMatch = false;
    if (scope === 'structure') {
      nameMatch = (node.type === 'FRAME' || node.type === 'SECTION') && containsSubstring(node.name, needle);
    } else if (scope === 'text') {
      contentMatch = node.type === 'TEXT' && 'characters' in node && containsSubstring(node.characters, needle);
    } else {
      nameMatch = containsSubstring(node.name, needle);
      contentMatch = node.type === 'TEXT' && 'characters' in node && containsSubstring(node.characters, needle);
    }
    if (nameMatch || contentMatch) {
      results.push({ node: node, nameMatch: nameMatch, contentMatch: contentMatch });
    }
  };
  check(container);
  walkTree(container, check);
}

// A text run can mix fonts, and Figma throws if you set .characters without
// loading every font used first — this loads them all, not just the first.
function loadFontsForTextNode(node) {
  var fontNames = node.getRangeAllFontNames(0, node.characters.length);
  return Promise.all(fontNames.map(function(font) { return figma.loadFontAsync(font); }));
}

// Renaming is synchronous, same as everywhere else in the plugin. Editing text
// content needs the font-load step above, so this — and only this — is async.
function replaceOne(match, needle, replacement) {
  var occurrences = 0;
  if (match.nameMatch) {
    occurrences += countOccurrences(match.node.name, needle);
    match.node.name = replaceAllOccurrences(match.node.name, needle, replacement);
  }
  if (!match.contentMatch) {
    return Promise.resolve(occurrences);
  }
  return loadFontsForTextNode(match.node).then(function() {
    occurrences += countOccurrences(match.node.characters, needle);
    match.node.characters = replaceAllOccurrences(match.node.characters, needle, replacement);
    return occurrences;
  });
}

// Replace every match found — whole page, or the current selection, same as
// every other search/select action. One sweep, one result message; no
// per-match stepping.
function replaceAll(nameInput, replaceWith, visibility, scope) {
  visibility = normalizeVisibilityFilter(visibility);
  scope = normalizeReplaceScope(scope);
  var needle = (nameInput || '').trim();
  var replacement = replaceWith || '';

  if (!needle) {
    figma.ui.postMessage({ type: 'error', text: 'Please enter text to find' });
    return;
  }

  var searchTargets = getSearchTargets();
  var itemsToSearch = searchTargets.items;
  var searchScope = searchTargets.pageWide ? 'on page' : 'in selected frames';
  var scopeLabel = replaceScopeLabel(scope);

  var matches = [];
  for (var i = 0; i < itemsToSearch.length; i++) {
    findReplaceMatches(itemsToSearch[i], needle, visibility, scope, matches);
  }

  if (matches.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'No matches for "' + needle + '" found ' + searchScope + scopeLabel });
    return;
  }

  // One match failing (most commonly: a TEXT node using a font Figma can't
  // load) must not abort every match after it in the chain, and must not
  // throw away the ones already written to the file before it. Each match is
  // caught individually, so the run always gets through the whole list.
  var chain = Promise.resolve({ occurrences: 0, nodes: [], failed: 0 });
  matches.forEach(function(match) {
    chain = chain.then(function(result) {
      return replaceOne(match, needle, replacement).then(function(count) {
        result.occurrences += count;
        result.nodes.push(match.node);
        return result;
      }, function() {
        result.failed++;
        return result;
      });
    });
  });

  chain.then(function(result) {
    if (result.nodes.length > 0) {
      figma.currentPage.selection = result.nodes;
      // A failure here (e.g. a matched node that's locked or hidden) doesn't
      // mean the replace itself failed — the text/name edits already landed.
      try {
        figma.viewport.scrollAndZoomIntoView(result.nodes);
      } catch (e) {
        // not fatal — selection still reflects what was actually changed
      }
    }
    var text = 'Replaced ' + result.occurrences + ' occurrence(s) in ' + result.nodes.length + ' element(s) ' + searchScope + scopeLabel;
    if (result.failed > 0) {
      text += ' (' + result.failed + ' element(s) could not be updated — often a font Figma could not load)';
    }
    figma.ui.postMessage({ type: 'success', text: text });
  }).catch(function(e) {
    figma.ui.postMessage({ type: 'error', text: 'Could not complete the replace: ' + (e && e.message ? e.message : e) });
  });
}

// Select a frame by name within selected frames or all page frames
// Supports multiple names separated by commas (e.g., "Header, TapBar")
// typeFilter narrows the matches to components / non-components, visibility
// narrows them to visible / hidden elements (see above)
function selectFrameByName(nameInput, typeFilter, visibility) {
  typeFilter = normalizeTypeFilter(typeFilter);
  visibility = normalizeVisibilityFilter(visibility);

  // Parse comma-separated names and trim whitespace
  var names = nameInput.split(',').map(function(n) { return n.trim(); }).filter(function(n) { return n.length > 0; });

  if (names.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'Please enter at least one component name' });
    return;
  }

  var matchers = compileNamePatterns(names);
  var scope = getSearchTargets();
  var framesToSearch = scope.items;
  var searchScope = scope.pageWide ? 'on page' : 'in selected frames';

  var foundFrames = [];

  for (var s = 0; s < framesToSearch.length; s++) {
    var item = framesToSearch[s];
    // Check the item itself — top-level frames are containers to search inside,
    // but they are also valid candidates (e.g. "Section*" matching top-level "Section 2")
    if (nameMatches(item.name, matchers) && matchesTypeFilter(item, typeFilter) && matchesVisibilityFilter(item, visibility)) {
      foundFrames.push(item);
    }
    findByName(item, matchers, foundFrames, typeFilter, visibility);
  }

  // Create display text for names
  var namesDisplay = names.length === 1 ? '"' + names[0] + '"' : names.map(function(n) { return '"' + n + '"'; }).join(', ');
  var filterLabel = searchFilterLabel(typeFilter, visibility);

  if (foundFrames.length > 0) {
    figma.currentPage.selection = foundFrames;
    figma.viewport.scrollAndZoomIntoView(foundFrames);
    figma.ui.postMessage({ type: 'success', text: 'Found and selected ' + foundFrames.length + ' element(s) named ' + namesDisplay + ' ' + searchScope + filterLabel });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'No elements named ' + namesDisplay + ' found ' + searchScope + filterLabel });
  }
}

// Select absolute-positioned components by name within selected frames or all page frames
// Supports multiple names separated by commas (e.g., "Header, TapBar")
// Only selects components with layoutPositioning === 'ABSOLUTE'
// typeFilter narrows the matches to components / non-components, visibility
// narrows them to visible / hidden elements (see above)
function selectAbsoluteByName(nameInput, typeFilter, visibility) {
  typeFilter = normalizeTypeFilter(typeFilter);
  visibility = normalizeVisibilityFilter(visibility);

  // Parse comma-separated names — empty input means "select all absolute elements"
  var names = nameInput ? nameInput.split(',').map(function(n) { return n.trim(); }).filter(function(n) { return n.length > 0; }) : [];
  var matchers = compileNamePatterns(names);

  var scope = getSearchTargets();
  var framesToSearch = scope.items;
  var searchScope = scope.pageWide ? 'on page' : 'in selected frames';

  var foundFrames = [];

  for (var s = 0; s < framesToSearch.length; s++) {
    var item = framesToSearch[s];
    if (isAbsolute(item) && nameMatches(item.name, matchers) && matchesTypeFilter(item, typeFilter) && matchesVisibilityFilter(item, visibility)) {
      foundFrames.push(item);
    }
    findAbsoluteByName(item, matchers, foundFrames, typeFilter, visibility);
  }

  var filterLabel = searchFilterLabel(typeFilter, visibility);
  var successText, errorText;
  if (names.length === 0) {
    successText = 'Found and selected ' + foundFrames.length + ' absolute element(s) ' + searchScope + filterLabel;
    errorText = 'No absolute elements found ' + searchScope + filterLabel;
  } else {
    var namesDisplay = names.length === 1 ? '"' + names[0] + '"' : names.map(function(n) { return '"' + n + '"'; }).join(', ');
    successText = 'Found and selected ' + foundFrames.length + ' absolute element(s) named ' + namesDisplay + ' ' + searchScope + filterLabel;
    errorText = 'No absolute elements named ' + namesDisplay + ' found ' + searchScope + filterLabel;
  }

  if (foundFrames.length > 0) {
    figma.currentPage.selection = foundFrames;
    figma.viewport.scrollAndZoomIntoView(foundFrames);
    figma.ui.postMessage({ type: 'success', text: successText });
  } else {
    figma.ui.postMessage({ type: 'error', text: errorText });
  }
}

// Duplicate selected element
function duplicateSelected() {
  var selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'Please select an element first' });
    return;
  }

  var duplicated = [];

  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];
    if (!('clone' in node)) continue;

    var parent = node.parent;
    var dup = node.clone(); // clone() appends to end of parent.children automatically

    if (parent) {
      var isInAutolayout = 'layoutMode' in parent && parent.layoutMode !== 'NONE';

      if (isInAutolayout && !isAbsolute(node)) {
        // Move clone to right after the original in the autolayout flow
        var nodeIndex = parent.children.indexOf(node);
        parent.insertChild(nodeIndex + 1, dup);
      } else {
        // Absolute or no autolayout: place immediately to the right of the original
        dup.x = node.x + node.width + 8;
        dup.y = node.y;
      }
    }

    duplicated.push(dup);
  }

  if (duplicated.length > 0) {
    figma.currentPage.selection = duplicated;
    figma.ui.postMessage({ type: 'success', text: 'Duplicated ' + duplicated.length + ' element(s)' });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'Could not duplicate' });
  }
}

// Delete selected elements
function deleteSelected() {
  var selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'Please select elements to delete' });
    return;
  }

  var deleted = 0;

  for (var i = selection.length - 1; i >= 0; i--) {
    try {
      selection[i].remove();
      deleted++;
    } catch (e) {
      // ignore individual removal errors
    }
  }

  // Clear selection after deletion
  figma.currentPage.selection = [];

  if (deleted > 0) {
    figma.ui.postMessage({ type: 'success', text: 'Deleted ' + deleted + ' element(s)' });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'Could not delete elements' });
  }
}

// Set selected element to absolute position within autolayout
function setToAbsolute() {
  var selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'Please select an element first' });
    return;
  }

  var count = 0;
  var processedNodes = [];
  var skippedSections = 0;

  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];

    // Skip sections - they cannot be set to absolute positioning
    if (node.type === 'SECTION') {
      skippedSections++;
      continue;
    }

    var parent = node.parent;

    if (!parent) continue;

    var isInAutolayout = 'layoutMode' in parent && parent.layoutMode !== 'NONE';

    if (isInAutolayout) {
      if ('layoutPositioning' in node) {
        node.layoutPositioning = 'ABSOLUTE';
        node.x = 0;
        node.y = 0;

        if ('constraints' in node) {
          node.constraints = { horizontal: 'MIN', vertical: 'MIN' };
        }

        count++;
        processedNodes.push(node);
      }
    } else {
      node.y = 0;
      node.x = 0;

      if ('constraints' in node) {
        node.constraints = { horizontal: 'MIN', vertical: 'MIN' };
      }

      count++;
      processedNodes.push(node);
    }
  }

  if (processedNodes.length > 0) {
    figma.currentPage.selection = processedNodes;
  }

  if (count > 0) {
    var message = 'Set ' + count + ' element(s) to absolute position';
    if (skippedSections > 0) {
      message += ' (skipped ' + skippedSections + ' section(s))';
    }
    figma.ui.postMessage({ type: 'success', text: message });
  } else if (skippedSections > 0) {
    figma.ui.postMessage({ type: 'error', text: 'Sections cannot be set to absolute position' });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'Could not set to absolute position' });
  }
}

// Toggle fixed scroll behavior using numberOfFixedChildren API
function setFixedWhenScrolling(node, isFixed) {
  var parent = node.parent;
  if (!parent || !('numberOfFixedChildren' in parent)) {
    return false;
  }

  var children = parent.children;
  var idx = -1;
  for (var i = 0; i < children.length; i++) {
    if (children[i] === node) {
      idx = i;
      break;
    }
  }

  if (idx === -1) return false;

  var currentFixedCount = parent.numberOfFixedChildren;
  var nodeIsCurrentlyFixed = idx < currentFixedCount;

  if (isFixed && !nodeIsCurrentlyFixed) {
    // Move node to position 0 (top of fixed section)
    parent.insertChild(0, node);
    parent.numberOfFixedChildren = 1;
    return true;
  } else if (!isFixed && nodeIsCurrentlyFixed) {
    // Move node to position numberOfFixedChildren (just after fixed section)
    var newIdx = currentFixedCount;
    parent.insertChild(newIdx, node);
    parent.numberOfFixedChildren = Math.max(0, currentFixedCount - 1);
    return true;
  }

  return false;
}

// Set selected elements to fixed scroll
function setFixedScroll() {
  var selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'Please select an element first' });
    return;
  }

  var count = 0;

  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];
    var parent = node.parent;

    if (!parent) continue;

    if ('numberOfFixedChildren' in parent) {
      if (setFixedWhenScrolling(node, true)) {
        count++;
      }
    }
  }

  if (count > 0) {
    figma.ui.postMessage({ type: 'success', text: 'Set ' + count + ' element(s) to fixed scroll' });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'Selected elements must be inside a scrollable container' });
  }
}

// Align selected elements to a specific position
function alignElements(position, shift) {
  var selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'Please select an element first' });
    return;
  }

  var count = 0;

  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];
    var parent = node.parent;

    if (!parent) continue;

    var nodeIsAutolayout = 'layoutMode' in node && node.layoutMode !== 'NONE';
    var nodeIsAbsolute = isAbsolute(node);
    var parentIsAutolayout = 'layoutMode' in parent && parent.layoutMode !== 'NONE';

    if (nodeIsAutolayout && (!nodeIsAbsolute || shift)) {
      // Autolayout container: change its internal alignment properties.
      // Applies to non-absolute frames, and to absolute frames when Shift is held.
      var isHorizontal = node.layoutMode === 'HORIZONTAL';
      if (isHorizontal) {
        // Primary axis = horizontal, counter axis = vertical
        if (position === 'left')        { node.primaryAxisAlignItems = 'MIN';    count++; }
        else if (position === 'center') { node.primaryAxisAlignItems = 'CENTER'; count++; }
        else if (position === 'right')  { node.primaryAxisAlignItems = 'MAX';    count++; }
        else if (position === 'top')    { node.counterAxisAlignItems = 'MIN';    count++; }
        else if (position === 'middle') { node.counterAxisAlignItems = 'CENTER'; count++; }
        else if (position === 'bottom') { node.counterAxisAlignItems = 'MAX';    count++; }
      } else {
        // VERTICAL layout — primary axis = vertical, counter axis = horizontal
        if (position === 'top')         { node.primaryAxisAlignItems = 'MIN';    count++; }
        else if (position === 'middle') { node.primaryAxisAlignItems = 'CENTER'; count++; }
        else if (position === 'bottom') { node.primaryAxisAlignItems = 'MAX';    count++; }
        else if (position === 'left')   { node.counterAxisAlignItems = 'MIN';    count++; }
        else if (position === 'center') { node.counterAxisAlignItems = 'CENTER'; count++; }
        else if (position === 'right')  { node.counterAxisAlignItems = 'MAX';    count++; }
      }
    } else if (!nodeIsAbsolute && parentIsAutolayout) {
      // Non-absolute child inside an autolayout: use layoutAlign for cross-axis only.
      // Primary-axis position is not controllable per-child — skip silently.
      if (!('layoutAlign' in node)) continue;
      var parentIsHorizontal = parent.layoutMode === 'HORIZONTAL';
      if (parentIsHorizontal) {
        if (position === 'top')         { node.layoutAlign = 'MIN';    count++; }
        else if (position === 'middle') { node.layoutAlign = 'CENTER'; count++; }
        else if (position === 'bottom') { node.layoutAlign = 'MAX';    count++; }
      } else {
        if (position === 'left')        { node.layoutAlign = 'MIN';    count++; }
        else if (position === 'center') { node.layoutAlign = 'CENTER'; count++; }
        else if (position === 'right')  { node.layoutAlign = 'MAX';    count++; }
      }
    } else {
      // Absolute element or regular frame child: position via x/y.
      // Only update the aligned axis; preserve the other axis's constraint.
      var parentWidth = parent.width;
      var parentHeight = parent.height;
      var curH = ('constraints' in node) ? node.constraints.horizontal : 'MIN';
      var curV = ('constraints' in node) ? node.constraints.vertical : 'MIN';

      if (position === 'top') {
        node.y = 0;
        if ('constraints' in node) { node.constraints = { horizontal: curH, vertical: 'MIN' }; }
      } else if (position === 'middle') {
        node.y = (parentHeight - node.height) / 2;
        if ('constraints' in node) { node.constraints = { horizontal: curH, vertical: 'CENTER' }; }
      } else if (position === 'bottom') {
        node.y = parentHeight - node.height;
        if ('constraints' in node) { node.constraints = { horizontal: curH, vertical: 'MAX' }; }
      } else if (position === 'left') {
        node.x = 0;
        if ('constraints' in node) { node.constraints = { horizontal: 'MIN', vertical: curV }; }
      } else if (position === 'center') {
        node.x = (parentWidth - node.width) / 2;
        if ('constraints' in node) { node.constraints = { horizontal: 'CENTER', vertical: curV }; }
      } else if (position === 'right') {
        node.x = parentWidth - node.width;
        if ('constraints' in node) { node.constraints = { horizontal: 'MAX', vertical: curV }; }
      }

      count++;
    }
  }

  if (count > 0) {
    figma.ui.postMessage({ type: 'success', text: 'Aligned ' + count + ' element(s)' });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'Could not align elements' });
  }
}

// Remove every absolute-positioned descendant of a container (frame, section,
// or anything with children). Fully recursive — an absolute element nested any
// number of levels deep is found, not just direct children or one level into a
// section's frames. Collects matches first, then removes them, so removal never
// mutates the array walkTree is iterating.
function removeAbsoluteFromContainer(container) {
  var toRemove = [];
  walkTree(container, function(child) {
    if (isAbsolute(child)) toRemove.push(child);
  });

  var removed = 0;
  for (var i = 0; i < toRemove.length; i++) {
    try {
      toRemove[i].remove();
      removed++;
    } catch (e) {
      // ignore individual removal errors
    }
  }
  return removed;
}

// Delete absolute-positioned components (the "Delete absolute" button)
// Works in 4 ways:
// 1. If absolute elements are selected: removes those elements
// 2. If sections are selected: removes absolute elements from anywhere within those sections
// 3. If frames are selected: removes absolute elements from anywhere within those frames
// 4. If nothing is selected: removes every absolute element on the page
function removeAbsoluteComponents() {
  var selection = figma.currentPage.selection;
  var removed = 0;

  // Case 1: Check if any selected elements are absolute-positioned
  if (selection.length > 0) {
    var hasAbsoluteElements = false;

    for (var i = 0; i < selection.length; i++) {
      if (isAbsolute(selection[i])) {
        hasAbsoluteElements = true;
        break;
      }
    }

    if (hasAbsoluteElements) {
      // Remove selected absolute elements directly
      for (var j = selection.length - 1; j >= 0; j--) {
        if (isAbsolute(selection[j])) {
          try {
            selection[j].remove();
            removed++;
          } catch (e) {
            // ignore individual removal errors
          }
        }
      }

      if (removed > 0) {
        figma.ui.postMessage({ type: 'success', text: 'Deleted ' + removed + ' absolute element(s)' });
      } else {
        figma.ui.postMessage({ type: 'error', text: 'No absolute elements in selection' });
      }
      return;
    }
  }

  // Case 2, 3 & 4: Sections/Frames selected or nothing selected
  var scope = getSearchTargets();
  var containersToSearch = scope.items;
  var searchScope;

  if (scope.pageWide) {
    searchScope = 'on page';
  } else {
    var hasSections = false;
    for (var k = 0; k < containersToSearch.length; k++) {
      if (containersToSearch[k].type === 'SECTION') {
        hasSections = true;
        break;
      }
    }
    searchScope = hasSections ? 'in selected sections' : 'in selected frames';
  }

  for (var s = 0; s < containersToSearch.length; s++) {
    removed += removeAbsoluteFromContainer(containersToSearch[s]);
  }

  if (removed > 0) {
    figma.ui.postMessage({ type: 'success', text: 'Deleted ' + removed + ' absolute element(s) ' + searchScope });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'No absolute elements found ' + searchScope });
  }
}

// Listen for messages from UI
figma.ui.onmessage = function(msg) {
  if (msg.type === 'select-frame') {
    selectFrameByName(msg.name, msg.typeFilter, msg.visibility);
  } else if (msg.type === 'select-absolute') {
    selectAbsoluteByName(msg.name, msg.typeFilter, msg.visibility);
  } else if (msg.type === 'duplicate') {
    duplicateSelected();
  } else if (msg.type === 'delete-selected') {
    deleteSelected();
  } else if (msg.type === 'set-absolute') {
    setToAbsolute();
  } else if (msg.type === 'set-fixed-scroll') {
    setFixedScroll();
  } else if (msg.type === 'align') {
    alignElements(msg.position, msg.shift);
  } else if (msg.type === 'remove-absolute') {
    removeAbsoluteComponents();
  } else if (msg.type === 'replace-all') {
    replaceAll(msg.name, msg.replaceWith, msg.visibility, msg.scope);
  } else if (msg.type === 'clear-selection') {
    figma.currentPage.selection = [];
  } else if (msg.type === 'resize') {
    // The panel's own content height changes when a row like the Replace
    // field shows or hides — the UI measures itself and asks for exactly the
    // height it needs, rather than the window staying fixed and the extra
    // content scrolling.
    figma.ui.resize(320, msg.height);
  } else if (msg.type === 'check-selection') {
    postSelectionState(figma.currentPage.selection);
  }
};
