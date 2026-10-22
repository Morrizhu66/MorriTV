import tempfile
import unittest
from pathlib import Path
from script_runtime import session_storage_patch, worker_error


class RuntimeCompatibilityTests(unittest.TestCase):
    def test_new_store_retains_native_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(session_storage_patch(Path(tmp)), [])

    def test_old_native_history_selects_matching_encoding_without_rewriting(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            log = home / 'sessions' / 'workspace' / 'old-chat' / 'session.v4.jsonl'
            log.parent.mkdir(parents=True)
            log.write_text('existing native history\n')
            self.assertEqual(session_storage_patch(home), [
                {'id': 'session-persistence-jsonl', 'config': {'root': str(home / 'sessions'), 'compression': 'none'}}])
            self.assertEqual(log.read_text(), 'existing native history\n')

    def test_storage_errors_are_not_reported_as_network_or_credentials(self):
        error = worker_error(RuntimeError('session artifact uses .jsonl but compression zstd'))
        self.assertIn('会话存储格式', error)
        self.assertNotIn('API Key', error)
        self.assertNotIn('超时', error)

    def test_unknown_errors_do_not_expose_provider_details(self):
        self.assertNotIn('secret-value', worker_error(RuntimeError('secret-value')))


if __name__ == '__main__':
    unittest.main()
