# Teaching ebook mini-browser — Design Spec

**Date:** 2026-08-20  
**Status:** Approved for implementation  
**Branch:** `feature/teaching-ebook-browser` (from `feature/language-lesson-phase1`)  
**Depends on:** Language Free write (Spelling | Free write tabs)

## Goals

- Language subject tabs: **Spelling** | **Free write** | **School books**.
- School books is a **full-width Learning tab** (no notepad|PDF split).
- Catalog opens from [allcoursesdiadrastika.jsp](https://ebooks.edu.gr/ebooks/v2/allcoursesdiadrastika.jsp); subject `target="_blank"` links stay in the same allowlisted overlay.
- Overlay is parented to the main window and sized to the tab host (same monitor as ReachPanel). Not a floating second-screen browser.

## Non-goals

- iframe embed in the React tree (cross-origin blank targets cannot be intercepted)  
- Pane-synced multi-webview child API (overlay WebviewWindow is the v1 approach)  
- Native clones of IEP games  

## White-screen fix

Allow `about:blank` during WebView2 startup so the initial navigation is not cancelled by the host allowlist.