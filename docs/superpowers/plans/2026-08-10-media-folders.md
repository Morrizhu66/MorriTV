# Collection Workspaces Implementation Plan

**Goal:** Make each collection a parallel generation workspace with its own result/reference directories, browser-like navigation, and safe deletion.

**Architecture:** `MediaLibrary` owns folder metadata and physical result moves. `server.py` persists `folder_id`, routes references/results into a workspace, serves collection media, and coordinates safe folder deletion. The vanilla frontend submits the active workspace and renders dynamic collection tabs.

**Tech Stack:** Python 3.9 standard library, vanilla JavaScript, HTML/CSS, `unittest`.

### Task 1: Lock the domain behavior with failing tests

- [ ] Collection creation provisions an independent result/upload workspace.
- [ ] Import, generated registration, and move use physical collection directories.
- [ ] Folder deletion migrates files back to default results without data loss.
- [ ] Task snapshots persist and expose `folder_id`.

### Task 2: Implement server workspace routing

- [ ] Add workspace path helpers and collection media URLs.
- [ ] Validate `folder_id` before queuing paid requests.
- [ ] Route copied references and downloaded/generated outputs by workspace.
- [ ] Add safe folder deletion API and update affected task history.

### Task 3: Implement browser-like workspace UI

- [ ] Replace the nested task/library toggle with `成片区 + dynamic collection tabs`.
- [ ] Show the current output target beside the composer.
- [ ] Submit the active `folder_id` and auto-open newly created folders.
- [ ] Add collection import and safe-delete controls.

### Task 4: Verify locally and with real models

- [ ] Run the full unit suite and static checks.
- [ ] Start the new server on port 4179 without disturbing port 4178.
- [ ] Create a verification collection through HTTP.
- [ ] Generate one Seedream 4.3 image and one 5-second Seedance video.
- [ ] Verify completed status, local files, media readability, and folder attribution.
- [ ] Stop port 4179 and confirm no test server or child worker remains.
