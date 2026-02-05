# SnapKit v0.0.2-alpha

A Figma plugin for managing prototype elements with absolute positioning, alignment, and component selection.

## Features

### Component Selection
- **Select Component** - Find and select components by name (supports multiple names separated by commas, e.g., "Header, TapBar"; searches within selected frames, or all page frames if nothing is selected)
- **Select Absolute** - Find and select only absolute-positioned components by name (supports multiple names separated by commas; searches within selected frames, or all page frames if nothing is selected)

### Layout Management
- **Duplicate selected** - Clone elements with automatic offset
- **Set to absolute** - Convert elements to absolute positioning within autolayout frames
- **Set fixed scroll** - (Currently disabled due to Figma API limitations)

### Alignment Tools
Organized in two rows of 3 buttons:
- **Row 1 (Horizontal)**: Left, Center, Right
- **Row 2 (Vertical)**: Top, Middle, Bottom

### Cleanup
- **Remove absolute** - Remove absolute-positioned elements (works 3 ways: removes selected absolute elements, removes absolute elements from selected frames, or removes all absolute elements from page if nothing selected)
- **Delete selected** - Delete currently selected elements (danger button)

## Installation

1. In Figma, go to **Plugins** → **Development** → **Import plugin from manifest**
2. Select the `manifest.json` file from this folder
3. The plugin will appear in your Plugins menu

## Usage

### Basic Workflow

1. **Select Parent Frames (Optional)** - Select one or more frames to search within, or leave unselected to search all frames on the page
2. **Use Component Selection** - Type a component name or use "Select Header" to find specific elements
3. **Apply Positioning** - Use "Set to Absolute" or alignment buttons to position elements
4. **Fine-tune** - Use alignment tools to adjust positioning

### Common Use Cases

#### Sticky Header in Prototype
1. Select the frame containing your header
2. Type "Header" in the input field
3. Click "Select Component"
4. Click "Set to Absolute"
5. Click "Align Top" (header will stick to top when scrolling)

#### Fixed Bottom Navigation
1. Select frames with navigation
2. Select the navigation component
3. Click "Set to Absolute"
4. Click "Align Bottom"

#### Clean Up Multiple Frames
1. Select all frames with absolute headers
2. Click "Remove Absolute" to clean up

## Technical Details

- **Language**: Vanilla JavaScript (no build process required)
- **UI Size**: 320px × 560px
- **Figma API**: 1.0.0

## Development

This plugin uses vanilla JavaScript with no compilation or build process.

### Making Changes
1. Edit `code.js` directly
2. In Figma: **Plugins** → **Development** → **Reload plugin**
3. Test your changes

### Backup Strategy
- Manual backups in root folder (`.backup` extension)
- Version archives in `ARCH/` folder

## Files

- `code.js` - Main plugin code
- `manifest.json` - Figma plugin configuration
- `CLAUDE.md` - Detailed technical documentation

## Notes

- Alignment tools automatically set elements to absolute positioning in autolayout frames
- Fixed scroll only works in scrollable containers
- Remove Absolute targets "Header" and "TapBar" component names

## Version

Current: Alpha (in development)

See `ARCH/` folder for previous versions.
