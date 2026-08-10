# Usage Reminder and Recoverable Delete Plan

**Goal:** Show non-blocking daily per-model usage and add recoverable deletion for tasks and assets.

### Task 1: Tests first

- [ ] Daily usage counts unique queued tasks in the local day.
- [ ] Seedance target is 20 and Seedream 5.0 Pro target is 30.
- [ ] Deleted tasks remain counted but do not restore after restart.
- [ ] Task and imported-asset files move into a scoped trash directory.
- [ ] Frontend exposes the usage panel and delete actions.

### Task 2: Backend

- [ ] Add `/api/usage`.
- [ ] Add task and asset DELETE routes.
- [ ] Add recoverable trash metadata and deleted-history handling.

### Task 3: Frontend

- [ ] Add the top usage button and expandable model list.
- [ ] Add warning/over-target states without submission limits.
- [ ] Add confirmed delete actions to task and asset cards.

### Task 4: Verification

- [ ] Run the full unit suite and static checks.
- [ ] Restart 4178 and verify health, usage, collection, and page assets.
- [ ] Exercise deletion with isolated temporary data only.
