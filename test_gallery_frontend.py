import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class GalleryFrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = (ROOT / "app.js").read_text(encoding="utf-8")
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.css = (ROOT / "style.css").read_text(encoding="utf-8")

    def test_polling_keeps_unchanged_cards_in_place(self):
        load_tasks = self.js[
            self.js.index("async function loadTasks()"):
            self.js.index("async function updateHealth()")
        ]

        self.assertNotIn("gallery.append(card);", load_tasks)
        self.assertIn("gallery.children[index]", load_tasks)
        self.assertIn("gallery.insertBefore(card, slot || null);", load_tasks)

    def test_gallery_header_has_live_status_counts_instead_of_a_static_legend(self):
        self.assertIn('id="queue-overview"', self.html)
        for status in ("total", "active", "completed", "failed"):
            self.assertIn(f'id="count-{status}"', self.html)
        self.assertNotIn('class="legend"', self.html)
        self.assertIn("function updateQueueOverview(tasks)", self.js)

    def test_task_card_separates_media_content_details_and_actions(self):
        for class_name in (
            "status-badge", "card-body", "task-prompt-details",
            "task-error-details", "card-actions",
        ):
            self.assertIn(f'class="{class_name}', self.html)
        self.assertIn("errorDetails.hidden = false;", self.js)
        self.assertNotIn("actions.append(error);", self.js)

    def test_every_task_exposes_the_full_prompt_without_cluttering_the_card(self):
        self.assertNotIn('class="task-prompt-details" hidden', self.html)
        self.assertIn(".task-prompt-full').textContent = task.prompt;", self.js)

    def test_gallery_uses_readable_wide_cards_and_avoids_full_card_blinking(self):
        self.assertIn("grid-template-columns:repeat(2,minmax(0,1fr))", self.css)
        self.assertNotIn(".task-card { animation:", self.css)
        self.assertNotIn(".task-card.running .placeholder {", self.css)
        self.assertIn("@media (prefers-reduced-motion:reduce)", self.css)

    def test_completed_media_replaces_only_the_placeholder_and_keeps_status(self):
        task_card = self.js[
            self.js.index("function taskCard(task)"):
            self.js.index("function link(label, href)")
        ]

        self.assertNotIn("frame.replaceChildren", task_card)
        self.assertIn("frame.querySelector('.placeholder').replaceWith(openPreview);", task_card)
        self.assertIn("frame.querySelector('.placeholder').replaceWith(video);", task_card)


if __name__ == "__main__":
    unittest.main()
