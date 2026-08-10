# Video Inspiration Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent video inspiration library, ordered composer references, and one-click image reuse.

**Architecture:** A focused `InspirationLibrary` owns JSON metadata and copied media under `inspirations/`. Server routes expose create/list/delete; the existing frontend restores inspiration media as ordered `File` objects and uses native drag events to reorder them.

**Tech Stack:** Python standard library HTTP server and filesystem persistence; vanilla JavaScript, HTML and CSS; unittest.

---

### Task 1: Inspiration persistence

**Files:**
- Create: `inspiration_library.py`
- Create: `test_inspiration_library.py`

- [ ] Write tests proving a completed video is copied with ordered references, persists after reload, deduplicates by task ID, and moves to trash on deletion.
- [ ] Run `python3 -m unittest -v test_inspiration_library.py` and confirm missing-module/API failure.
- [ ] Implement `InspirationLibrary.create_from_task`, `snapshot`, and `delete` with atomic JSON writes.
- [ ] Re-run the test and confirm it passes.

### Task 2: HTTP contract

**Files:**
- Modify: `server.py`
- Create: `test_inspiration_server.py`

- [ ] Write route tests for `GET/POST /api/inspirations` and `DELETE /api/inspirations/{id}` using a temporary library.
- [ ] Run the route test and confirm it fails on the absent endpoints.
- [ ] Add constants, media serving, route handlers, and task validation; only completed local video tasks may be collected.
- [ ] Re-run route tests and confirm they pass.

### Task 3: Inspiration workspace and restore

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`
- Create: `test_inspiration_frontend.py`

- [ ] Write frontend contract tests for the inspiration tab/grid, manual save, restore, and delete actions.
- [ ] Run the frontend test and confirm missing selectors/functions.
- [ ] Implement an editorial video-led inspiration grid and restore all saved parameters and ordered references without submission.
- [ ] Re-run frontend tests and confirm they pass.

### Task 4: Reference ordering and image reuse

**Files:**
- Modify: `app.js`
- Modify: `style.css`
- Modify: `test_inspiration_frontend.py`

- [ ] Add failing tests for draggable reference items, order labels, reorder logic, no frontend slice limit, and image-only “填入输入框”.
- [ ] Run the test and confirm expected failures.
- [ ] Implement native drag ordering plus asset fetch-to-File append behavior.
- [ ] Re-run focused tests and then `python3 -m unittest discover -v`.

### Task 5: Runtime verification

**Files:**
- Modify: `.gitignore`

- [ ] Ignore `inspirations/` and `inspiration-library.json` as user data.
- [ ] Restart the local 4178 service.
- [ ] Verify health, inspiration list, page HTML and process liveness without submitting a paid generation.
