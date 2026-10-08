import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from cloud_images import CloudImages


class CloudImagesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = CloudImages(self.root / 'manifest.json')
        self.source = self.root / 'original.jpg'
        Image.new('RGB', (2000, 1000), '#ec6534').save(self.source)
        self.original = self.source.read_bytes()

    def tearDown(self):
        self.temp.cleanup()

    def ready(self, name):
        return 'configured'

    def test_cloud_keeps_original_bytes_and_local_preview_survives_move(self):
        uploads = []
        def upload(source, mime, read_value, **kwargs):
            uploads.append((source.read_bytes(), mime))
            return {'tos_key': 'studio-originals/key.jpg', 'bucket': 'private'}
        with patch('tos_uploader.upload_original', side_effect=upload):
            info = self.store.persist(self.source, self.ready)
        self.assertEqual(uploads, [(self.original, 'image/jpeg')])
        self.assertEqual(info['original_bytes'], len(self.original))
        with Image.open(self.source) as preview:
            self.assertEqual(preview.format, 'WEBP')
            self.assertLessEqual(max(preview.size), 480)
        moved = self.root / 'trash-renamed.jpg'
        self.source.replace(moved)
        self.assertEqual(self.store.info(moved), info)
        with patch('tos_uploader.upload_original') as upload:
            self.store.persist(moved, self.ready)
            upload.assert_not_called()

    def test_failed_upload_preserves_original(self):
        with patch('tos_uploader.upload_original', side_effect=RuntimeError('upload failed')):
            with self.assertRaises(RuntimeError):
                self.store.persist(self.source, self.ready)
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertFalse(self.store.manifest.exists())

    def test_failed_manifest_write_preserves_original(self):
        self.store.manifest = self.root / 'directory'
        self.store.manifest.mkdir()
        with patch('tos_uploader.upload_original', return_value={'tos_key': 'key', 'bucket': 'bucket'}):
            with self.assertRaises(OSError):
                self.store.persist(self.source, self.ready)
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_unknown_embedded_id_cannot_access_cloud_objects(self):
        from PIL.PngImagePlugin import PngInfo
        info = PngInfo(); info.add_text('studio_cloud_id', 'unregistered')
        Image.new('RGB', (2, 2)).save(self.source, format='PNG', pnginfo=info)
        self.assertIsNone(self.store.info(self.source))

    def test_missing_configuration_preserves_original(self):
        with self.assertRaises(RuntimeError):
            self.store.persist(self.source, lambda name: '')
        self.assertEqual(self.source.read_bytes(), self.original)
