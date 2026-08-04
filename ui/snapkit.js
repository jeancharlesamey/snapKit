// SnapKit UI — talks to code.js (the Figma main thread) over postMessage.
//
// Kept deliberately small and dependency-free: the figma-plugin-ds JS helpers
// are not vendored, so everything here is plain DOM. Stick to getElementById
// and onclick — test/ui.test.js runs this file against a tiny DOM stub.

var frameNameInput = document.getElementById('frameName');
// Restored whenever the filter leaves Replace mode — read once up front so
// the two placeholder strings never have to be kept in sync by hand.
var defaultNamePlaceholder = frameNameInput.placeholder;
var selectBtn = document.getElementById('selectBtn');
var selectAbsoluteBtn = document.getElementById('selectAbsoluteBtn');
var duplicateBtn = document.getElementById('duplicateBtn');
var absoluteBtn = document.getElementById('absoluteBtn');
var fixedScrollBtn = document.getElementById('fixedScrollBtn');
var alignLeftBtn = document.getElementById('alignLeftBtn');
var alignCenterBtn = document.getElementById('alignCenterBtn');
var alignRightBtn = document.getElementById('alignRightBtn');
var alignTopBtn = document.getElementById('alignTopBtn');
var alignMiddleBtn = document.getElementById('alignMiddleBtn');
var alignBottomBtn = document.getElementById('alignBottomBtn');
var deleteAbsBtn = document.getElementById('deleteAbsBtn');
var deleteBtn = document.getElementById('deleteBtn');
var messageDiv = document.getElementById('message');
var overlayDiv = document.getElementById('overlay');
var overlayStop = document.getElementById('overlayStop');
var overlayContext = document.getElementById('overlayContext');
var filterBtn = document.getElementById('filterBtn');
var filterPopover = document.getElementById('filterPopover');
var filterOptions = filterPopover.querySelectorAll('.select-menu__item');
var filterDividerLabel = document.getElementById('filterDividerLabel');
// Keyed by the same data-type values the 3 dropdown items already carry —
// reused as plain slot identifiers so Replace mode doesn't need its own copy
// of the menu, just a different label and meaning for each existing slot.
var filterLabelEls = {
  all: document.getElementById('filterLabelAll'),
  component: document.getElementById('filterLabelComponent'),
  'non-component': document.getElementById('filterLabelNonComponent')
};
var TYPE_FILTER_LABELS = { all: 'All types', component: 'Components only', 'non-component': 'Everything but components' };
var REPLACE_SCOPE_LABELS = { all: 'Everywhere', component: 'In section and frames only', 'non-component': 'In text only' };
var DATA_TYPE_TO_REPLACE_SCOPE = { all: 'everywhere', component: 'structure', 'non-component': 'text' };
var REPLACE_SCOPE_TO_DATA_TYPE = { everywhere: 'all', structure: 'component', text: 'non-component' };
var clearNameBtn = document.getElementById('clearName');
var selectionCount = document.getElementById('selectionCount');
var replaceRow = document.getElementById('replaceRow');
var replaceWithInput = document.getElementById('replaceWith');
var replaceAllBtn = document.getElementById('replaceAllBtn');
var replaceToggleBtn = document.getElementById('replaceToggleBtn');
var selectionOnlySection = document.getElementById('selectionOnlySection');
var selectionSectionHideTimer = null;
var visibilityRadios = [
  document.getElementById('visAll'),
  document.getElementById('visVisible'),
  document.getElementById('visHidden')
];

var typeFilter = 'all';
var visibilityFilter = 'all';
var replaceMode = false;
var replaceScope = 'everywhere';
var hasSelectionScope = false;

// --- visibility filter ------------------------------------------------------

function setVisibilityFilter(value) {
  visibilityFilter = value;
  for (var i = 0; i < visibilityRadios.length; i++) {
    visibilityRadios[i].checked = visibilityRadios[i].getAttribute('data-visibility') === value;
  }
}

for (var vi = 0; vi < visibilityRadios.length; vi++) {
  visibilityRadios[vi].onclick = function() {
    setVisibilityFilter(this.getAttribute('data-visibility'));
  };
}

// --- name field -------------------------------------------------------------

// The X is shown/hidden by css off :placeholder-shown, so emptying the field is
// most of this. It also clears the canvas selection: the X means "start this
// search over", and a stale selection would otherwise silently narrow the next
// one to "in selected frames" instead of the whole page.
clearNameBtn.onclick = function() {
  frameNameInput.value = '';
  if (frameNameInput.focus) frameNameInput.focus();
  parent.postMessage({ pluginMessage: { type: 'clear-selection' } }, '*');
};

// --- element type filter ----------------------------------------------------

function setTypeFilter(value) {
  typeFilter = value;
  for (var i = 0; i < filterOptions.length; i++) {
    filterOptions[i].classList.toggle(
      'select-menu__item--selected',
      filterOptions[i].getAttribute('data-type') === value
    );
  }
  filterBtn.classList.toggle('is-active', value !== 'all');
  filterBtn.title = value === 'component'
    ? 'Selection scope: components only'
    : value === 'non-component'
      ? 'Selection scope: everything but components'
      : 'Filter by selection scope';
}

// --- replace mode ------------------------------------------------------------
// Its own toggle rather than a type-filter option: Replace isn't a kind of
// element to narrow by, it's a different mode that widens the search to text
// content and swaps in a literal find/replace instead of the name syntax.
//
// The 3-item dropdown is reused rather than duplicated: in Replace mode its
// same 3 slots mean where to look (everywhere / frame+section names only /
// text content only) instead of which element type to keep, so only the
// labels and what a click sets need to change per mode — see
// updateFilterLabels() and the filterOptions click handler below.
function updateFilterLabels() {
  var labels = replaceMode ? REPLACE_SCOPE_LABELS : TYPE_FILTER_LABELS;
  for (var key in filterLabelEls) {
    filterLabelEls[key].textContent = labels[key];
  }
  filterDividerLabel.textContent = replaceMode ? 'Replace scope' : 'Selection scope';
}

// Fades .snapkit-selection-only in or out around Replace mode. Hiding waits
// for the opacity transition to finish before switching to display:none and
// shrinking the panel — collapsing the space immediately would clip the fade
// mid-flight. Showing does the opposite: the space (and the resize to fit it)
// come back right away, then the content fades in within it.
function setSelectionSectionVisible(visible) {
  clearTimeout(selectionSectionHideTimer);
  if (visible) {
    selectionOnlySection.classList.remove('is-hidden');
    // Forces layout before the opacity class is removed, so the browser
    // treats it as a transition rather than a no-op from the display swap.
    void selectionOnlySection.offsetHeight;
    selectionOnlySection.classList.remove('is-fading');
  } else {
    selectionOnlySection.classList.add('is-fading');
    selectionSectionHideTimer = setTimeout(function() {
      selectionOnlySection.classList.add('is-hidden');
      resizeToFitContent();
    }, 200);
  }
}

function setReplaceMode(active) {
  replaceMode = active;
  replaceToggleBtn.classList.toggle('is-active', active);
  // The ✕ is what actually reads as "click again to close this", not just the
  // color/weight change from the is-active class.
  replaceToggleBtn.textContent = active ? 'Replace ✕' : 'Replace';
  replaceRow.classList.toggle('is-visible', active);
  setSelectionSectionVisible(!active);
  // The name field doubles as the "find" text in Replace mode — its usual
  // wildcard/comma-list placeholder would be actively misleading there, since
  // this mode takes a plain literal string instead.
  frameNameInput.placeholder = active ? 'Text to find...' : defaultNamePlaceholder;
  // Leaving Replace mode resets it fully — the find/replace text is specific
  // to that mode and would otherwise sit there unseen, stale, next time it's
  // turned back on.
  if (!active) {
    frameNameInput.value = '';
    replaceWithInput.value = '';
  }
  updateFilterLabels();
  // Refresh which dropdown item shows as selected, and the filter icon's dot
  // and tooltip, for whichever state (type filter or replace scope) is the
  // one that actually applies now.
  if (active) {
    setReplaceScope(replaceScope);
  } else {
    setTypeFilter(typeFilter);
  }
  // The panel's own content height just changed (a whole row appeared or
  // disappeared) — resize the actual plugin window to match, rather than
  // leaving it fixed and letting the extra content scroll.
  resizeToFitContent();
}

function setReplaceScope(scope) {
  replaceScope = scope;
  var activeDataType = REPLACE_SCOPE_TO_DATA_TYPE[scope];
  for (var i = 0; i < filterOptions.length; i++) {
    filterOptions[i].classList.toggle(
      'select-menu__item--selected',
      filterOptions[i].getAttribute('data-type') === activeDataType
    );
  }
  filterBtn.classList.toggle('is-active', scope !== 'everywhere');
  filterBtn.title = scope === 'structure'
    ? 'Replace scope: section and frame names only'
    : scope === 'text'
      ? 'Replace scope: text content only'
      : 'Replace scope: everywhere';
}

replaceToggleBtn.onclick = function() {
  setReplaceMode(!replaceMode);
};

// The window starts at a fixed size (figma.showUI in code.js) and never
// changes on its own — Figma only resizes it when asked to. Measuring is
// deferred a frame: reading scrollHeight in the same tick as the classList
// toggle that hides a row can catch the layout mid-update and report the
// old, taller height — that showed up as the panel never shrinking back
// down once the replace row had made it grow.
function resizeToFitContent() {
  requestAnimationFrame(function() {
    parent.postMessage({ pluginMessage: { type: 'resize', height: document.body.scrollHeight } }, '*');
  });
}

function closeFilterPopover() {
  filterPopover.classList.remove('select-menu__menu--active');
}

filterBtn.onclick = function(e) {
  e.stopPropagation();
  filterPopover.classList.toggle('select-menu__menu--active');
};

for (var fi = 0; fi < filterOptions.length; fi++) {
  filterOptions[fi].onclick = function(e) {
    e.stopPropagation();
    var clickedType = this.getAttribute('data-type');
    if (replaceMode) {
      // Same 3 slots, different meaning: this sets where Replace looks, not
      // the element-type filter.
      var clickedScope = DATA_TYPE_TO_REPLACE_SCOPE[clickedType];
      setReplaceScope(clickedScope === replaceScope ? 'everywhere' : clickedScope);
    } else {
      // Clicking the already-checked option again toggles it off, back to the
      // default, rather than being a no-op.
      setTypeFilter(clickedType === typeFilter ? 'all' : clickedType);
    }
    closeFilterPopover();
  };
}

document.body.onclick = closeFilterPopover;

// --- search feedback --------------------------------------------------------

function typeFilterPhrase() {
  return typeFilter === 'component'
    ? 'components only'
    : typeFilter === 'non-component'
      ? 'everything but components'
      : 'all types';
}

function visibilityPhrase() {
  return visibilityFilter === 'visible'
    ? 'visible elements only'
    : visibilityFilter === 'hidden'
      ? 'hidden elements only'
      : 'visible and hidden';
}

// Spelled out under the spinner so a surprising result is easy to explain.
function searchContextText(mode, name) {
  var names = name.split(',').map(function(n) { return n.trim(); }).filter(function(n) { return n.length > 0; });
  var subject = mode === 'absolute' ? 'absolute elements' : 'elements';
  var nameText = names.length
    ? 'named ' + names.map(function(n) { return '“' + n + '”'; }).join(', ')
    : 'with any name';
  var scope = hasSelectionScope ? 'inside the current selection' : 'across the whole page';
  return 'Searching for ' + subject + ' ' + nameText + ' / ' + typeFilterPhrase() +
    ' / ' + visibilityPhrase() + ' / ' + scope;
}

function replaceScopePhrase() {
  return replaceScope === 'structure'
    ? 'section and frame names only'
    : replaceScope === 'text'
      ? 'text content only'
      : 'everywhere';
}

// Same shape as searchContextText, but the find/replace strings are literal —
// no wildcard, no comma list — so they're just quoted as typed.
function replaceContextText(findText, replaceText) {
  var searchScope = hasSelectionScope ? 'inside the current selection' : 'across the whole page';
  return 'Replacing “' + findText + '” with “' + (replaceText || '') + '” / ' + replaceScopePhrase() +
    ' / ' + visibilityPhrase() + ' / ' + searchScope;
}

function showOverlay(context) {
  overlayContext.textContent = context || '';
  // Restart the message animations for every new search.
  overlayDiv.classList.remove('is-visible');
  void overlayDiv.offsetWidth;
  overlayDiv.classList.add('is-visible');
}

function hideOverlay() {
  overlayDiv.classList.remove('is-visible');
}

overlayStop.onclick = function() { hideOverlay(); };

function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = 'snapkit-toast is-visible' + (type === 'error' ? ' snapkit-toast--error' : '');
  setTimeout(function() { messageDiv.className = 'snapkit-toast'; }, 3000);
}

// --- select -----------------------------------------------------------------

selectBtn.onclick = function() {
  var name = frameNameInput.value.trim();
  if (!name) {
    showMessage('Please enter a component name', 'error');
    return;
  }
  showOverlay(searchContextText('select', name));
  parent.postMessage({ pluginMessage: { type: 'select-frame', name: name, typeFilter: typeFilter, visibility: visibilityFilter } }, '*');
};

selectAbsoluteBtn.onclick = function() {
  // An empty name is allowed here: it means every absolute element in scope.
  var name = frameNameInput.value.trim();
  showOverlay(searchContextText('absolute', name));
  parent.postMessage({ pluginMessage: { type: 'select-absolute', name: name, typeFilter: typeFilter, visibility: visibilityFilter } }, '*');
};

// --- replace ------------------------------------------------------------

replaceAllBtn.onclick = function() {
  // Reuses the name field as the "find" text — the new field only holds the
  // replacement — so this is the same empty-input guard selectBtn uses.
  var findText = frameNameInput.value.trim();
  if (!findText) {
    showMessage('Please enter text to find', 'error');
    return;
  }
  showOverlay(replaceContextText(findText, replaceWithInput.value));
  parent.postMessage({ pluginMessage: { type: 'replace-all', name: findText, replaceWith: replaceWithInput.value, visibility: visibilityFilter, scope: replaceScope } }, '*');
};

// --- actions ----------------------------------------------------------------

duplicateBtn.onclick = function() {
  parent.postMessage({ pluginMessage: { type: 'duplicate' } }, '*');
};

absoluteBtn.onclick = function() {
  parent.postMessage({ pluginMessage: { type: 'set-absolute' } }, '*');
};

fixedScrollBtn.onclick = function() {
  showMessage('Set fixed scroll is not yet possible due to Figma API limitations', 'error');
};

deleteAbsBtn.onclick = function() {
  parent.postMessage({ pluginMessage: { type: 'remove-absolute' } }, '*');
};

deleteBtn.onclick = function() {
  parent.postMessage({ pluginMessage: { type: 'delete-selected' } }, '*');
};

function alignHandler(position) {
  return function(e) {
    parent.postMessage({ pluginMessage: { type: 'align', position: position, shift: e.shiftKey } }, '*');
  };
}

alignLeftBtn.onclick = alignHandler('left');
alignCenterBtn.onclick = alignHandler('center');
alignRightBtn.onclick = alignHandler('right');
alignTopBtn.onclick = alignHandler('top');
alignMiddleBtn.onclick = alignHandler('middle');
alignBottomBtn.onclick = alignHandler('bottom');

// --- messages from the plugin ----------------------------------------------

window.onmessage = function(event) {
  var msg = event.data.pluginMessage;
  if (msg.type === 'success') {
    hideOverlay();
    showMessage(msg.text, 'success');
  } else if (msg.type === 'error') {
    hideOverlay();
    showMessage(msg.text, 'error');
  } else if (msg.type === 'selection-change') {
    updateButtonStates(msg.hasSelection, msg.hasAbsolute, msg.hasNonAbsolute, msg.hasContainer, msg.count);
  }
};

// The toast that announces a search result is gone after 3s; the title keeps the
// number on screen for as long as the selection lives.
function setSelectionCount(count) {
  selectionCount.textContent = '(' + (count || 0) + ')';
}

function updateButtonStates(hasSelection, hasAbsolute, hasNonAbsolute, hasContainer, count) {
  hasSelectionScope = hasSelection;
  setSelectionCount(count);
  var baseButtons = [duplicateBtn, deleteBtn, alignLeftBtn, alignCenterBtn, alignRightBtn, alignTopBtn, alignMiddleBtn, alignBottomBtn];
  for (var i = 0; i < baseButtons.length; i++) {
    baseButtons[i].disabled = !hasSelection;
  }
  absoluteBtn.disabled = !hasNonAbsolute;
  // Delete absolute stays available with nothing selected: that is page-wide mode.
  deleteAbsBtn.disabled = !(!hasSelection || hasAbsolute || hasContainer);
}

parent.postMessage({ pluginMessage: { type: 'check-selection' } }, '*');
setTypeFilter(typeFilter);
setReplaceMode(replaceMode);
setVisibilityFilter(visibilityFilter);
setSelectionCount(0);
