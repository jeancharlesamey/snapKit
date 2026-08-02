# SnapKit v1.0.6-alpha

A Figma plugin for finding elements fast and putting them where they belong / search by name, type and visibility, then set absolute positioning, align, duplicate or clean up in one click, or CMD+SHIFT+R to replace by the copied elements.

**Privacy first**: SnapKit runs entirely inside Figma. Nothing is sent to a server — everything happens locally in the plugin and in your Figma file.


## INSTALLATION

1. In Figma, go to **Plugins** → **Development** → **Import plugin from manifest**
2. Pick the `manifest.json` file from this folder
3. SnapKit appears in your Plugins menu


## THE PANEL

SnapKit is built with [`plugin-ds-skill`](https://github.com/jeancharlesamey/plugin-ds-skill), so every control — buttons, the search field, the radios, the type menu, the icons — is the one Figma uses itself. The library is vendored in the repo (see [Development](#development)); nothing is fetched from the network.

The panel is split into two titled sections so searching never gets mixed up with changing the document:

```
SELECTION (9)                                         ← how many are selected now
  [ 🔍 Name(s) comma separated, * ...  ✕ ] [⚙]        ← ✕ clears it, ⚙ = element type
  (o) All          ( ) Visible     ( ) Hidden         ← visibility, one line
  [ Select ]                       [ Select absolute ]

ACTIONS
  [ Set to absolute ]              [ Set fixed scroll ]
  [ Duplicate selected ]
  [ Delete absolute ]
  [ Delete selected ]
  [ ← ] [ ↔ ] [ → ]                                     ← align horizontally
  [ ↑ ] [ ↕ ] [ ↓ ]                                     ← align vertically
```

The **Selection** title carries the number of elements currently selected, so the result of a search is still readable after the toast that announced it has faded. Everything under **Selection** only reads the file. Everything under **Actions** modifies it — the two destructive ones, *Delete absolute* and *Delete selected*, are the red buttons.


## SELECTION

### Search by name
Type one or more names in the field and press **Select**. Names are comma separated, so `Header, TapBar, Footer` finds all three in one pass. The search is recursive: it walks into sections, frames and groups, not just the top level. Once the field has something in it, an **✕** appears at its right end to empty it in one click.

`*` is a wildcard for any sequence of characters:

| Pattern | Matches |
| --- | --- |
| `Section*` | "Section 1", "Section 2", "Sectionable" |
| `*Nav*` | "MainNav", "Navigation", "Bottom Nav bar" |
| `Tab*Bar` | "TabBar", "Tab Bar", "Tab-Nav-Bar" |

### Select absolute
**Select absolute** runs the same search but keeps only absolute-positioned elements. Unlike **Select**, it accepts an **empty name field** — that means "every absolute element in scope", which is the quickest way to audit the sticky headers and fixed navigation in a prototype.

### Element type filter
The **filter icon** next to the name field opens a small menu — the dark HUD menu Figma uses for its own dropdowns — with three choices:

- **All types** (default)
- **Components only** — components, variant sets and instances
- **Everything but components** — frames, groups, text, shapes…

Use it when a frame and a real component share a name and you only want one of them. The filter is **sticky**: it stays on your choice until you change it, and a **red dot** on the icon is the reminder that a search is narrowed.

### Visibility filter
The radio group under the name field decides what a search looks at:

- **All** (default) — both
- **Visible** — only layers currently shown
- **Hidden** — only layers whose own visibility is off

**"Hidden" means the layer's own eye icon is off.** Opacity 0, or a visible layer sitting inside a hidden parent, are different states and are *not* treated as hidden. The search still descends into hidden containers, so a visible layer inside a hidden frame is found by the *Visible* filter.

Leave the name field empty, pick **Hidden** and press **Select absolute** to grab every hidden absolute element in scope. The three filters — name, type, visibility — all combine.

### Search scope
- **Frames or sections selected** → SnapKit searches inside them
- **Nothing selected** → SnapKit searches every frame on the page

### Search feedback
While a search runs, the loader spells out what is actually being looked for, so a surprising result is easy to explain:

> *Searching for absolute elements named “Header” / components only / hidden elements only / inside the current selection*

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
- **Delete absolute** — deletes the absolute-positioned elements themselves (not just their positioning), three ways depending on the selection:
  - absolute elements selected → deletes those
  - frames or sections selected → deletes the absolute elements inside them
  - nothing selected → deletes every absolute element on the page
- **Delete selected** — deletes the current selection.

Buttons enable and disable themselves as your selection changes: *Set to absolute* greys out when the selection is already absolute, *Delete absolute* greys out when there is nothing absolute to delete but stays available with nothing selected (whole-page mode).


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
2. **Delete absolute**


## TIPS

- **Selection drives the UI** — most buttons enable or disable based on what you have selected, and the search scope follows it too
- **Filters are sticky** — the red dot on the filter icon and the highlighted radio are the reminders that a search is narrowed
- **Read the loader** — if a search returns something unexpected, the line under the spinner says exactly what SnapKit looked for
- **Empty name is a feature** — with *Select absolute* or a *Hidden* search it means "everything in scope"
- **Sections are supported** — searches and *Delete absolute* both walk into sections


## DEVELOPMENT

### Layout

```
code.js                                    the Figma main thread
manifest.json                              points at code.js and ui.html
ui.html                                    GENERATED — do not edit
scripts/build-ui.js                        builds ui.html from ui/
ui/
  index.html                               the panel markup
  ds-overrides.css                         the only local changes to the DS
  snapkit.css                              layout + SnapKit's own components
  snapkit.js                               the panel behaviour
  vendor/figma-plugin-ds/                  the design system, vendored (MIT)
test/                                      the test suite
```

### The design system

The UI uses **[figma-plugin-ds](https://github.com/thomas-lowry/figma-plugin-ds)** by Tom Lowry, a CSS library that reproduces Figma's own controls. Its stylesheet is **copied into `ui/vendor/figma-plugin-ds/`** rather than installed: SnapKit has no `npm install` step, and a plugin iframe cannot resolve a remote or relative stylesheet anyway. `ui/vendor/figma-plugin-ds/README.md` records the version and how to update it — drop in the new file, run `npm run build:ui`.

The overrides are kept apart from the rest of the CSS so an upstream release cannot quietly break the panel:

- **`ui/ds-overrides.css`** is the only file that styles a DS class, and the vendored copy is never patched. It is inlined right after the design system, so at equal specificity it wins on source order. When the DS is updated, this is the one file to re-read
- **`ui/snapkit.css`** is layout plus the components the DS has no equivalent for (the toast, the search overlay, the field's clear button). It may lean on a DS class to *find* an element, but every property it sets lands on a `.snapkit-*` element of our own

`test/ui.test.js` enforces both halves of that split, so a DS override added to the wrong file fails the suite. New controls should reach for a DS class first.

### The build step

Figma serves the plugin UI from a sandboxed iframe with no document base, so `ui.html` has to be one self-contained file. `scripts/build-ui.js` inlines the stylesheets and the script from `ui/`, and strips the design system's remote Inter `@font-face` rules so the panel never touches the network.

```
npm run build:ui
```

`ui.html` is committed so the plugin can be imported straight from the manifest. `npm test` fails if it is out of date.

### Tests

The plugin runs inside Figma, but its logic is covered by a dependency-free test suite that mocks the Figma plugin API:

- `test/plugin.test.js` — every UI message handler (select, select absolute, duplicate, set to absolute, align, delete absolute, delete), including the type and visibility filters
- `test/ui.test.js` — reads the built `ui.html` and runs its inline script against a small DOM stub, covering the type filter menu, the visibility radio group, the Selection / Actions sections, the selection count and the field's clear button, the loader overlay and its search-context line, the context-aware button states, that the DS overrides stay in their own stylesheet, and that nothing in the panel is loaded from the network

```
npm test
```

No `npm install` needed — everything uses Node built-ins only.

Version numbers live in `README.md` (title, release notes, footer), `package.json`, the header comment of `code.js`, and the `name` field of `manifest.json`. The manifest `id` is deliberately left alone: Figma treats it as the plugin's identity.


## RELEASE NOTES

### v1.0.6-alpha
**Improvements:**
- Wildcard name patterns are now compiled once per search instead of rebuilding a `RegExp` on every node visited — cuts redundant work on large documents
- `findByName` / `findAbsoluteByName` merged into a single recursive tree walk (`walkTree`), removing duplicated traversal logic
- The "which frames to search" resolution (page-wide vs. current selection) is now one shared helper instead of three separate copies
- Fixed a drift bug between the live `selectionchange` event and the `check-selection` request: they used to disagree on what counted as "non-absolute", which could leave *Set to absolute* incorrectly disabled after selecting a plain frame. Both now share one `computeSelectionState` function
- Fixed a latent bug in **Delete absolute**: it only searched one level into a selected frame's children, and two levels into a selected section (section → frame → child) — an absolute element nested any deeper was silently skipped. Cleanup is now fully recursive, matching how search already worked
- Added 6 regression tests covering all three fixes; the suite is now 90 tests (48 plugin + 42 UI), all passing

**UI Changes:**
- Search overlay scrim: white → dark (`--black8`, the dark counterpart of the same 80%-opacity token)
- Search overlay text (context line and the cycling status messages): now white, for contrast against the dark scrim
- Loader spinner: recoloured blue → white, and doubled in size
- The **✕** in the search field now also clears the canvas selection, not just the field — it means "start this search over", and a stale selection would otherwise silently narrow the next search to "in selected frames" instead of the whole page. Typing a new search and pressing Select/Select absolute is unaffected, since that already replaces the canvas selection on its own

### v1.0.5-alpha
**UI Changes:**
- Refactored the plugin-ds integration using the [`plugin-ds-skill`](https://github.com/jeancharlesamey/plugin-ds-skill) tool

### v1.0.4-alpha
**UI Changes:**
- The magnifier in the search field is now the same grey as the placeholder text next to it. It carried an extra `icon--black3` tint on top of the design system's own 30% opacity, which washed it out — a plain black glyph at that opacity is the placeholder colour exactly

**Improvements:**
- Every local change to a figma-plugin-ds control moved into its own stylesheet, **`ui/ds-overrides.css`**, inlined between the vendored design system and SnapKit's own styles. `ui/snapkit.css` is now layout and the components the DS has no equivalent for, and never styles a DS class. Updating the design system is still a single file drop, and now has exactly one file to re-check afterwards — a test enforces the split and that the vendored copy stays unpatched
- Fixed an unterminated comment in the SnapKit stylesheet that was swallowing the `.input__field` rule, so the search field only now actually gets the button corner radius and the icon-button height it was meant to have

### v1.0.3-alpha
**New Features:**
- Visibility filter (issue #5, part 3): a Visible / Hidden / All radio group on one line under the name field narrows any search to what is shown or what is hidden. *Hidden* means the layer's own visibility is off — opacity 0 and hidden parents are explicitly not counted. It applies to both Select and Select absolute, combines with the name and type filters, and an empty name field means "everything hidden in scope".

**UI Changes:**
- The whole panel is rebuilt on **[figma-plugin-ds](https://github.com/thomas-lowry/figma-plugin-ds)**, so SnapKit now looks like the rest of Figma: native button styles (primary / secondary / destructive), the Figma search field, the Figma radio group, the dark HUD menu for the element type filter, and the real Figma icons for search, filter, spinner and the six alignments. The library is vendored under `ui/vendor/figma-plugin-ds/` — no npm dependency, no CDN, and its remote Inter webfont is stripped at build time so the panel still touches nothing on the network
- **"Remove absolute" is now "Delete absolute"** — the button always deleted the elements, so the label now says so, and it is styled as a destructive action. The success message reads "Deleted N absolute element(s)"
- The UI moved out of the single HTML string in `code.js` into real files under `ui/`, built into `ui.html` by `npm run build:ui` and loaded through the manifest `ui` field. The panel is more compact as a result (320×400 instead of 320×620)
- The panel is now grouped under two titles: **Select** (name field, type filter, visibility radios, Select / Select absolute) and **Actions** (Set to absolute, Set fixed scroll, Duplicate, Delete absolute, Delete selected, alignment grid), so reading the file and changing it are visually separated
- The loader search context and the result message both name the active visibility filter

**Documentation:**
- README rewritten around the two panel sections, with the search filters documented together, a recipes section, and previously undocumented behaviour written down (Shift-click alignment on absolute autolayout frames, the loader's Stop button, where version numbers live)
- Development section documents the new `ui/` layout, the vendored design system and the `npm run build:ui` step

### v1.0.2-alpha
**New Features:**
- Explicit search context in the loader (part of issue #5): the spinner now carries a line describing the search in progress — element kind (all vs absolute only, from the button used), the name(s) typed (or "with any name" when the field is empty), the active element type filter and the scope (current selection vs whole page)

**UI Changes:**
- The "a filter is applied" dot on the filter icon is now red and larger (11px), so a narrowed search is impossible to miss

### v1.0.1-alpha
**New Features:**
- Added element type filter for name searches (issue #2, and part 1 of issue #5): a filter icon next to the name field opens a popover with All types (default) / Components only / Everything but components. Applies to both Select and Select Absolute; the active filter shows as a dot on the icon and is named in the result message.

**Improvements:**
- Added a loader for massive search
- Added `*` wildcard support to name searches, and Select Absolute now accepts an empty name to mean "every absolute element in scope"
- Improved: Button states are now context-aware based on the selected element's positioning
  - "Set to absolute" is disabled when the selection is already absolute, or when a frame/section is selected
  - "Remove absolute" is disabled when the selection contains no absolute elements and no frames/sections
  - "Remove absolute" stays accessible with no selection (whole-page mode) or when frames/sections are selected

### v0.0.4-alpha
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

### v0.0.3-alpha
**Improvements:**
- Renamed plugin from "PrototypFix" to "SnapKit"
- Added dynamic button states — buttons now show grey when no elements are selected
- Added automatic selection change detection — UI updates instantly when you change selection in Figma
- Improved: Remove Absolute now supports Figma sections — searches all frames within selected sections
- Improved: Remove Absolute with no selection now searches through all sections and frames on the page

**Fixes:**
- Fixed: Delete button now correctly shows grey when no elements are selected
- Fixed: Set to Absolute now skips sections (sections cannot be absolute positioned)

**UI Changes:**
- Removed plugin header/title from UI window for cleaner interface

### v0.0.2-alpha
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
- Disabled "Set Fixed Scroll" button (Figma API limitations — shown with tooltip)
- Button text now uses sentence case (only first letter capitalized)

**Documentation:**
- Added comprehensive README.md
- Added CLAUDE.md technical documentation
- Cleaned up unused project files


## SUPPORT

For issues or feedback, please contact the plugin maintainer via GitHub.

---

**Current Version**: v1.0.6-alpha
