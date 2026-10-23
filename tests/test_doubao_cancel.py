import json
import sys
import tempfile
import threading
import time
import unittest
import subprocess
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
from unittest.mock import patch

import doubao_work
import server
from tests.test_history import task_snapshot
from tests.test_canvas import Fields


class DoubaoCancelTests(unittest.TestCase):
    def test_cancel_releases_only_matching_pending_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            task = task_snapshot('cancel-me', 'paused', provider='doubao_work', profile=doubao_work.PROFILE)
            (root / 'pending.json').write_text(json.dumps({'task_id': task['id'], 'url': 'old-session'}))
            (root / 'session.json').write_text(json.dumps({'url': 'old-session'}))
            with patch.object(doubao_work, 'STATE_DIR', root), patch.object(server, 'TASKS', {task['id']: task}), patch.object(server, 'HISTORY_FILE', root / 'history'):
                server.cancel_task(task['id'])
                self.assertEqual(task['status'], 'cancelled')
                self.assertEqual(doubao_work.pending_task_id(), '')
                self.assertFalse((root / 'session.json').exists())
                self.assertTrue((root / 'abandoned-cancel-me.json').is_file())
                server.run_task(task['id'])
                self.assertEqual(task['status'], 'cancelled')
                server.load_task_history()
                self.assertEqual(server.TASKS[task['id']]['status'], 'cancelled')
                server.cancel_task(task['id'])
                (root / 'pending.json').write_text(json.dumps({'task_id': 'other'}))
                server.cancel_task(task['id'])
                self.assertEqual(doubao_work.pending_task_id(), 'other')

    def test_late_worker_error_cannot_revive_cancelled_task(self):
        task = task_snapshot('late', 'queued', provider='doubao_work', profile=doubao_work.PROFILE)
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'TASKS', {'late': task}), patch.object(server, 'HISTORY_FILE', Path(directory) / 'history'), patch.object(doubao_work, 'STATE_DIR', Path(directory)):
            def generate(*args):
                server.cancel_task('late')
                raise RuntimeError('late bridge error')
            with patch.object(doubao_work, 'generate', side_effect=generate):
                server.run_task('late')
            self.assertEqual(task['status'], 'cancelled')

    def test_completed_and_other_provider_cannot_be_cancelled(self):
        for provider, status in [('doubao_work', 'completed'), ('ark', 'running')]:
            task = task_snapshot('t', status, provider=provider)
            with patch.object(server, 'TASKS', {'t': task}):
                with self.assertRaises(ValueError):
                    server.cancel_task('t')

    def test_running_bridge_is_stopped_and_returns_promptly(self):
        task = {'id': 'running', 'status': 'running'}
        errors = []
        with tempfile.TemporaryDirectory() as directory, patch.object(doubao_work, 'STATE_DIR', Path(directory)):
            started = Path(directory) / 'started'
            code = f'from pathlib import Path; import time; Path({str(started)!r}).touch(); time.sleep(60)'
            def run():
                try:
                    doubao_work._run_bridge([sys.executable, '-c', code], task=task, input='{}', text=True, capture_output=True, timeout=20, check=False)
                except RuntimeError as exc:
                    errors.append(str(exc))
            worker = threading.Thread(target=run)
            worker.start()
            deadline = time.monotonic() + 5
            while not started.exists() and time.monotonic() < deadline:
                time.sleep(.01)
            try:
                self.assertTrue(started.exists())
                task['status'] = 'cancelled'
                doubao_work.cancel(task['id'])
                worker.join(5)
                self.assertFalse(worker.is_alive())
                self.assertTrue(errors)
            finally:
                worker.join(22)

    def test_cancelled_task_does_not_block_new_submission(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            task = task_snapshot('old', 'paused', provider='doubao_work', profile=doubao_work.PROFILE)
            (root / 'pending.json').write_text(json.dumps({'task_id': 'old'}))
            with patch.object(doubao_work, 'STATE_DIR', root), patch.object(server, 'TASKS', {'old': task}), patch.object(server, 'UPLOADS_DIR', root / 'uploads'), patch.object(server, 'HISTORY_FILE', root / 'history'), patch.object(doubao_work, 'status', return_value={'ready': True}), patch.object(server.DOUBAO_EXECUTOR, 'submit') as submit:
                server.cancel_task('old')
                new = server.create_tasks(Fields(kind='video', profile=doubao_work.PROFILE, prompts='new', ratio='16:9', duration='4'))[0]
                self.assertEqual(new['status'], 'queued')
                submit.assert_called_once()

    def test_real_bridge_success_and_timeout_cleanup(self):
        completed = doubao_work._run_bridge([sys.executable, '-c', 'print("ok")'], task={'id': 'success'}, input='{}', text=True, capture_output=True, timeout=5, check=False)
        self.assertEqual(completed.stdout.strip(), 'ok')
        with self.assertRaises(subprocess.TimeoutExpired):
            doubao_work._run_bridge([sys.executable, '-c', 'import time; time.sleep(60)'], task={'id': 'timeout'}, input='{}', text=True, capture_output=True, timeout=.05, check=False)
        self.assertNotIn('timeout', doubao_work._PROCESSES)
        self.assertNotIn('success', doubao_work._PROCESSES)

    def test_http_cancel_and_resume_rejection(self):
        task = task_snapshot('http', 'paused', provider='doubao_work', profile=doubao_work.PROFILE)
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'TASKS', {'http': task}), patch.object(server, 'HISTORY_FILE', Path(directory) / 'history'), patch.object(doubao_work, 'STATE_DIR', Path(directory)):
            httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.StudioHandler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{httpd.server_port}'
            try:
                with urlopen(Request(base + '/api/tasks/http/cancel', method='POST'), timeout=5) as response:
                    self.assertTrue(json.load(response)['ok'])
                self.assertEqual(task['status'], 'cancelled')
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base + '/api/tasks/http/resume', method='POST'), timeout=5)
                self.assertEqual(error.exception.code, 400)
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join(2)
