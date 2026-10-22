import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import server
import lingganya_client
from board_store import BoardStore, BoardConflict
from board_export import build_export


class Fields(dict):
    def getfirst(self,key,default=''):return self.get(key,default)


class CanvasTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def document(self):
        return {'revision':0,'projects':[{'id':'project','name':'test','boards':[{'id':'board','nodes':[{'id':'node','type':'image','x':10,'y':20,'refs':[{'nodeId':'source','versionId':'v1'}],'versions':[]}],'shots':[{'id':'shot','name':'01'}]}]}]}
    def test_layout_references_and_story_order_survive_restart(self):
        store=BoardStore(self.root/'boards.json');doc=self.document();store.save(doc)
        reopened=BoardStore(store.path).load()
        self.assertEqual(reopened['projects'],doc['projects']);self.assertEqual(reopened['revision'],1)
    def test_stale_window_cannot_overwrite_saved_board(self):
        store=BoardStore(self.root/'boards.json');doc=self.document();store.save(doc)
        with self.assertRaises(BoardConflict):store.save(doc)
        self.assertEqual(store.load()['revision'],1)
    def test_invalid_coordinates_rejected(self):
        store=BoardStore(self.root/'boards.json');doc=self.document();doc['projects'][0]['boards'][0]['nodes'][0]['x']=float('nan')
        with self.assertRaises(ValueError):store.save(doc)
        self.assertFalse(store.path.exists())
    def test_malformed_import_cannot_replace_valid_document(self):
        store=BoardStore(self.root/'boards.json');store.save(self.document())
        for mutate in (
            lambda d:d['projects'][0].update(boards=[]),
            lambda d:d['projects'][0]['boards'][0].update(view={'x':0,'y':0,'z':0}),
            lambda d:d['projects'][0]['boards'][0]['nodes'][0].update(refs='broken'),
        ):
            doc=store.load();mutate(doc)
            with self.assertRaises(ValueError):store.save(doc)
            self.assertEqual(store.load()['revision'],1)
    def test_task_submission_is_idempotent_and_snapshots_binding(self):
        fields=Fields(kind='image',profile=lingganya_client.PROFILE,prompts='keep @character',ratio='1:1',resolution='1K',board_id='b',node_id='n',submission_id='once',reference_bindings=json.dumps([{'versionId':'v1','role':'角色参考'}]))
        with patch.object(server,'TASKS',{}),patch.object(server,'UPLOADS_DIR',self.root/'uploads'),patch.object(server,'HISTORY_FILE',self.root/'history.jsonl'),patch.object(server.IMAGE_EXECUTOR,'submit') as submit:
            first=server.create_tasks(fields)[0];second=server.create_tasks(fields)[0]
            self.assertEqual(first['id'],second['id']);submit.assert_called_once()
            restored=server.restore_history_task(server.history_task_snapshot(first))
            public=server.public_task(restored)
            self.assertEqual(public['board_id'],'b');self.assertEqual(public['node_id'],'n');self.assertEqual(public['reference_bindings'][0]['versionId'],'v1')
    def test_legacy_provider_disabled_seedream_unchanged(self):
        with self.assertRaisesRegex(ValueError,'HFSY 已移除'):server.validate_task_input('image','hfsy-gpt-image-2','x','1:1','5','1K',[])
        self.assertEqual(server.validate_task_input('image','seedream50-pro-ark-direct','x','','','',[]),'ark')
    def test_lingganya_does_not_invoke_ark_or_expose_secret(self):
        image=io.BytesIO();Image.new('RGB',(8,8),'red').save(image,format='PNG')
        fields=Fields(kind='image',profile=lingganya_client.PROFILE,prompts='x',ratio='1:1',resolution='1K')
        with patch.object(server,'TASKS',{}),patch.object(server,'UPLOADS_DIR',self.root/'uploads'),patch.object(server,'RESULTS_DIR',self.root/'results'),patch.object(server,'HISTORY_FILE',self.root/'history.jsonl'),patch.object(server.IMAGE_EXECUTOR,'submit'),patch.object(server,'register_completed_task'),patch.object(server,'persist_cloud_image'),patch.object(server,'private_env_value',return_value='secret'),patch.object(server.lingganya_client,'generate',return_value=image.getvalue()),patch.object(server.subprocess,'run') as ark:
            task=server.create_tasks(fields)[0];server.run_task(task['id']);ark.assert_not_called();self.assertEqual(task['status'],'completed');self.assertNotIn('secret',json.dumps(server.public_task(task)));self.assertTrue((self.root/'results'/(task['id']+'.png')).exists())
    def test_health_requires_nonempty_lingganya_key(self):
        with patch.object(server,'PRIVATE_ENV',self.root/'.env'),patch.dict(server.os.environ,{},clear=True):
            self.assertFalse(server.health_flags()['lingganya_ready'])
            server.PRIVATE_ENV.write_text('LINGGANYA_API_KEY=private-key\n')
            self.assertTrue(server.health_flags()['lingganya_ready']);self.assertNotIn('private-key',repr(server.health_flags()))
    def test_export_contains_selected_media_and_rejects_traversal(self):
        (self.root/'results').mkdir();(self.root/'results'/'test.png').write_bytes(b'image')
        cloud=server.CloudImages(self.root/'cloud.json')
        payload={'shots':[{'name':'shot'}],'media':[{'name':'001','url':'/media/results/test.png','snapshot':{'prompt':'test'}}]}
        data=build_export(payload,{'results':self.root/'results'},cloud,lambda _: '')
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            self.assertIn('storyboard.csv',z.namelist());self.assertEqual(z.read('001-001.png'),b'image')
        payload['media'][0]['url']='/media/results/../secret.png'
        with self.assertRaises(ValueError):build_export(payload,{'results':self.root/'results'},cloud,lambda _: '')
