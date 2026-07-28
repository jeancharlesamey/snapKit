# SnapKit v1.0.3-alpha

A Figma plugin for finding elements fast and putting them where they belong — search by name, type and visibility, then set absolute positioning, align, duplicate or clean up in one click.

**Privacy first**: SnapKit runs entirely inside Figma. Nothing is sent to a server — everything happens locally in the plugin and in your Figma file.


## INSTALLATION

1. In Figma, go to **Plugins** → **Development** → **Import plugin from manifest**
2. Pick the `manifest.json` file from this folder
3. SnapKit appears in your Plugins menu


## THE PANEL

The panel is split into two titled sections so searching never gets mixed up with changing the document:

```
SELECT
  [ Name(s) comma separated, * as wildcard...  ] [=]   ← filter icon (element type)
  ( ) Visible      ( ) Hidden      (o) All             ← visibility, one line
  [ Select ]                       [ Select absolute ]

ACTIONS
  [ Set to absolute ]              [ Set fixed scroll ]
  [ Duplicate selected ]
  [ Remove absolute ]
  [ Delete selected ]
  [ ← ] [ ↔ ] [ → ]                                    ← align horizontally
  [ ↑ ] [ ↕ ] [ ↓ ]                                    ← align vertically
```

Everything under **Select** only reads the file. Everything under **Actions** modifies it.


## SELECT

### Search by name
Type one or more names in the field and press **Select**. Names are comma separated, so `Header, TapBar, Footer` finds all three in one pass. The search is recursive: it walks into sections, frames and groups, not just the top level.

`*` is a wildcard for any sequence of characters:

| Pattern | Matches |
| --- | --- |
| `Section*` | "Section 1", "Section 2", "Sectionable" |
| `*Nav*` | "MainNav", "Navigation", "Bottom Nav bar" |
| `Tab*Bar` | "TabBar", "Tab Bar", "Tab-Nav-Bar" |

### Select absolute
**Select absolute** runs the same search but keeps only absolute-positioned elements. Unlike **Select**, it accepts an **empty name field** — that means "every absolute element in scope", which is the quickest way to audit the sticky headers and fixed navigation in a prototype.

### Element type filter
The **filter icon** next to the name field opens a small popover with three choices:

- **All types** (default)
- **Components only** — components, variant sets and instances
- **Everything but components** — frames, groups, text, shapes…

Use it when a frame and a real component share a name and you only want one of them. The filter is **sticky**: it stays on your choice until you change it, and a **red dot** on the icon is the reminder that a search is narrowed.

### Visibility filter
The radio group under the name field decides what a search looks at:

- **Visible** — only layers currently shown
- **Hidden** — only layers whose own visibility is off
- **All** (default) — both

**"Hidden" means the layer's own eye icon is off.** Opacity 0, or a visible layer sitting inside a hidden parent, are different states and are *not* treated as hidden. The search still descends into hidden containers, so a visible layer inside a hidden frame is found by the *Visible* filter.

Leave the name field empty, pick **Hidden** and press **Select absolute** to grab every hidden absolute element in scope. The three filters — name, type, visibility — all combine.

### Search scope
- **Frames or sections selected** → SnapKit searches inside them
- **Nothing selected** → SnapKit searches every frame on the page

### Search feedback
While a search runs, the loader spells out what is actually being looked for, so a surprising result is easy to explain:

> *Searching for absolute elements named “Header” — components only — hidden elements only — inside the current selection*

It names the element kind (all elements vs absolute only, from the button you pressed), the name(s) typed (or *with any name* when the field is empty), the type filter, the visibility filter and the scope. A long search cycles through progress messages and, after a while, offers a **Stop the selection** button. The result message repeats the active filters too.


## ACTIONS

### Positioning
- **Set to absolute** — converts the selection to absolute positioning, for sticky headers and fixed navigation. Sections are skipped (Figma cannot make them absolute).
- **Set fixed scroll** — currently disabled: the Figma plugin API does not expose it yet.
- **Duplicate selected** — clones each element right next to the original: the next slot in an autolayout flow, or 8px to the right for absolute and free elements.

### Alignment
Six buttons, two rows — **Left / Center / Right**, then **Top / Middle / Bottom**. Alignment is context aware rather than forcing anything to absolute:

| Selection | What alignment does |
| --- | --- |
| Autolayout frame | Sets the frame's own `primaryAxisAlignItems` / `counterAxisAlignItems` |
| Non-absolute child of an autolayout | Sets `layoutAlign` on the child (cross axis only — the primary axis is not controllable per child) |
| Absolute element, or child of a regular frame | Moves it via x/y, preserving the constraint on the other axis |

**Shift-click** an alignment button with an *absolute autolayout frame* selected to change its internal alignment instead of moving it.

### Cleanup
- **Remove absolute** — works three ways depending on the selection:
  - absolute elements selected → removes those
  - frames or sections selected → removes the absolute elements inside them
  - nothing selected → removes every absolute element on the page
- **Delete selected** — deletes the current selection.

Buttons enable and disable themselves as your selection changes: *Set to absolute* greys out when the selection is already absolute, *Remove absolute* greys out when there is nothing absolute to remove but stays available with nothing selected (whole-page mode).


## RECIPES

**Sticky header**
1. Type `Header` → **Select**
2. **Set to absolute**
3. **Top**

**Fixed bottom navigation**
1. Select the frames containing the navigation
2. Type `TapBar` → **Select**
3. **Set to absolute** → **Bottom**

**Select only real components, ignoring same-named frames**
1. Filter icon → **Components only**
2. Type the name → **Select**

**Audit every hidden layer in a flow**
1. Select the section or frames to check
2. Leave the name field empty, pick **Hidden**
3. **Select** — every hidden layer in scope is selected

**Find hidden copies of one component**
1. Type the component name, pick **Hidden**, filter icon → **Components only**
2. **Select**

**Bulk cleanup**
1. Select the frames to clean, or nothing for the whole page
2. **Remove absolute**


## TIPS

- **Selection drives the UI** — most buttons enable or disable based on what you have selected, and the search scope follows it too
- **Filters are sticky** — the red dot on the filter icon and the highlighted radio are the reminders that a search is narrowed
- **Read the loader** — if a search returns something unexpected, the line under the spinner says exactly what SnapKit looked for
- **Empty name is a feature** — with *Select absolute* or a *Hidden* search it means "everything in scope"
- **Sections are supported** — searches and *Remove absolute* both walk into sections


## DEVELOPMENT

The plugin runs inside Figma, but its logic is covered by a dependency-free test suite that mocks the Figma plugin API:

- `test/plugin.test.js` — every UI message handler (select, select absolute, duplicate, set to absolute, align, remove absolute, delete), including the type and visibility filters
- `test/ui.test.js` — extracts the UI html from `code.js` and runs its inline script against a small DOM stub, covering the filter popover, the visibility radio group, the Select / Actions sections, the loader overlay and its search-context line, and the context-aware button states

```
npm test
```

No `npm install` needed — the tests only use Node built-ins.

Version numbers live in `README.md` (title, release notes, footer), `package.json`, the header comment of `code.js`, and the `name` field of `manifest.json`. The manifest `id` is deliberately left alone: Figma treats it as the plugin's identity.


## RELEASE NOTES

### v1.0.3-alpha (in development)
**New Features:**
- Visibility filter (issue #5, part 3): a Visible / Hidden / All radio group on one line under the name field narrows any search to what is shown or what is hidden. *Hidden* means the layer's own visibility is off — opacity 0 and hidden parents are explicitly not counted. It applies to both Select and Select absolute, combines with the name and type filters, and an empty name field means "everything hidden in scope".

**UI Changes:**
- The panel is now grouped under two titles: **Select** (name field, type filter, visibility radios, Select / Select absolute) and **Actions** (Set to absolute, Set fixed scroll, Duplicate, Remove absolute, Delete, alignment grid), so reading the file and changing it are visually separated
- The loader search context and the result message both name the active visibility filter

**Documentation:**
- README rewritten around the two panel sections, with the search filters documented together, a recipes section, and previously undocumented behaviour written down (Shift-click alignment on absolute autolayout frames, the loader's Stop button, where version numbers live)

### v1.0.2-alpha (July 27, 2026)
**New Features:**
- Explicit search context in the loader (part of issue #5): the spinner now carries a line describing the search in progress — element kind (all vs absolute only, from the button used), the name(s) typed (or "with any name" when the field is empty), the active element type filter and the scope (current selection vs whole page)

**UI Changes:**
- The "a filter is applied" dot on the filter icon is now red and larger (11px), so a narrowed search is impossible to miss

### v1.0.1-alpha (July 27, 2026)
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

**Current Version**: v1.0.3-alpha (in development)
