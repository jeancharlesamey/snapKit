# SnapKit v0.0.3-alpha

A Figma plugin for managing prototype elements with absolute positioning, alignment, and component selection.

**Privacy First**: SnapKit runs entirely within Figma. No data is sent to any server —everything- happens locally in the plugin and your Figma environment.


## FEATURES

### Component Selection
- **Select Component** - Find and select components by name (supports multiple names separated by commas, e.g., "Header, TapBar")
- **Select Absolute** - Find and select only absolute-positioned components by name
- Smart search: searches within selected frames, or all page frames if nothing is selected

### Layout Management
- **Duplicate selected** - Clone elements with automatic 20px offset
- **Set to absolute** - Convert elements to absolute positioning (perfect for sticky headers and fixed navigation)
- **Set fixed scroll** - Currently disabled due to Figma API limitations

### Alignment Tools
Quickly align elements with 6 convenient buttons organized in 2 rows:
- **Row 1 (Horizontal)**: Left, Center, Right
- **Row 2 (Vertical)**: Top, Middle, Bottom

All alignment tools automatically set elements to absolute positioning when needed.

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
2. Click "Select Component" to select all matching components at once


## TIPS

- **Selection matters**: Most buttons become enabled/disabled based on your current selection
- **Comma-separated names**: Search for multiple components at once (e.g., "Header, TapBar, Footer")
- **Sections support**: Remove Absolute now works with Figma sections—it searches all frames within sections
- **Alignment is smart**: Alignment tools automatically convert elements to absolute positioning in autolayout frames


## RELEASE NOTES

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

**Current Version**: v0.0.3-alpha (in development)