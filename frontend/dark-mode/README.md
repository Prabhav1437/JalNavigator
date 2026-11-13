# Dark Mode

A light/dark theme switch for the JalNavigator frontend. It adds new files and makes three tiny edits to existing ones. No existing component logic changes and no dependencies are added.

## What you get

- A **Dark Mode / Light Mode** button in the sidebar, under the navigation.
- First visit follows the operating system preference. After the user clicks the toggle, their choice is saved in `localStorage` (`jalnavigator-theme`) and wins from then on.
- Every screen is covered: Dashboard, Map, Monitoring, Complaints and API Explorer.
- The Leaflet map goes dark too: tiles are inverted with a CSS filter, while the colored asset markers keep their real colors. Popups, zoom buttons and attribution are restyled.
- No flash of the wrong theme on page load, and the fade between themes is skipped for users who prefer reduced motion.

## Files

```
dark-mode/
├── dark-mode.patch                        3 small edits to existing files
└── frontend/src/
    ├── theme/
    │   ├── theme.css                      all dark styles and the toggle styles
    │   ├── useTheme.js                    hook: read, apply, persist the theme
    │   └── initTheme.js                   applies the theme before React renders
    └── components/
        └── ThemeToggle.jsx                the sidebar button
```

## Install

From the repository root (the folder that contains `backend/` and `frontend/`):

```bash
cp -r path/to/dark-mode/frontend/src/. frontend/src/
patch -p1 < path/to/dark-mode/dark-mode.patch
```

Then run the frontend as usual (`npm run dev`).

### Or make the 3 edits by hand

1. `frontend/src/main.jsx`: after `import './App.css';` add
   ```js
   import './theme/theme.css';
   import './theme/initTheme';
   ```
2. `frontend/src/App.jsx`: add `import ThemeToggle from './components/ThemeToggle';` with the other imports, and put `<ThemeToggle />` right after the closing `</nav>` tag.
3. `frontend/index.html` (optional but recommended): the small inline script in `dark-mode.patch` sets the theme before the first paint, which prevents a light flash for dark-mode users.

## How it works

The theme is a `data-theme="dark"` attribute on `<html>`. `theme.css` only contains rules scoped to that attribute, so with it absent (light mode) the app looks exactly as before. The existing `App.css` is never edited.

The existing components use some inline hex colors (for example the grey subtitle in Monitoring and the stat colors in API Explorer). Those can't be overridden by normal selectors, so the last block of `theme.css` targets them by their inline value with `!important`. If you change those inline colors later, update that block to match.

## Uninstall

Revert the 3 edits (`patch -R -p1 < dark-mode.patch`) and delete `frontend/src/theme/` and `frontend/src/components/ThemeToggle.jsx`.

## How this was verified

On a scratch copy of the uploaded repo:

- `vite build` succeeds with the feature applied.
- The patch applies cleanly to a pristine copy.
- The toggle and hook were exercised in jsdom: system preference is respected, nothing is saved until the user clicks, a saved choice beats the system setting, an invalid saved value falls back safely, and the button label and `aria-pressed` update.
- A script confirmed every color-bearing class in `App.css` has a dark override, apart from two that already look right on dark.

Not checked: pixel-level appearance in a real browser, since none was available in the build environment. Give the map and each tab a quick visual pass the first time you run it.
