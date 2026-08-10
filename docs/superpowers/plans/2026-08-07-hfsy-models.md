# HFSY Models Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four selectable HFSY image models without changing the existing Ark provider behavior or committing credentials. Minimax H3 is explicitly excluded.

**Architecture:** A focused standard-library `hfsy_client.py` owns provider-specific schemas, public reference URLs, polling, and response parsing. The existing server keeps queue/history ownership and dispatches by profile; the browser renders model-specific controls from a small catalog.

**Tech Stack:** Python 3 standard library, `unittest`, vanilla JavaScript, HTML/CSS.

---

### Task 1: Provider contract and request builders

**Files:**
- Create: `hfsy_client.py`
- Create: `test_hfsy_client.py`

- [ ] Write failing tests for the four-model catalog, GPT request bodies, Nano request bodies, response URL parsing, and status mapping.
- [ ] Run `python3 -m unittest -v test_hfsy_client.py` and confirm failures are caused by the missing module.
- [ ] Implement the smallest standard-library client contract that passes the request/parse tests.
- [ ] Re-run `python3 -m unittest -v test_hfsy_client.py` and confirm all tests pass.

### Task 2: Server dispatch, validation, and secret health

**Files:**
- Modify: `server.py`
- Create: `test_hfsy_server_integration.py`
- Modify: `.env.example`

- [ ] Write failing tests proving HFSY profiles are accepted, model limits are rejected, HFSY tasks use `HFSY_API_KEY`, and health reports provider readiness without exposing the value.
- [ ] Run `python3 -m unittest -v test_hfsy_server_integration.py` and confirm the expected failures.
- [ ] Add provider-aware validation and dispatch while leaving existing Ark dispatch intact.
- [ ] Re-run the focused tests and the existing history/network tests.

### Task 3: Dynamic model controls

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`
- Create: `test_hfsy_frontend.py`

- [ ] Write failing static contract tests for all four options, provider grouping, model-specific controls, material limits, and retry restoration.
- [ ] Run `python3 -m unittest -v test_hfsy_frontend.py` and confirm the expected failures.
- [ ] Implement catalog-driven UI updates and client-side validation.
- [ ] Re-run focused frontend tests.

### Task 4: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `test_github_packaging.py`

- [ ] Add failing packaging assertions for the placeholder `HFSY_API_KEY` and HFSY setup instructions.
- [ ] Update README and `.env.example` without adding a real credential.
- [ ] Run `python3 -m unittest discover -v`, `python3 -m py_compile server.py hfsy_client.py`, and a local health/page smoke test.
- [ ] Configure the real key only in ignored local configuration and submit a low-cost `gpt-image-2` task; wait for terminal status and verify a renderable result URL.
- [ ] Inspect `git diff --check`, `git status --short`, and tracked files to prove no secret or runtime artifact is included.
