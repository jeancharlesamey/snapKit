// SnapKit - Figma Plugin
// Comprehensive plugin with alignment, absolute positioning, and component selection

var uiHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; background: #fff; } .container { display: flex; flex-direction: column; gap: 12px; } input { width: 100%; padding: 10px; border: 2px solid #ccc; border-radius: 6px; font-size: 14px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; transition: border-color 0.12s ease; } input:focus, input:active, input:not(:placeholder-shown) { outline: none; border-color: #00AC28; } button { padding: 8px; background: white; color: #00AC28; border: 2px solid #00AC28; border-radius: 6px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; font-weight: 500; line-height: 24px; cursor: pointer; transition: all 0.12s ease; display: flex; align-items: center; justify-content: center; gap: 6px; } button:hover { background: rgba(0, 172, 40, 0.05); } button:active { background: rgba(0, 172, 40, 0.1); } button.disabled { background: #f5f5f5; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; } button.danger { background: #FEF2F2; color: #DC2626; border-color: #DC2626; } button.danger:hover { background: rgba(220, 38, 38, 0.1); } button.danger:active { background: rgba(220, 38, 38, 0.15); } button.danger.disabled { background: #f5f5f5; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; } button svg { width: 16px; height: 16px; } .button-group { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .button-group.align-buttons { grid-template-columns: repeat(3, 1fr); } .button-group.align-buttons button { padding: 8px 12px; font-size: 13px; } .message { position: fixed; top: 16px; left: 16px; right: 16px; padding: 10px; border-radius: 4px; font-size: 12px; display: none; z-index: 9999; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); } .message.show { display: block; } .message.success { background: #D4EDDA; color: #155724; border: 1px solid #C3E6CB; } .message.error { background: #F8D7DA; color: #721C24; border: 1px solid #F5C6CB; } .overlay { position: fixed; inset: 0; background: rgba(255,255,255,0.5); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 16px; z-index: 10000; padding: 24px; text-align: center; } .overlay.show { display: flex; } .spinner { width: 32px; height: 32px; border: 3px solid rgba(0,172,40,0.2); border-top-color: #00AC28; border-radius: 50%; animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } } .overlay-msgs { position: relative; height: 40px; width: 200px; } .overlay-msg { position: absolute; top: 0; left: 0; right: 0; font-size: 13px; color: #333; line-height: 1.5; text-align: center; opacity: 0; } .overlay.show .m1 { animation: msgCycle 3s ease forwards; } .overlay.show .m2 { animation: msgCycle 5s ease forwards 3s; } .overlay.show .m3 { animation: msgCycle 4s ease forwards 8s; } .overlay.show .m4 { animation: msgCycle 5s ease forwards 12s; } .overlay.show .m5 { animation: msgFadeIn 0.5s ease forwards 17s; } .overlay.show .overlay-stop { animation: msgFadeIn 0.5s ease forwards 17s; } @keyframes msgCycle { 0% { opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } } @keyframes msgFadeIn { from { opacity: 0; } to { opacity: 1; } } .overlay-stop { opacity: 0; padding: 8px 16px; background: white; color: #DC2626; border: 2px solid #DC2626; border-radius: 6px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 4px; }</style></head><body><div class="container"><div id="message" class="message"></div><input id="frameName" type="text" placeholder="Enter component name(s), comma separated..."><div class="button-group"><button id="selectBtn">Select component</button><button id="selectAbsoluteBtn">Select absolute</button></div><button id="duplicateBtn">Duplicate selected</button><button id="absoluteBtn">Set to absolute</button><button id="fixedScrollBtn" class="disabled" title="Not yet possible due to Figma API limitations">Set fixed scroll</button><button id="removeAbsBtn">Remove absolute</button><button id="deleteBtn" class="danger">Delete selected</button><div class="button-group align-buttons"><button id="alignLeftBtn" title="Align Left"><svg viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 1v13M5 3h8M5 7h6M5 11h10"/></svg></button><button id="alignCenterBtn" title="Align Center"><svg viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7.5 1v13M4 3h7M3 7h9M2 11h11"/></svg></button><button id="alignRightBtn" title="Align Right"><svg viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 1v13M10 3H2M10 7H4M10 11H0"/></svg></button><button id="alignTopBtn" title="Align Top"><svg viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 2h13M3 5v8M7 5v6M11 5v10"/></svg></button><button id="alignMiddleBtn" title="Align Middle"><svg viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 7.5h13M3 3v9M7 4v7M11 2v11"/></svg></button><button id="alignBottomBtn" title="Align Bottom"><svg viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 13h13M3 10v-8M7 10v-6M11 10v-10"/></svg></button></div></div><div class="overlay" id="overlay"><div class="spinner"></div><div class="overlay-msgs"><span class="overlay-msg m1">Search to select components in progress</span><span class="overlay-msg m2">A lot of things to look at</span><span class="overlay-msg m3">Still in progress, and you?</span><span class="overlay-msg m4">Digging in the last frame</span><span class="overlay-msg m5">We are letting you cancel the selection if you think a problem happened</span></div><button class="overlay-stop" id="overlayStop">Stop the selection</button></div><script>var frameNameInput = document.getElementById("frameName"); var selectBtn = document.getElementById("selectBtn"); var selectAbsoluteBtn = document.getElementById("selectAbsoluteBtn"); var duplicateBtn = document.getElementById("duplicateBtn"); var absoluteBtn = document.getElementById("absoluteBtn"); var fixedScrollBtn = document.getElementById("fixedScrollBtn"); var alignLeftBtn = document.getElementById("alignLeftBtn"); var alignCenterBtn = document.getElementById("alignCenterBtn"); var alignRightBtn = document.getElementById("alignRightBtn"); var alignTopBtn = document.getElementById("alignTopBtn"); var alignMiddleBtn = document.getElementById("alignMiddleBtn"); var alignBottomBtn = document.getElementById("alignBottomBtn"); var removeAbsBtn = document.getElementById("removeAbsBtn"); var deleteBtn = document.getElementById("deleteBtn"); var messageDiv = document.getElementById("message"); var overlayDiv = document.getElementById("overlay"); var overlayStop = document.getElementById("overlayStop"); function showOverlay() { overlayDiv.classList.remove("show"); void overlayDiv.offsetWidth; overlayDiv.classList.add("show"); } function hideOverlay() { overlayDiv.classList.remove("show"); } overlayStop.onclick = function() { hideOverlay(); }; selectBtn.onclick = function() { var name = frameNameInput.value.trim(); if (!name) { showMessage("Please enter a component name", "error"); return; } showOverlay(); parent.postMessage({ pluginMessage: { type: "select-frame", name: name } }, "*"); }; selectAbsoluteBtn.onclick = function() { var name = frameNameInput.value.trim(); if (!name) { showMessage("Please enter a component name", "error"); return; } showOverlay(); parent.postMessage({ pluginMessage: { type: "select-absolute", name: name } }, "*"); }; duplicateBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "duplicate" } }, "*"); }; absoluteBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "set-absolute" } }, "*"); }; fixedScrollBtn.onclick = function() { showMessage("Set fixed scroll is not yet possible due to Figma API limitations", "error"); }; removeAbsBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "remove-absolute" } }, "*"); }; deleteBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "delete-selected" } }, "*"); }; alignLeftBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "align", position: "left" } }, "*"); }; alignCenterBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "align", position: "center" } }, "*"); }; alignRightBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "align", position: "right" } }, "*"); }; alignTopBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "align", position: "top" } }, "*"); }; alignMiddleBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "align", position: "middle" } }, "*"); }; alignBottomBtn.onclick = function() { parent.postMessage({ pluginMessage: { type: "align", position: "bottom" } }, "*"); }; window.onmessage = function(event) { var msg = event.data.pluginMessage; if (msg.type === "success") { hideOverlay(); showMessage(msg.text, "success"); } else if (msg.type === "error") { hideOverlay(); showMessage(msg.text, "error"); } else if (msg.type === "selection-change") { updateButtonStates(msg.hasSelection); } }; function showMessage(text, type) { messageDiv.textContent = text; messageDiv.className = "message " + type + " show"; setTimeout(function() { messageDiv.className = "message"; }, 3000); } function updateButtonStates(hasSelection) { var buttonsToDisable = [duplicateBtn, absoluteBtn, removeAbsBtn, deleteBtn, alignLeftBtn, alignCenterBtn, alignRightBtn, alignTopBtn, alignMiddleBtn, alignBottomBtn]; for (var i = 0; i < buttonsToDisable.length; i++) { if (hasSelection) { buttonsToDisable[i].classList.remove("disabled"); buttonsToDisable[i].disabled = false; } else { buttonsToDisable[i].classList.add("disabled"); buttonsToDisable[i].disabled = true; } } } parent.postMessage({ pluginMessage: { type: "check-selection" } }, "*");<\/script></body></html>';

figma.showUI(uiHtml, { width: 320, height: 560 });

// Listen for selection changes and update UI button states
figma.on('selectionchange', function() {
  var hasSelection = figma.currentPage.selection.length > 0;
  figma.ui.postMessage({ type: 'selection-change', hasSelection: hasSelection });
});

// Recursively find children matching any of the given names
function findByName(container, names, results) {
  if (!('children' in container)) return;
  var children = container.children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    for (var n = 0; n < names.length; n++) {
      if (child.name === names[n]) {
        results.push(child);
        break; // prevent double-push if the same name appears twice in input
      }
    }
    if ('children' in child) {
      findByName(child, names, results);
    }
  }
}

// Recursively find absolute-positioned children matching any of the given names
function findAbsoluteByName(container, names, results) {
  if (!('children' in container)) return;
  var children = container.children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    var isAbsolute = 'layoutPositioning' in child && child.layoutPositioning === 'ABSOLUTE';
    if (isAbsolute) {
      for (var n = 0; n < names.length; n++) {
        if (child.name === names[n]) {
          results.push(child);
          break; // prevent double-push if the same name appears twice in input
        }
      }
    }
    if ('children' in child) {
      findAbsoluteByName(child, names, results);
    }
  }
}

// Select a frame by name within selected frames or all page frames
// Supports multiple names separated by commas (e.g., "Header, TapBar")
function selectFrameByName(nameInput) {
  var selection = figma.currentPage.selection;

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
    findByName(framesToSearch[s], names, foundFrames);
  }

  // Create display text for names
  var namesDisplay = names.length === 1 ? '"' + names[0] + '"' : names.map(function(n) { return '"' + n + '"'; }).join(', ');

  if (foundFrames.length > 0) {
    figma.currentPage.selection = foundFrames;
    figma.viewport.scrollAndZoomIntoView(foundFrames);
    figma.ui.postMessage({ type: 'success', text: 'Found and selected ' + foundFrames.length + ' component(s) named ' + namesDisplay + ' ' + searchScope });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'No components named ' + namesDisplay + ' found ' + searchScope });
  }
}

// Select absolute-positioned components by name within selected frames or all page frames
// Supports multiple names separated by commas (e.g., "Header, TapBar")
// Only selects components with layoutPositioning === 'ABSOLUTE'
function selectAbsoluteByName(nameInput) {
  var selection = figma.currentPage.selection;

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
    findAbsoluteByName(framesToSearch[s], names, foundFrames);
  }

  // Create display text for names
  var namesDisplay = names.length === 1 ? '"' + names[0] + '"' : names.map(function(n) { return '"' + n + '"'; }).join(', ');

  if (foundFrames.length > 0) {
    figma.currentPage.selection = foundFrames;
    figma.viewport.scrollAndZoomIntoView(foundFrames);
    figma.ui.postMessage({ type: 'success', text: 'Found and selected ' + foundFrames.length + ' absolute component(s) named ' + namesDisplay + ' ' + searchScope });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'No absolute components named ' + namesDisplay + ' found ' + searchScope });
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
function alignElements(position) {
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

    if (nodeIsAutolayout) {
      // Node is itself an autolayout container: change its internal alignment properties
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
    } else if (parentIsAutolayout && !nodeIsAbsolute) {
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

// Remove absolute-positioned components
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
        figma.ui.postMessage({ type: 'success', text: 'Removed ' + removed + ' absolute element(s)' });
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
    figma.ui.postMessage({ type: 'success', text: 'Removed ' + removed + ' absolute element(s) ' + searchScope });
  } else {
    figma.ui.postMessage({ type: 'error', text: 'No absolute elements found ' + searchScope });
  }
}

// Listen for messages from UI
figma.ui.onmessage = function(msg) {
  if (msg.type === 'select-frame') {
    selectFrameByName(msg.name);
  } else if (msg.type === 'select-absolute') {
    selectAbsoluteByName(msg.name);
  } else if (msg.type === 'duplicate') {
    duplicateSelected();
  } else if (msg.type === 'delete-selected') {
    deleteSelected();
  } else if (msg.type === 'set-absolute') {
    setToAbsolute();
  } else if (msg.type === 'set-fixed-scroll') {
    setFixedScroll();
  } else if (msg.type === 'align') {
    alignElements(msg.position);
  } else if (msg.type === 'remove-absolute') {
    removeAbsoluteComponents();
  } else if (msg.type === 'check-selection') {
    var hasSelection = figma.currentPage.selection.length > 0;
    figma.ui.postMessage({ type: 'selection-change', hasSelection: hasSelection });
  }
};
