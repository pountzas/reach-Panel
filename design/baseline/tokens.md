# ReachPanel design tokens (as used in code)

Source: `origin/main` @ `5e06f26` (v0.19.3). `origin/dev` @ `82cff05` has no visible UI differences (CI, security scanning and lockfiles only).
Extracted from `src/index.css`, `src/lib/colorProfiles.ts`, `src/lib/types.ts` (DEFAULT_SETTINGS), `src/lib/focusMode.ts`, `src/lib/buttonClasses.ts`, `src/lib/keyMetrics.ts`, `src/lib/keyboardFontSize.ts`, `src/lib/motion.ts`, `src/lib/sectionLayouts.ts`, component Tailwind classes, and `companion/src/**` StyleSheets.

There is no central token file. The host colours are **user settings** that follow a colour profile. Most other colours are Tailwind v4 palette classes (slate/gray/red/amber/emerald) or inline hex values.

## 1. Host colour profiles (user-switchable themes)

`Settings → Appearance → Colour profile`. The default is **Dark grey**. **Custom** lets the user choose each of the seven fields.

| Token (setting key) | Role | Dark grey (default) | Light grey |
|---|---|---|---|
| `appBgColor` | Window / shell background | `#374151` | `#e5e7eb` |
| `headerBgColor` | App header, tool-window header, FAB + mode-menu fill | `#1f2937` | `#6b7280` |
| `headerTextColor` | Header text and icons | `#f3f4f6` | `#ffffff` |
| `keyboardBgColor` | Keyboard section background | `#4b5563` | `#d1d5db` |
| `keyboardKeyColor` | Key fill | `#6b7280` | `#f3f4f6` |
| `keyTextColor` | Key label | `#f9fafb` | `#374151` |
| `mousePanelBgColor` | Mouse panel (hidden in v1) | `#374151` | `#e5e7eb` |
| synth black key / pressed | Piano black keys | `#374151` / `#1f2937` | `#1e293b` / `#0f172a` |

Fallbacks when a value is missing: app bg `#f1f5f9`, header `#1e293b`, header text `#ffffff`.
`opacity` default **0.95** (window opacity slider).

### Derived surface colours (`getSurfaceColors(appBgColor)`)
Panels, Settings cards, section frames and toasts are derived from `appBgColor`: lighten or darken toward white or black, switching at luminance 0.5.

| Surface token | Dark grey → | Light grey → | Rule (dark / light) |
|---|---|---|---|
| `panelBg` | `#4b5462` | `#f5f5f7` | lighten 10% / lighten 60% |
| `panelHeaderBg` | `#5b6370` | `#dadbdf` | lighten 18% / darken 5% |
| `panelBorder` | `#6f7682` | `#c5c7ca` | lighten 28% / darken 14% |
| `panelText` | `#f9fafb` | `#374151` | fixed |
| `panelMutedText` | `#d1d5db` | `#6b7280` | fixed |
| `panelButtonBg` | `#636b77` | `#eeeff2` | lighten 22% / lighten 35% |
| `insetBg` (wells, inputs, notepad) | `#2b333f` | `#d7d9dd` | darken 22% / darken 6% |
| `insetBorder` | `#6f7682` | `#b7b9bc` | lighten 28% / darken 20% |
| `insetText` | `#d1d5db` | `#64748b` | fixed |

### Fixed accents (host)
| Use | Value |
|---|---|
| Sticky / latched modifier ring | `inset 0 0 0 3px #2563eb` |
| Suggestion chip | bg `#dbeafe`, text `#1e3a8a`, border `#93c5fd` |
| Live input preview frame | border `#94a3b8`, bg `#0f172a`; placeholder text `slate-400` |
| Mic FAB armed icon | `#7dd3fc` |
| FAB logo disc | `#121820` |
| Music: active note chip / ring | amber, `rgb(245 158 11 / .9)` ring, `#fde68a` / `#fbbf24` highlight key |
| Danger (delete / wipe) | text `red-600/700` `#dc2626` / `#b91c1c`, border `red-300` `#fca5a5`, bg `red-100` |
| Success toast icon | `#15803d` |
| Error toast border | `#fca5a5` |
| Header icon button | `bg-white/20`, hover `bg-white/30`; grip `bg-white/10` |
| Mode toggle segment | active `slate-700` + white, idle white + `slate-700` |
| Tooltip | `slate-800`, white `text-xs`, `rounded`, `px-2 py-0.5` |
| Range slider (mouse speed) | track `#cbd5e1` 6px, thumb `#334155` 14px with a 2px white border |
| Scrollbar | thin, thumb `rgb(32 33 35/.8)`, track `gray-500` |
| Modal backdrop | `bg-black/50` |

### Transparent Focus keyboard (`focusModeTransparent`)
The background is transparent. Keys are outlined with a 2px border, an outer shadow of `0 0 0 1px rgba(0,0,0,.5)` and a text shadow of `0 1px 2px rgba(0,0,0,.8)`. The active state adds `inset 0 0 0 2px rgba(147,197,253,.95)`.

| Palette | Border | Text |
|---|---|---|
| White (default) | `rgba(255,255,255,.9)` | `#ffffff` |
| Dark grey | `#4b5563` | `#4b5563` |
| Silver | `#c0c0c0` | `#c0c0c0` |

## 2. Host typography
- Family: **"Segoe UI", system-ui, sans-serif** (`:root`). The base colour is `#1a1a2e`, which is overridden by profile colours.
- Tailwind sizes used: `text-sm` 14/20 (115 uses), `text-xs` 12/16 (64), `text-base` 16/24, `text-lg` 18/28. App title `font-semibold` 16.
- Weights: `font-medium` 500 (38), `font-semibold` 600 (37; keys, titles), `font-bold` 700 (5).
- **Keyboard key labels:** `keyboardFontSize` default **18px**, user range **14–29px**, capped at key height − 4px. Special keys show a symbol and a word: ⌫ Backspace, ↵ Enter, ⇧ Shift, ␣ Space.
- Leading `leading-none`/`snug`/`tight`; `tracking-wide` only on small caps labels.

## 3. Radii
| Token | px | Where |
|---|---|---|
| `rounded` | 4 | header icon buttons, tooltips, mode-toggle ends |
| `rounded-md` | 6 | input preview frame, inputs, small buttons (24 uses) |
| `rounded-lg` | 8 | **keys** (`PRESSABLE_BUTTON_CLASS`), mode menu, chips, most buttons (46) |
| `rounded-xl` | 12 | Settings section cards (8) |
| `rounded-2xl` | 16 | dialogs (4) |
| `rounded-full` | 9999 | FABs, pills, slider thumbs (12) |

## 4. Spacing & sizing
- Tailwind 4px scale. The most used values are `gap-2` 8, `gap-1` 4, `px-3` 12, `py-2` 8, `px-2` 8, `py-1.5` 6, `py-2.5` 10, `px-4` 16, `p-5` 20 (Settings body), `space-y-5` 20 between Settings cards.
- **App header** height **48px**, `px-3`, three-column grid (grip | title | collapse · settings · close).
- **Section toolbar** controls `h-8` (32px).
- **Key metrics:** spacing = max(2, floor(containerHeight × 1%)). Key height = (containerHeight − 16 − spacing×(rows−1)) / rows, min 28px.
- **Live input preview:** max **320 × 48px**.
- **FAB:** **56px** circle, logo disc 39px (70%), 12px gap, 10px pad, 16px margin from monitor corner, 6px hover slack.
- **Mode menu:** **220px** wide, items **48px**, 8px pad, 1px separators; height for 7 items + 2 separators = **354px**.
- **Tool window (Settings):** **900 × 700**.

## 5. Elevation
| Token | Value | Where |
|---|---|---|
| `shadow-sm` | Tailwind default | keys, small buttons |
| `shadow` | Tailwind default (13 uses) | cards |
| `shadow-md` | Tailwind default | popovers |
| `shadow-lg` | Tailwind default | FABs, mode menu, dialogs (7) |
| toast | `0 4px 14px rgba(0,0,0,.12)` | react-hot-toast |
| sticky ring | `inset 0 0 0 3px #2563eb` | latched modifiers |

## 6. Motion
`--rp-dur-fast` 120ms · `--rp-dur-base` 200ms · `--rp-dur-slow` 300ms · ease-out `cubic-bezier(.22,1,.36,1)`.
The Focus keyboard sheet uses `--rp-dur-focus-keyboard` 250ms with `cubic-bezier(.45,.05,.55,.95)`.
Key press: `scale(.95)` + `brightness(.9)`.
View transition `rp-vt-fade-slide`: fade plus 8px slide.
Window animations (Rust): collapse 400ms, Focus 300ms, ~60fps.
The music note chip pulses `scale 1.55↔1.7` over 1.1s.
Under `prefers-reduced-motion`, the four `--rp-dur-*` values drop to 1ms. Music chip pulses, partiture ring pulses and view-transition animations stop entirely. Fixed-duration transitions, including the music strip (320ms) and chips (280ms), keep their durations.

## 7. Window sizes (for artboards)
Reference monitor: 1920×1080 with a 40px taskbar, so the work area is **1920×1040** at 100% DPI. The accessibility monitor is a second display.

| Surface | Size |
|---|---|
| Standard (2+ monitors: full work area × 0.5 default height ratio) | **1920 × 520** (single monitor: bottom half × 0.5 = 1920 × 260) |
| Focus keyboard (full monitor × 0.42) | **1920 × 437** |
| Teaching (full work area) | **1920 × 1040** |
| Collapsed FAB, 1 / 2 / 3 buttons | **82 × 82 / 82 × 150 / 82 × 218** |
| FAB + mode menu | **302 × 354** |
| Settings tool window | **900 × 700** |
| User height grip range | 25%–100% of the layout region |

## 8. Companion (Android tablet, React Native)
The companion is dark only. It has no theme switch and does not follow host colour profiles. Its strings are hard-coded English and do not use i18n. It uses the platform default font, Roboto on Android.

| Token | Value | Role |
|---|---|---|
| `bg` | `#121820` | screen background, preview wrap |
| `surface` | `#1a2230` | suggestions bar, sheets, preview frame |
| `surface-2` | `#1c2433` | tabs, trackpad pad, FAB menu, result box |
| `control` | `#2a3140` | keys, header buttons, chips, borders |
| `control-pressed` | `#3d4a63` | pressed keys and buttons |
| `border` | `#3a465c` | pad and menu borders |
| `selected` | `#2f4f78` | active tab, active menu item, pressed chip |
| `row-pressed` | `#243044` | list row pressed |
| `accent` | `#7eb6ff` | brand wordmark, primary button, FAB, mic button |
| `accent-pressed` | `#a8ceff` | FAB pressed |
| `on-accent` | `#0b1220` | text on accent |
| `text` | `#f2f4f8` | primary text |
| `text-muted` | `#b0bac8` | status, inactive tabs |
| `text-hint` | `#9aa7bd` | hints |
| `text-dim` | `#6b7585` / `#8b95a5` | placeholders, empty |
| `danger` | `#e85d5d` (live mic), `#ff8f8f` / `#f07178` (error text) | |
| `warning-banner` | bg `#3d3420`, text `#f5e6c8` | reconnecting |
| `selected-row` | `rgba(126,182,255,.16)` | language picker |
| `backdrop` | `rgba(0,0,0,.55)` | modal |

- **Type** (dp): brand 22/800 · titles 26–28/800 · body 14–17 · keys 16–20/600–700 · tabs 15/600.
- **Radii:** 8 (preview, close btn) · 10 (keys, buttons) · 12 (tabs, result) · 16 (pad, menu, sheet top, mic btn) · 20 (chips) · 32 (FAB).
- **Spacing:** gap 8 / 12 / 10, padding 16 / 20, header `20/16/8`.
- **Touch targets:** min 44 (tabs), 48–64 (keys and buttons), 88 (mic button).
- **Reference canvas:** **1280 × 800 dp** landscape tablet. Orientation is locked to landscape, and phones (<600dp shortest side) get the blocked screen.