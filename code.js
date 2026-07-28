// SnapKit - Figma Plugin v1.0.3-alpha
// Comprehensive plugin with alignment, absolute positioning, and component selection

// The panel markup lives in ui/ (built into ui.html by npm run build:ui) and is
// injected here as __html__ through the manifest ui field.
figma.showUI(__html__, { width: 320, height: 420 });

// Listen for selection changes and update UI button states
figma.on('selectionchange', function() {
  var selection = figma.currentPage.selection;
  var hasSelection = selection.length > 0;
  var hasAbsolute = false;
  var hasNonAbsolute = false;
  var hasContainer = false;
  for (var i = 0; i < selection.length; i++) {
    var n = selection[i];
    if ('layoutPositioning' in n && n.layoutPositioning === 'ABSOLUTE') {
      hasAbsolute = true;
    } else if (n.type !== 'FRAME' && n.type !== 'SECTION') {
      hasNonAbsolute = true;
    }
    if (n.type === 'FRAME' || n.type === 'SECTION' || n.type === 'COMPONENT' || n.type === 'INSTANCE' || n.type === 'GROUP') {
      hasContainer = true;
    }
  }
  figma.ui.postMessage({ type: 'selection-change', hasSelection: hasSelection, hasAbsolute: hasAbsolute, hasNonAbsolute: hasNonAbsolute, hasContainer: hasContainer });
});

// Match a node name against a pattern. * is a wildcard that matches any sequence of characters.
// No wildcard → exact match. Examples: "Section*", "*Nav*", "Tab*Bar".
function matchesPattern(name, pattern) {
  if (pattern.indexOf('*') === -1) return name === pattern;
  var regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + regexStr + '$').test(name);
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

// True when the node matches any of the given names. An empty names list means
// "no name filter" and matches everything.
function matchesAnyName(node, names) {
  if (names.length === 0) return true;
  for (var n = 0; n < names.length; n++) {
    // Return on the first hit so a name repeated in the input can't double-push.
    if (matchesPattern(node.name, names[n])) return true;
  }
  return false;
}

// Recursively find children matching any of the given names, the type filter
// and the visibility filter
function findByName(container, names, results, typeFilter, visibility) {
  if (!('children' in container)) return;
  var children = container.children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (matchesAnyName(child, names) && matchesTypeFilter(child, typeFilter) && matchesVisibilityFilter(child, visibility)) {
      results.push(child);
    }
    // Always descend: a filtered-out container can still hold matching children.
    // A hidden frame can hold layers that are visible in their own right, and a
    // visible frame can hold hidden ones.
    if ('children' in child) {
      findByName(child, names, results, typeFilter, visibility);
    }
  }
}

// Recursively find absolute-positioned children matching any of the given names.
// If names is empty, collects all absolute elements (no name filter).
function findAbsoluteByName(container, names, results, typeFilter, visibility) {
  if (!('children' in container)) return;
  var children = container.children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    var isAbsolute = 'layoutPositioning' in child && child.layoutPositioning === 'ABSOLUTE';
    if (isAbsolute && matchesAnyName(child, names) && matchesTypeFilter(child, typeFilter) && matchesVisibilityFilter(child, visibility)) {
      results.push(child);
    }
    if ('children' in child) {
      findAbsoluteByName(child, names, results, typeFilter, visibility);
    }
  }
}

// Select a frame by name within selected frames or all page frames
// Supports multiple names separated by commas (e.g., "Header, TapBar")
// typeFilter narrows the matches to components / non-components, visibility
// narrows them to visible / hidden elements (see above)
function selectFrameByName(nameInput, typeFilter, visibility) {
  var selection = figma.currentPage.selection;
  typeFilter = normalizeTypeFilter(typeFilter);
  visibility = normalizeVisibilityFilter(visibility);

  // Parse comma-separated names and trim whitespace
  var names = nameInput.split(',').map(function(n) { return n.trim(); }).filter(function(n) { return n.length > 0; });

  if (names.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'Please enter at least one component name' });
    return;
  }

  // Determine which frames to search
  var framesToSearch = [];
  var searchScope = '';

  if (selection.length === 0) {
    // No selection: search all frames on the page
    framesToSearch = figma.currentPage.children;
    searchScope = 'on page';
  } else {
    // Selection exists: search within selected frames
    framesToSearch = selection;
    searchScope = 'in selected frames';
  }

  var foundFrames = [];

  for (var s = 0; s < framesToSearch.length; s++) {
    var item = framesToSearch[s];
    // Check the item itself — top-level frames are containers to search inside,
    // but they are also valid candidates (e.g. "Section*" matching top-level "Section 2")
    if (matchesAnyName(item, names) && matchesTypeFilter(item, typeFilter) && matchesVisibilityFilter(item, visibility)) {
      foundFrames.push(item);
    }
    findByName(item, names, foundFrames, typeFilter, visibility);
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
  var selection = figma.currentPage.selection;
  typeFilter = normalizeTypeFilter(typeFilter);
  visibility = normalizeVisibilityFilter(visibility);

  // Parse comma-separated names — empty input means "select all absolute elements"
  var names = nameInput ? nameInput.split(',').map(function(n) { return n.trim(); }).filter(function(n) { return n.length > 0; }) : [];

  // Determine which frames to search
  var framesToSearch = [];
  var searchScope = '';

  if (selection.length === 0) {
    // No selection: search all frames on the page
    framesToSearch = figma.currentPage.children;
    searchScope = 'on page';
  } else {
    // Selection exists: search within selected frames/sections
    framesToSearch = selection;
    searchScope = 'in selected frames';
  }

  var foundFrames = [];

  for (var s = 0; s < framesToSearch.length; s++) {
    var item = framesToSearch[s];
    var itemIsAbsolute = 'layoutPositioning' in item && item.layoutPositioning === 'ABSOLUTE';
    if (itemIsAbsolute && matchesAnyName(item, names) && matchesTypeFilter(item, typeFilter) && matchesVisibilityFilter(item, visibility)) {
      foundFrames.push(item);
    }
    findAbsoluteByName(item, names, foundFrames, typeFilter, visibility);
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
      var isAbsolute = 'layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE';

      if (isInAutolayout && !isAbsolute) {
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
    var nodeIsAbsolute = 'layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE';
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

// Helper function to remove absolute elements from a container (frame or section)
function removeAbsoluteFromContainer(container, removed) {
  if (!('children' in container)) return removed;

  var children = container.children;

  // Iterate backwards when removing
  for (var i = children.length - 1; i >= 0; i--) {
    var child = children[i];

    // If child is a section, recursively search its frames
    if (child.type === 'SECTION' && 'children' in child) {
      removed = removeAbsoluteFromContainer(child, removed);
    }
    // If child is a frame, search for absolute elements
    else if ('children' in child) {
      var frameChildren = child.children;
      for (var j = frameChildren.length - 1; j >= 0; j--) {
        var frameChild = frameChildren[j];
        var isAbsolute = 'layoutPositioning' in frameChild && frameChild.layoutPositioning === 'ABSOLUTE';

        if (isAbsolute) {
          try {
            frameChild.remove();
            removed++;
          } catch (e) {
            // ignore individual removal errors
          }
        }
      }
    }
  }

  return removed;
}

// Delete absolute-positioned components (the "Delete absolute" button)
// Works in 4 ways:
// 1. If absolute elements are selected: removes those elements
// 2. If sections are selected: removes absolute elements from all frames within those sections
// 3. If frames are selected: removes absolute elements within those frames
// 4. If nothing is selected: removes all absolute elements from all sections and frames on the page
function removeAbsoluteComponents() {
  var selection = figma.currentPage.selection;
  var removed = 0;

  // Case 1: Check if any selected elements are absolute-positioned
  if (selection.length > 0) {
    var hasAbsoluteElements = false;

    // Check if any selected elements are absolute-positioned
    for (var i = 0; i < selection.length; i++) {
      if ('layoutPositioning' in selection[i] && selection[i].layoutPositioning === 'ABSOLUTE') {
        hasAbsoluteElements = true;
        break;
      }
    }

    if (hasAbsoluteElements) {
      // Remove selected absolute elements directly
      for (var j = selection.length - 1; j >= 0; j--) {
        if ('layoutPositioning' in selection[j] && selection[j].layoutPositioning === 'ABSOLUTE') {
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
  var containersToSearch = [];
  var searchScope = '';

  if (selection.length === 0) {
    // No selection: search all sections and frames on the page
    containersToSearch = figma.currentPage.children;
    searchScope = 'on page';
  } else {
    // Selection exists: could be sections or frames
    containersToSearch = selection;

    // Check if any sections are in selection
    var hasSections = false;
    for (var k = 0; k < selection.length; k++) {
      if (selection[k].type === 'SECTION') {
        hasSections = true;
        break;
      }
    }

    searchScope = hasSections ? 'in selected sections' : 'in selected frames';
  }

  // Process each container
  for (var s = 0; s < containersToSearch.length; s++) {
    var container = containersToSearch[s];

    // If it's a section, use helper to recursively process
    if (container.type === 'SECTION') {
      removed = removeAbsoluteFromContainer(container, removed);
    }
    // If it's a frame, search its children for absolute elements
    else if ('children' in container) {
      var children = container.children;

      for (var m = children.length - 1; m >= 0; m--) {
        var child = children[m];
        var isAbsolute = 'layoutPositioning' in child && child.layoutPositioning === 'ABSOLUTE';

        if (isAbsolute) {
          try {
            child.remove();
            removed++;
          } catch (e) {
            // ignore individual removal errors
          }
        }
      }
    }
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
  } else if (msg.type === 'check-selection') {
    var sel = figma.currentPage.selection;
    var hasSelection = sel.length > 0;
    var hasAbsolute = false;
    var hasNonAbsolute = false;
    var hasContainer = false;
    for (var i = 0; i < sel.length; i++) {
      var n = sel[i];
      if ('layoutPositioning' in n && n.layoutPositioning === 'ABSOLUTE') {
        hasAbsolute = true;
      } else {
        hasNonAbsolute = true;
      }
      if (n.type === 'FRAME' || n.type === 'SECTION' || n.type === 'COMPONENT' || n.type === 'INSTANCE' || n.type === 'GROUP') {
        hasContainer = true;
      }
    }
    figma.ui.postMessage({ type: 'selection-change', hasSelection: hasSelection, hasAbsolute: hasAbsolute, hasNonAbsolute: hasNonAbsolute, hasContainer: hasContainer });
  }
};
