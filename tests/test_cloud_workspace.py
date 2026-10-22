import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from board_store import BoardStore
from cloud_images import CloudImages
from cloud_workspace import CloudWorkspace


class CloudWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.objects = {}
        self.uploaded = []
        self.put = patch('tos_uploader.put_document', side_effect=self.put_document).start()
        self.get = patch('tos_uploader.get_document', side_effect=lambda key, *_: self.objects.get(key)).start()
        self.upload = patch('tos_uploader.upload_original', side_effect=self.upload_original).start()
        self.addCleanup(patch.stopall)
        self.addCleanup(self.temp.cleanup)
        self.images = CloudImages(self.root / 'cloud-images.json')
        self.store = CloudWorkspace(self.root, self.images, self.read_value)

    def read_value(self, key):
        return '' if key == 'TOS_WORKSPACE_ID' else 'configured'

    def put_document(self, key, content, *_):
        self.objects[key] = content
        return {'bucket': 'private', 'tos_key': key}

    def upload_original(self, source, mime, *_, **kwargs):
        key = 'objects/' + str(len(self.uploaded))
        self.uploaded.append((source.read_bytes(), mime, key))
        return {'bucket': 'private', 'tos_key': key}

    def video(self):
        (self.root / 'results').mkdir(exist_ok=True)
        path = self.root / 'results/v.mp4'
        path.write_bytes(b'original-video')
        return path, {'id': 'v', 'kind': 'video', 'url': '/media/results/v.mp4'}

    def test_failed_cloud_save_does_not_advance_board_revision(self):
        boards = BoardStore(self.root / 'boards.json')
        boards.remote_writer = self.store.save_board
        with patch('tos_uploader.put_document', side_effect=OSError('offline')):
            with self.assertRaisesRegex(RuntimeError, '云端'):
                boards.save({'revision': 0, 'projects': []})
        self.assertEqual(boards.load()['revision'], 0)
        result = boards.save({'revision': 0, 'projects': []})
        self.assertEqual(result['revision'], 1)
        self.assertEqual(json.loads(self.objects[self.store.prefix + 'boards.json']), result)

    def test_image_reuses_cloud_original_and_adds_cloud_preview(self):
        path = self.root / 'results/image.png'
        path.parent.mkdir()
        Image.new('RGB', (1600, 900), '#313b42').save(path)
        original = path.read_bytes()
        existing = self.images.persist(path, self.read_value)
        self.store.persist_asset({'id': 'image', 'kind': 'image', 'url': '/media/results/image.png'})
        record = self.store.info(path)
        self.assertEqual(record['tos_key'], existing['tos_key'])
        self.assertEqual(self.uploaded[0][0], original)
        self.assertEqual(len(self.uploaded), 2)
        self.assertEqual(record['preview']['mime'], 'image/webp')
        self.store.persist_asset({'id': 'image', 'kind': 'image', 'url': '/media/results/image.png'})
        self.assertEqual(len(self.uploaded), 2)

    def test_video_can_be_resolved_after_cache_loss_and_from_fresh_machine(self):
        path, asset = self.video()
        self.store.persist_asset(asset)
        (self.root / 'media-library.json').write_text(json.dumps({'assets': [asset], 'folders': []}))
        self.store.save_board({'revision': 3, 'projects': []})
        self.store.sync_documents()
        path.unlink()
        self.assertEqual(self.store.info(path)['original_bytes'], len(b'original-video'))
        with tempfile.TemporaryDirectory() as fresh:
            restored = CloudWorkspace(Path(fresh), CloudImages(Path(fresh) / 'cloud-images.json'), self.read_value)
            restored.restore_documents()
            self.assertEqual(json.loads((Path(fresh) / 'boards.json').read_bytes())['revision'], 3)
            self.assertEqual(json.loads((Path(fresh) / 'media-library.json').read_bytes())['assets'][0]['id'], 'v')
            self.assertEqual(restored.info(Path(fresh) / 'results/v.mp4')['tos_key'], self.store.info(path)['tos_key'])

    def test_move_keeps_old_and_new_urls_bound_to_same_immutable_asset(self):
        path, asset = self.video()
        self.store.persist_asset(asset)
        moved = dict(asset, url='/media/collections/f/results/v.mp4')
        self.store.persist_asset(moved)
        self.assertEqual(len(self.uploaded), 1)
        self.assertEqual(self.store.info(path), self.store.info(self.root / 'collections/f/results/v.mp4'))

    def test_missing_source_is_reported_and_not_marked_uploaded(self):
        _, asset = self.video()
        (self.root / 'results/v.mp4').unlink()
        self.store.asset_ids = {'v'}
        self.store.persist_asset(asset)
        status = self.store.status()
        self.assertEqual((status['stored'], status['missing'], status['pending']), (0, 1, 0))
        self.assertEqual(self.uploaded, [])

    def test_newer_cloud_board_recovers_after_local_commit_interruption(self):
        self.store.save_board({'revision': 4, 'projects': []})
        (self.root / 'boards.json').write_text('{"revision":3,"projects":[]}')
        self.store.restore_documents()
        self.assertEqual(json.loads((self.root / 'boards.json').read_text())['revision'], 4)

    def test_unchanged_documents_are_not_reuploaded(self):
        self.store.save_board({'revision': 1, 'projects': []})
        self.store.save_board({'revision': 1, 'projects': []})
        self.assertEqual(self.put.call_count, 1)

    def test_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            self.store.persist_asset({'id': 'bad', 'kind': 'video', 'url': '/media/../../etc/passwd'})
        self.assertIsNone(self.store.info('/etc/passwd'))

    def test_restored_cloud_media_can_move_and_enter_recoverable_trash(self):
        from media_library import MediaLibrary
        for kind in ('image', 'video'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as fresh:
                root = Path(fresh)
                suffix = '.png' if kind == 'image' else '.mp4'
                asset = {'id': kind, 'kind': kind, 'name': kind + suffix,
                         'file_name': kind + suffix, 'folder_id': '',
                         'url': '/media/results/' + kind + suffix}
                content = b'cloud-preview' if kind == 'image' else b'cloud-video'
                record = {'urls': [asset['url']], 'kind': kind, 'bucket': 'private',
                          'tos_key': 'original', 'original_bytes': len(content)}
                if kind == 'image':
                    record['preview'] = {'bucket': 'private', 'tos_key': 'preview', 'original_bytes': len(content)}
                self.objects[self.store.prefix + 'cloud-index.json'] = self.store.encode({'media': {kind: record}})
                self.objects[self.store.prefix + 'media-library.json'] = self.store.encode({'folders': [], 'assets': [asset]})
                cloud = CloudWorkspace(root, CloudImages(root / 'cloud-images.json'), self.read_value)
                cloud.restore_documents()
                library = MediaLibrary(root / 'media-library.json', root / 'results', restore_cache=cloud.restore_cache)
                folder = library.create_folder('目标')
                with patch.object(cloud, 'url', return_value='https://example.invalid/media') as signed, patch('cloud_workspace.urlopen', side_effect=lambda *a, **k: io.BytesIO(content)):
                    moved = library.move_asset(kind, folder['id'])
                    self.assertEqual(signed.call_args.args[0]['tos_key'], 'preview' if kind == 'image' else 'original')
                    source = library.workspace_result_dir(folder['id']) / moved['file_name']
                    self.assertEqual(source.read_bytes(), content)
                    cloud.persist_asset(moved)
                    source.unlink()  # Losing the cache again must not prevent deletion.
                    trashed = library.trash_asset(kind, root / 'trash' / kind)
                    trash_file = Path(trashed['trash_file'])
                    self.assertEqual(trash_file.read_bytes(), content)
                    self.assertEqual(library.snapshot()['assets'], [])
                    restored = library.restore_asset(trashed['asset'], trash_file)
                    self.assertEqual((library.workspace_result_dir(restored['folder_id']) / restored['file_name']).read_bytes(), content)

    def test_incomplete_cloud_download_preserves_manifest_and_cleans_partial_file(self):
        from media_library import MediaLibrary
        path, asset = self.video()
        self.store.persist_asset(asset)
        path.unlink()
        manifest = self.root / 'media-library.json'
        asset.update(file_name='v.mp4', folder_id='')
        manifest.write_bytes(self.store.encode({'folders': [], 'assets': [asset]}))
        library = MediaLibrary(manifest, self.root / 'results', restore_cache=self.store.restore_cache)
        before = manifest.read_bytes()
        with patch.object(self.store, 'url', return_value='https://example.invalid/media'), patch('cloud_workspace.urlopen', return_value=io.BytesIO(b'short')):
            with self.assertRaisesRegex(ValueError, '不完整'):
                library.trash_asset('v', self.root / 'trash/v')
        self.assertEqual(manifest.read_bytes(), before)
        self.assertFalse(path.exists())
        self.assertEqual(list(path.parent.glob('*.restore-part')), [])
