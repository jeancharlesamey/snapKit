// SnapKit UI — talks to code.js (the Figma main thread) over postMessage.
//
// Kept deliberately small and dependency-free: the figma-plugin-ds JS helpers
// are not vendored, so everything here is plain DOM. Stick to getElementById
// and onclick — test/ui.test.js runs this file against a tiny DOM stub.

var frameNameInput = document.getElementById('frameName');
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
var clearNameBtn = document.getElementById('clearName');
var selectionCount = document.getElementById('selectionCount');
var visibilityRadios = [
  document.getElementById('visAll'),
  document.getElementById('visVisible'),
  document.getElementById('visHidden')
];

var typeFilter = 'all';
var visibilityFilter = 'all';
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
// all this has to do.
clearNameBtn.onclick = function() {
  frameNameInput.value = '';
  if (frameNameInput.focus) frameNameInput.focus();
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
    ? 'Element type: components only'
    : value === 'non-component'
      ? 'Element type: everything but components'
      : 'Filter by element type';
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
    setTypeFilter(this.getAttribute('data-type'));
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
  return 'Searching for ' + subject + ' ' + nameText + ' — ' + typeFilterPhrase() +
    ' — ' + visibilityPhrase() + ' — ' + scope;
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
setVisibilityFilter(visibilityFilter);
setSelectionCount(0);
