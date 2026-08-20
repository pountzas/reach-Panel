# ReachPanel Teaching Free Write — Design Spec

**Date:** 2026-08-20  
**Status:** Draft for review  
**Scope:** Language subject tab **Free write** (notepad + PDF), plus a reusable teaching subject tab shell for future Math (and other) tabs  
**Depends on:** Language lesson Play gate, `TeachingLessonPanel` split shell, header lesson toggles (`HeaderIconToggleGroup`)

## 1. Goals

- Give caregivers/students a **Free write** workspace under Teaching → Language: write notes while reading a PDF without leaving ReachPanel.
- Keep Language **Spelling** lesson intact; switch via **tabs under the teaching section header**.
- Ship a **reusable tab system** so Math (later) can add its own tabs without inventing a second chrome pattern.
- Persist a **per-profile notepad draft** and a **small PDF library / recent list**.
- Route on-screen keyboard input to the **focused Free write pane** (notepad, or PDF form field when supported).

## 2. Non-goals (this cut)

- Free write as a fourth header subject icon (Language / Music / Math stay as today).
- Tabs under Music or Math in v1 (shell must support them; subjects opt in later).
- Cloud sync, multi-user note libraries, or collaborative annotation.
- Full PDF annotation / highlight / markup tools.
- Opening arbitrary Office docs (PDF only).
- Tablet companion Free write (Teaching remains Windows-only).
- Per-PDF note documents (one shared notepad draft per profile for v1).

## 3. Decisions locked in brainstorming

| Topic | Choice |
| --- | --- |
| Placement | Tabs under Language only for v1: **Spelling** \| **Free write** |
| Architecture | Approach 1 — reusable subject tab shell around existing lesson panels |
| PDF open | Open from disk + persist a small library / recent list |
| Keyboard | Type into whichever Free write side is focused; PDF form fields if the viewer supports them; otherwise notepad |
| Notepad persistence | One draft per profile + **Clear all** button |

## 4. Context (existing product)

| Today | Free write target |
| --- | --- |
| Language / Music / Math toggles in teaching **section header** | Unchanged |
| Language = `LanguageLessonPanel` (Play → spell) | Becomes the **Spelling** tab body |
| `TeachingLessonPanel` left/right split | Reuse for Free write notepad \| PDF |
| Language keyboard capture gated by Play / list authoring | Free write uses a separate capture path when Free write tab is active |
| Custom language packs in app data | PDF library similarly persisted (app data JSON) |

**Language + Free write chrome:**

```text
+------------------------------------------------------------------+
| [Language title]   [Lang|Music|Math icons]   [pin min close]     |  section header
+------------------------------------------------------------------+
| [ Spelling ]  [ Free write ]                                     |  subject tabs (Language only)
+------------------------------------------------------------------+
| Tab body (Spelling panel OR Free write split)                    |
+------------------------------------------------------------------+
| Keyboard (+ synth only when Music subject)                       |
+------------------------------------------------------------------+
```

## 5. Users & jobs

| Actor | Job |
| --- | --- |
| **Student** | Read a homework PDF and type answers/notes with the ReachPanel keyboard |
| **Caregiver** | Open or re-open teaching PDFs from a small library; clear notepad when starting a new assignment |
| **Future Math author** | Add Math tabs through the same shell without rewriting Language chrome |

## 6. Reusable teaching subject tabs

### 6.1 Component

`TeachingSubjectTabs` (name exact TBD in implementation):

- Renders a horizontal tab strip **directly under** the teaching section header content area (inside the phrases/teaching slot, above the active panel).
- Props: `tabs: { id, labelKey }[]`, `activeId`, `onChange`.
- Visual language: readable touch targets; active tab clearly distinct (align with existing surface colors; avoid inventing a new brand look).
- When a subject declares **zero or one** tab, **hide** the strip (Music stays chrome-free).

### 6.2 Subject registry (conceptual)

Each teaching subject may declare optional tabs:

| Subject | v1 tabs |
| --- | --- |
| `language` | `spelling`, `freeWrite` |
| `music` | none (current `MusicLessonPanel` only) |
| `math` | none for now; later e.g. `practice` \| … |

Session state (not profile settings unless noted):

- `languageSubjectTab: "spelling" | "freeWrite"` (default `spelling`)
- Future: `mathSubjectTab`, etc., or a map `teachingSubjectTabs[subject]`

Switching Language → Music → Language restores the last Language tab for the session.

### 6.3 Where the strip mounts

Prefer wrapping the teaching panel content in AppShell / a thin `TeachingSubjectShell` so Docked/Floating headers stay drag/minimize/close only. Tabs are **not** in the draggable header row (avoids competing with Language/Music/Math icons and section controls).

## 7. Free write panel

### 7.1 Layout

Reuse `TeachingLessonPanel` (or identical split contract):

| Side | Content |
| --- | --- |
| **Left** | Notepad (multiline text area + toolbar: Clear all) |
| **Right** | PDF viewer + library controls (Open…, recent list) |

Persist left ratio as `freeWriteLeftRatio` (default ~0.4), same pattern as `languageLessonLeftRatio` / `musicLessonLeftRatio`.

### 7.2 Notepad

- Single draft string persisted **per profile** (settings or profile-backed store field, e.g. `freeWriteNotepadText`).
- **Clear all** confirms, then empties and saves.
- Focusable; when focused, on-screen keyboard appends/edits this buffer (same Greek compose path as language authoring where applicable).
- No rich text in v1 (plain text).

### 7.3 PDF library

Persisted list (app data JSON, e.g. `teaching-pdfs.json` or profile-scoped equivalent):

```ts
type TeachingPdfEntry = {
  id: string;
  title: string;       // file name or caregiver label
  path: string;        // absolute Windows path last known good
  lastOpenedAt: string; // ISO
};
```

- **Open PDF…** — native file picker (`*.pdf`); add/update library entry; set as active document.
- **Recent / library list** — select entry to reopen; if path missing, show error and offer Remove / Open again.
- Cap list size (e.g. 20); drop oldest by `lastOpenedAt` when over cap.
- Active PDF id/path is session + last-used preference so reopen Teaching restores the last document when the file still exists.

### 7.4 PDF viewer

- In-app viewer suitable for Windows Tauri webview (implementation preference: **PDF.js** or equivalent already-compatible approach — finalize in plan).
- Zoom / page navigation minimum viable; print/export out of scope.
- If the PDF has AcroForm / editable fields and the viewer exposes them, focus can move into a field and keyboard types there.
- If not editable / not focused on a field, keyboard continues to target notepad when Free write is active and notepad (or default pane) is the capture target.

### 7.5 Focus model

Session enum, e.g. `freeWriteFocus: "notepad" | "pdf"`:

- Clicking notepad → `notepad`.
- Clicking PDF chrome / page / field → `pdf` (field focus when available).
- Default on entering Free write: `notepad`.
- Physical + on-screen keyboard capture while Free write tab active routes to the focused target; **do not** inject into external apps in this mode (same isolation idea as language spelling).

Leaving Free write (tab → Spelling, or subject → Music) stops Free write capture and restores existing Spelling/Music rules.

## 8. Interaction with Language Spelling

| State | Keyboard |
| --- | --- |
| Language + Spelling + not playing | No spelling capture (setup / Play gate) |
| Language + Spelling + Play | Spelling buffer capture |
| Language + Spelling + creating list | List authoring capture |
| Language + Free write | Free write focus capture |
| Music | Unchanged synth / music rules |

Spelling Play state can remain in memory while visiting Free write; returning to Spelling does not auto-start Play unless already playing (prefer **pause capture** while on Free write; keep `languageLessonPlaying` as-is or stop on tab change — **recommendation: stop Play when leaving Spelling** so capture cannot fight Free write).

## 9. i18n (new keys)

At minimum (all UI locales):

- `teachingTabSpelling`
- `teachingTabFreeWrite`
- `freeWriteNotepad` / `freeWriteClearAll` / `freeWriteClearConfirm`
- `freeWriteOpenPdf` / `freeWriteRecentPdfs` / `freeWritePdfMissing`
- Empty states: no PDF selected, empty notepad hint

## 10. Settings / README

- No new Settings page required for v1 if Open + library live in-panel.
- README Teaching bullet: mention Language Free write (notepad + PDF library) when shipping.

## 11. Testing

- Unit: tab id helpers; library add/cap/remove; notepad clear persistence serialization.
- Manual: Open PDF, reopen from library, missing file path, Clear all confirm, keyboard into notepad, switch Spelling ↔ Free write ↔ Music without stuck capture, resize split.

## 12. Implementation sketch (for planning)

1. `TeachingSubjectTabs` + Language shell wiring (`spelling` \| `freeWrite`).
2. Persist notepad text + `freeWriteLeftRatio` + PDF library store/commands.
3. `FreeWritePanel` (notepad + PDF pane) on `TeachingLessonPanel`.
4. Keyboard / physical capture gate for Free write focus.
5. i18n + README.
6. Leave Math/Music tab hooks documented but unused.

## 13. Open points for plan (non-blocking for this spec)

- Exact PDF.js (or other) packaging under Tauri asset CSP.
- Whether PDF library is global app-data vs per-profile file (preference: **per profile** if notes are per profile; else global library + per-profile notepad is acceptable if simpler).
- Confirm stop-vs-keep Spelling Play on tab leave (spec recommends **stop**).

## 14. Success criteria

- From Teaching → Language, caregiver switches Spelling ↔ Free write via tabs under the header.
- Free write shows notepad \| PDF with resizable divider; Open PDF + recent list works across restarts when files exist.
- Notepad survives profile save/load; Clear all empties it after confirm.
- On-screen keyboard types into the focused Free write pane without sending spelling-buffer or external injection while Free write is active.
- Music unchanged; Math can add tabs later through the same shell.
