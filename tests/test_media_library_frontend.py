import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MediaLibraryFrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.js = (ROOT / "app.js").read_text(encoding="utf-8")
        cls.css = (ROOT / "style.css").read_text(encoding="utf-8")

    def test_production_area_has_parallel_workspace_tabs(self):
        for identifier in (
            "production-tabs", "task-view", "library-view", "asset-grid", "workspace-target",
        ):
            self.assertIn(f'id="{identifier}"', self.html)
        self.assertIn('data-workspace-id="tasks"', self.html)
        self.assertNotIn('data-production-view="library"', self.html)
        self.assertIn("function setWorkspace(workspaceId)", self.js)
        self.assertIn("function renderWorkspaceTabs()", self.js)

    def test_collection_toolbar_can_create_folder_and_import_images_or_videos(self):
        self.assertIn('id="create-folder-button"', self.html)
        self.assertIn('id="library-import"', self.html)
        self.assertIn('accept="image/*,video/*"', self.html)
        self.assertIn('id="folder-dialog"', self.html)
        self.assertIn("async function createFolder(name)", self.js)
        self.assertIn("async function importLibraryFiles(files)", self.js)
        self.assertIn("'/api/library/folders'", self.js)
        self.assertIn("'/api/library/assets'", self.js)
        self.assertIn('id="delete-folder-button"', self.html)
        self.assertIn("async function deleteActiveFolder()", self.js)

    def test_asset_cards_render_images_and_videos_and_can_move_between_folders(self):
        self.assertIn("function renderLibraryAssets()", self.js)
        self.assertIn("document.createElement(asset.kind === 'video' ? 'video' : 'img')", self.js)
        self.assertIn("function openMoveDialog(asset)", self.js)
        self.assertIn("`/api/library/assets/${assetId}/move`", self.js)
        self.assertIn('id="move-asset-dialog"', self.html)
        self.assertIn("放入收藏夹", self.js)

    def test_collection_view_is_for_organization_not_video_editing(self):
        self.assertNotIn("/clip", self.js)
        self.assertNotIn("avconvert", self.js)
        self.assertNotIn("切片时间", self.html)

    def test_collection_layout_matches_the_existing_responsive_workbench(self):
        self.assertIn(".workspace-tabs", self.css)
        self.assertIn(".workspace-target", self.css)
        self.assertIn(".asset-grid", self.css)
        self.assertIn(".asset-card", self.css)
        self.assertIn("@media (max-width:760px)", self.css)

    def test_collection_video_previews_load_metadata_only_near_the_viewport(self):
        render_assets = self.js[
            self.js.index("function renderLibraryAssets()"):
            self.js.index("async function appendAssetToComposer(asset)")
        ]

        self.assertIn("function loadLocalVideoPreview(video, source)", self.js)
        self.assertIn("media.preload = 'metadata'", render_assets)
        self.assertIn("loadLocalVideoPreview(media, asset.url);", render_assets)

    def test_collection_polling_keeps_playing_video_nodes_mounted(self):
        render_assets = self.js[
            self.js.index("function renderLibraryAssets()"):
            self.js.index("async function appendAssetToComposer(asset)")
        ]

        self.assertNotIn("assetGrid.replaceChildren();", render_assets)
        self.assertIn("new Map([...assetGrid.querySelectorAll('[data-asset-id]')]", render_assets)
        self.assertIn("assetGrid.insertBefore(card, slot || null);", render_assets)

    def test_generated_collection_assets_expose_and_copy_the_full_prompt(self):
        self.assertIn("function promptForAsset(asset)", self.js)
        self.assertIn("async function copyPrompt(text, button)", self.js)
        self.assertIn("asset-prompt-details", self.js)
        self.assertIn("复制 Prompt", self.js)
        self.assertIn(".asset-prompt-details", self.css)

    def test_generation_submission_targets_the_active_collection(self):
        self.assertIn("function activeFolderId()", self.js)
        self.assertIn("payload.set('folder_id', activeFolderId());", self.js)

    def test_topbar_has_non_blocking_daily_usage_panel_for_every_model(self):
        for identifier in ("usage-toggle", "usage-total", "usage-panel", "usage-list"):
            self.assertIn(f'id="{identifier}"', self.html)
        self.assertIn("async function loadUsage()", self.js)
        self.assertIn("function renderUsage(usage)", self.js)
        self.assertIn("fetch('/api/usage')", self.js)
        self.assertIn(".usage-panel", self.css)
        self.assertIn(".usage-row.warning", self.css)
        self.assertIn(".usage-row.over", self.css)
        self.assertNotIn("usageLimitReached", self.js)

    def test_task_and_asset_cards_offer_recoverable_delete(self):
        self.assertIn("async function deleteTask(task)", self.js)
        self.assertIn("async function deleteLibraryAsset(asset)", self.js)
        self.assertIn("`/api/tasks/${task.id}`", self.js)
        self.assertIn("`/api/library/assets/${asset.id}`", self.js)
        self.assertIn("移入回收站", self.js)
        self.assertIn(".delete-action", self.css)


if __name__ == "__main__":
    unittest.main()
