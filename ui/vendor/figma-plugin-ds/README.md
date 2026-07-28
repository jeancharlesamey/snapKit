# figma-plugin-ds (vendored)

SnapKit's UI is built on **figma-plugin-ds** by Tom Lowry — a CSS library that
reproduces Figma's own UI controls (buttons, inputs, radios, select menus,
icons, type scale, spacing tokens).

- Upstream: https://github.com/thomas-lowry/figma-plugin-ds
- File: `dist/figma-plugin-ds.css`
- Version vendored here: **1.0.0** (`master`, fetched 2026-07-28)
- Licence: MIT — see `LICENSE`

## Why it is copied into the repo

SnapKit has **no runtime dependencies and no `npm install`**. A `<link>` to a CDN
would not work either: Figma serves the plugin UI from a sandboxed iframe with no
document base, so relative and remote stylesheets are not resolved. The CSS is
therefore checked in and inlined into `ui.html` by `scripts/build-ui.js`.

## How to update it

1. Download the new `dist/figma-plugin-ds.css` from upstream and overwrite the
   file in this folder (leave it **unmodified** — no local patches).
2. Refresh the version line above and, if the licence changed, `LICENSE`.
3. Run `npm run build:ui` to regenerate `ui.html`.
4. Run `npm test`.

## The one transform applied at build time

Upstream ships three `@font-face` rules that pull Inter from `rsms.me`. The build
script strips any `@font-face` that points at a remote URL, so the plugin never
reaches out to the network (Figma would block it anyway without a
`networkAccess` entry in the manifest). `ui/snapkit.css` overrides `--font-stack`
with a local stack instead, starting with Inter — the font Figma itself uses, so
it is already installed for most users.

## What is *not* vendored

`dist/figma-plugin-ds.js` (the helper JS for select menus, disclosures and icon
inputs) is intentionally left out. SnapKit only needs the type-filter menu, whose
behaviour is a dozen lines in `ui/snapkit.js`, and skipping the library keeps the
UI script small enough to unit-test against a plain DOM stub.
