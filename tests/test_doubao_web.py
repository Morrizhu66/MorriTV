import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import doubao_web


class DoubaoWebTests(unittest.TestCase):
    def test_submission_does_not_inspect_available_tools(self):
        page = MagicMock()
        page.url = 'https://www.doubao.com/chat/123'
        page.locator.return_value.inner_text.return_value = ''
        def element(test_id):
            if test_id == 'general-agent-skill-button':
                raise AssertionError('submission must not inspect the tool menu')
            item = MagicMock()
            item.count.return_value = 0
            return item
        page.get_by_test_id.side_effect = element
        with tempfile.TemporaryDirectory() as directory, patch.object(doubao_web, 'ROOT', Path(directory)), patch.object(doubao_web, 'configure') as configure:
            pending = doubao_web.submit(page, {'task_id': 'no-tool-check', 'prompt': 'generate video', 'references': []})
            configure.assert_called_once_with(page)
            self.assertEqual(pending['task_id'], 'no-tool-check')
            page.locator.return_value.fill.assert_called_once_with('generate video')
            page.get_by_role.assert_not_called()
            self.assertTrue((Path(directory) / 'pending.json').exists())
