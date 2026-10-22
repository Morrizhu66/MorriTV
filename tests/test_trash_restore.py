import io
import json
from pathlib import Path

import server
from test_usage_and_deletion import UsageAndDeletionTests, task


class TrashRestoreTests(UsageAndDeletionTests):
    def test_imported_asset_restores_original_id_and_bytes_after_folder_deleted(self):
        folder = server.MEDIA_LIBRARY.create_folder('test')
        asset = server.MEDIA_LIBRARY.import_stream('image.png', 'image/png', io.BytesIO(b'image'), folder['id'])
        server.delete_library_asset(asset['id'])
        entry = server.list_trash()[0]
        self.assertTrue(entry['can_restore'])
        self.assertTrue(entry['url'].startswith('/media/trash/'))
        server.MEDIA_LIBRARY.delete_folder(folder['id'])
        server.restore_trash(entry['id'])
        restored = server.MEDIA_LIBRARY.snapshot()['assets'][0]
        self.assertEqual(restored['id'], asset['id'])
        self.assertEqual(restored['folder_id'], '')
        self.assertEqual((server.RESULTS_DIR / restored['file_name']).read_bytes(), b'image')
        self.assertEqual(server.list_trash(), [])

    def test_restored_task_and_reference_survive_history_reload(self):
        item = task('restore-task', 'seedream50-pro-ark-direct', server.now())
        image = server.RESULTS_DIR / 'restore-task.png'
        image.write_bytes(b'original')
        reference = server.UPLOADS_DIR / 'ref.png'
        reference.write_bytes(b'reference')
        item.update(local_image_url='/media/results/restore-task.png', reference_files=[{'name': 'ref.png', 'mime': 'image/png', 'path': str(reference)}])
        server.TASKS[item['id']] = item
        server.register_completed_task(item)
        server.delete_task(item['id'])
        entry = server.list_trash()[0]
        # Existing files must not be overwritten on restore.
        image.write_bytes(b'new-image')
        reference.write_bytes(b'new-reference')
        server.restore_trash(entry['id'])
        server.TASKS.clear()
        server.load_task_history()
        restored = server.TASKS[item['id']]
        self.assertNotEqual(restored['local_image_url'], item['local_image_url'])
        self.assertEqual(Path(restored['reference_files'][0]['path']).read_bytes(), b'reference')
        self.assertEqual(reference.read_bytes(), b'new-reference')
        self.assertEqual(image.read_bytes(), b'new-image')
        self.assertEqual(len(server.MEDIA_LIBRARY.snapshot()['assets']), 1)

    def test_failed_task_without_media_is_restorable(self):
        item = task('failed-task', 'seedream50-pro-ark-direct', server.now(), 'failed')
        server.TASKS[item['id']] = item
        server.delete_task(item['id'])
        entry = server.list_trash()[0]
        self.assertEqual(entry['url'], '')
        server.restore_trash(entry['id'])
        self.assertEqual(server.TASKS[item['id']]['status'], 'failed')

    def test_invalid_trash_path_is_rejected(self):
        for entry_id in ('../results', '/tmp', 'missing'):
            with self.assertRaises(ValueError):
                server.restore_trash(entry_id)

    def test_missing_media_does_not_remove_recovery_metadata(self):
        asset = server.MEDIA_LIBRARY.import_stream('image.png', 'image/png', io.BytesIO(b'image'))
        server.delete_library_asset(asset['id'])
        entry = server.list_trash()[0]
        root = server.TRASH_DIR / entry['id']
        next((root / 'results').iterdir()).unlink()
        with self.assertRaises(ValueError):
            server.restore_trash(entry['id'])
        self.assertTrue((root / 'metadata.json').is_file())
