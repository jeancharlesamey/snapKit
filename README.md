# SnapKit v1.0.1-alpha

A Figma plugin for managing prototype elements with absolute positioning, alignment, and component selection.

**Privacy First**: SnapKit runs entirely within Figma. No data is sent to any server —everything- happens locally in the plugin and your Figma environment.


## FEATURES

### Element Selection
- **Select** - Find and select elements by name (supports multiple names separated by commas, e.g., "Header, TapBar")
- **Select Absolute** - Find and select only absolute-positioned elements by name — leave the name empty to get every absolute element in scope
- **Name wildcards** - `*` matches any sequence of characters, so `Section*` finds "Section 1" and "Section 2", and `*Nav*` finds anything containing "Nav"
- **Element type filter** - The filter icon next to the name field opens a small popover to narrow a search to **All types** (default), **Components only** (components, variant sets, instances), or **Everything but components** (frames, groups, text, shapes...). A green dot on the icon shows when a filter is active, and the result message names what was searched
- Smart search: searches within selected frames, or all page frames if nothing is selected

### Layout Management
- **Duplicate selected** - Clone elements placed immediately next to the original (in autolayout flow, or to the right for absolute/free elements)
- **Set to absolute** - Convert elements to absolute positioning (perfect for sticky headers and fixed navigation)
- **Set fixed scroll** - Currently disabled due to Figma API limitations

### Alignment Tools
Quickly align elements with 6 convenient buttons organized in 2 rows:
- **Row 1 (Horizontal)**: Left, Center, Right
- **Row 2 (Vertical)**: Top, Middle, Bottom

Alignment adapts to the selected element's context:
- **Autolayout frame** selected → changes the frame's own internal alignment (`primaryAxisAlignItems` / `counterAxisAlignItems`)
- **Non-absolute child** inside an autolayout → changes `layoutAlign` on the child (cross-axis only)
- **Absolute element** or regular frame child → moves via x/y position

### Cleanup
- **Remove absolute** - Smart removal that works 3 ways:
  - With absolute elements selected: removes those elements
  - With frames/sections selected: removes absolute elements within them
  - With nothing selected: removes all absolute elements from the page
- **Delete selected** - Delete currently selected elements


## INSTALLATION

1. In Figma, go to **Plugins** → **Development** → **Import plugin from manifest**
2. Select the `manifest.json` file from this folder
3. The plugin will appear in your Plugins menu


## DEVELOPMENT

The plugin runs entirely inside Figma, but its core logic (`code.js`) is covered
by a dependency-free test suite that mocks the Figma plugin API and exercises
every UI message handler (select, duplicate, set-to-absolute, align, remove,
delete). A second suite extracts the UI html from `code.js` and runs its inline
script against a small DOM stub, covering the filter popover, the loader overlay
and the context-aware button states. Run both with Node:

```
npm test
```

No `npm install` is required — the tests use only Node's built-in modules.


## USAGE

### Quick Start

1. **Select frames (optional)** - Select frames to search within, or leave unselected to search the entire page
2. **Find components** - Type a component name in the input field and click "Select Component"
3. **Position elements** - Use "Set to Absolute" and alignment buttons to position
4. **Fine-tune** - Adjust positioning with alignment tools

### Common Use Cases

#### Sticky Header in Prototype
1. Type "Header" in the input field
2. Click "Select Component"
3. Click "Set to Absolute"
4. Click "Top" to align to top (header will now stick when scrolling)

#### Fixed Bottom Navigation
1. Select frames containing navigation
2. Type "TapBar" or your navigation component name
3. Click "Select Component"
4. Click "Set to Absolute"
5. Click "Bottom" to align to bottom

#### Bulk Cleanup
1. Select frames with absolute elements, or leave nothing selected to clean the entire page
2. Click "Remove Absolute"
3. All absolute-positioned elements will be removed from selected scope

#### Multi-Component Selection
1. Type multiple component names separated by commas: "Header, TapBar, Footer"
2. Click "Select" to select all matching elements at once

#### Select Only Real Components (Ignore Same-Named Frames)
1. Click the filter icon next to the name field
2. Choose "Components only"
3. Type the name and click "Select" — frames and groups with that name are skipped
4. Choose "Everything but components" to do the opposite, or "All types" to reset


## TIPS

- **Selection matters**: Most buttons become enabled/disabled based on your current selection
- **Comma-separated names**: Search for multiple components at once (e.g., "Header, TapBar, Footer")
- **Wildcards**: `*` stands for any sequence of characters — "Tab*Bar" and "*Nav*" both work
- **Type filter is sticky**: It stays on the chosen type until you change it — the dot on the filter icon is the reminder that a search is narrowed
- **Sections support**: Remove Absolute now works with Figma sections—it searches all frames within sections
- **Alignment is context-aware**: Aligning an autolayout frame changes its internal alignment; aligning a child inside autolayout changes its cross-axis alignment; aligning an absolute element moves it via x/y


## RELEASE NOTES

### v1.0.1-alpha (in development)
**New Features:**
- Added element type filter for name searches (issue #2, and part 1 of issue #5): a filter icon next to the name field opens a popover with All types (default) / Components only / Everything but components. Applies to both Select and Select Absolute; the active filter shows as a dot on the icon and is named in the result message.

**Improvements:**
- Added a loader for massive search
- Added `*` wildcard support to name searches, and Select Absolute now accepts an empty name to mean "every absolute element in scope"
- Improved: Button states are now context-aware based on the selected element's positioning
  - "Set to absolute" is disabled when the selection is already absolute, or when a frame/section is selected
  - "Remove absolute" is disabled when the selection contains no absolute elements and no frames/sections
  - "Remove absolute" stays accessible with no selection (whole-page mode) or when frames/sections are selected

### v0.0.4-alpha (April 30, 2026)
**Improvements:**
- Improved: Alignment buttons are now context-aware — no longer forces elements to absolute positioning
  - Autolayout frames: updates `primaryAxisAlignItems` / `counterAxisAlignItems`
  - Non-absolute children in autolayout: updates `layoutAlign` (cross-axis only)
  - Absolute elements and regular frame children: moves via x/y, preserves the other axis's constraint
- Improved: Duplicate now places the clone next to the original — in autolayout flow (index + 1) or immediately to the right (x + width + 8px) for absolute/free elements
- Improved: Component search (Select Component, Select Absolute) is now recursive — finds components nested inside sections and sub-frames, not just direct children

**Fixes:**
- Fixed: Alignment buttons no longer reset both constraint axes to MIN — only the aligned axis is updated
- Fixed: Four `var i` redeclarations in Remove Absolute function (linter warnings)
- Fixed: Misleading code comment on name-deduplication break statement

### v0.0.3-alpha (February 5, 2026)
**Improvements:**
- Renamed plugin from "PrototypFix" to "SnapKit"
- Added dynamic button states—buttons now show grey when no elements are selected
- Added automatic selection change detection—UI updates instantly when you change selection in Figma
- Improved: Remove Absolute now supports Figma sections—searches all frames within selected sections
- Improved: Remove Absolute with no selection now searches through all sections and frames on the page

**Fixes:**
- Fixed: Delete button now correctly shows grey when no elements are selected
- Fixed: Set to Absolute now skips sections (sections cannot be absolute positioned)

**UI Changes:**
- Removed plugin header/title from UI window for cleaner interface

### v0.0.2-alpha (February 4, 2026)
**New Features:**
- Added multi-component selection: search for multiple components using comma-separated names
- Added "Select Absolute" button: find only absolute-positioned components by name
- Added "Middle" alignment button: vertical center alignment with CENTER constraint
- Added "Delete Selected" button: danger-styled button for deleting selected elements

**Improvements:**
- Enhanced Select Component: now searches all page frames when nothing is selected (better UX)
- Enhanced Remove Absolute: now works 3 ways (selected elements, selected frames, or entire page)
- Enhanced Remove Absolute: now removes ANY absolute-positioned elements, not just specific names
- Reorganized alignment buttons: 2 rows of 3 buttons (Horizontal: Left/Center/Right, Vertical: Top/Middle/Bottom)
- Reorganized UI: Select Component and Select Absolute now in 2-column layout
- Complete UI redesign: secondary button style with green borders, white backgrounds, Inter font
- Updated input field: green border when focused/active/filled

**Changes:**
- Removed "Select Header" button (use "Select Component" with "Header" name instead)
- Disabled "Set Fixed Scroll" button (Figma API limitations—shown with tooltip)
- Button text now uses sentence case (only first letter capitalized)

**Documentation:**
- Added comprehensive README.md
- Added CLAUDE.md technical documentation
- Cleaned up unused project files

## SUPPORT

For issues or feedback, please contact the plugin maintainer via github.

---

**Current Version**: v0.0.4-alpha (in development)
