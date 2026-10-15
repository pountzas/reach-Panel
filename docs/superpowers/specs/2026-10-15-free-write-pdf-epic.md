# Free write PDF — Epic index (issue #168)

**Date:** 2026-10-15  
**Status:** Specs ready for implementation (ordered slices)  
**Issue:** https://github.com/pountzas/reach-Panel/issues/168  
**Platform:** Windows only (ReachPanel teaching)

## Product story

Caregivers and students open **one** worksheet PDF in Teaching → Language → Free write, draw and type on pages, keep the **original file untouched**, and keep work in a sibling `name.reach.pdf`. They can clear all marks by deleting that sibling, and later **export selected pages** (with ink/text) to a new file that stays editable in ReachPanel and visible in other PDF viewers.

## Slices (implement in order)

| Slice | Spec | Plan | Ships |
| --- | --- | --- | --- |
| **1 — Single document** | [2026-10-15-free-write-pdf-single-document-design.md](./2026-10-15-free-write-pdf-single-document-design.md) | [../plans/2026-10-15-free-write-pdf-single-document.md](../plans/2026-10-15-free-write-pdf-single-document.md) | One active PDF; icon Open/Close; filename on toolbar; migrate old library to ≤1 entry |
| **2 — Ink & text** | [2026-10-15-free-write-pdf-ink-design.md](./2026-10-15-free-write-pdf-ink-design.md) | [../plans/2026-10-15-free-write-pdf-ink.md](../plans/2026-10-15-free-write-pdf-ink.md) | Pen, brush eraser, text, undo, Clear all; `name.reach.pdf` + embedded JSON |
| **3 — Export & appearances** | [2026-10-15-free-write-pdf-export-design.md](./2026-10-15-free-write-pdf-export-design.md) | [../plans/2026-10-15-free-write-pdf-export.md](../plans/2026-10-15-free-write-pdf-export.md) | Page-range export; appearances on sibling save + export |

Each slice is a separate PR against the same issue. Do not start Slice N+1 code until Slice N acceptance is met (or explicitly waived).

## Locked cross-slice decisions

| Topic | Choice |
| --- | --- |
| Original PDF | Never modified |
| Working file | Sibling `name.reach.pdf` in the same folder; created on **first edit** |
| Open original | If sibling exists, load page content from original + annotations from sibling |
| Annotation storage (Slice 2) | Page copy in sibling + embedded ReachPanel JSON (`schemaVersion: 1`) |
| Clear all | Confirm → delete sibling |
| Tools | Black pen; brush eraser (ink only); text (tap / type / move); undo (~50, document-wide); trash for selected text |
| Export | New file via Save dialog; From / To + All + Current page |
| Appearances | Slice 3: regenerate on full sibling save **and** on export; ReachPanel still edits via JSON |

## Ordered acceptance (epic)

1. Slice 1 criteria in its spec §10.
2. Slice 2 criteria in its spec (draw → reopen original → ink/text restored; Clear all removes sibling).
3. Slice 3 criteria in its spec (export pages 4–12 → reopen editable in ReachPanel; visible in an external viewer).

## Epic non-goals

- Full Acrobat-style annotation suite (highlights, stamps, forms authoring).
- Cloud sync or multi-user libraries.
- Tablet companion Free write.
- Third-party apps editing ReachPanel JSON (view via appearances is enough).
- Thumbnail multi-select page picker.

## Prior art

- Supersedes multi-entry PDF library / “no full annotation” non-goal for this epic: [2026-08-20-teaching-free-write-design.md](./2026-08-20-teaching-free-write-design.md) (§7.3 library UX; annotation non-goal).
