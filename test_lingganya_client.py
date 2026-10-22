import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request
import lingganya_client as client


def task(**changes):
    return dict(profile=client.PROFILE, prompt='a duck', ratio='1:1', resolution='1K', duration='5', reference_files=[], **changes)


def response(data):
    return json.dumps(data).encode(), 'application/json'


class LingganyaContractTests(unittest.TestCase):
    def test_image_posts_once_and_decodes_synchronous_base64(self):
        with patch.object(client,'request',return_value=response({'data':[{'b64_json':base64.b64encode(b'image').decode()}]})) as request:
            self.assertEqual(client.generate(task(),'secret'),b'image')
        self.assertEqual(request.call_count,1)
        self.assertEqual(request.call_args.args[0],'/v1/images/generations')
        payload=json.loads(request.call_args.args[2])
        self.assertEqual(payload,dict(model=client.MODEL,prompt='a duck',size='1024x1024',n=1,response_format='b64_json'))

    def test_edit_uploads_real_file_not_a_filename_in_prompt(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'reference.png';source.write_bytes(b'reference-content')
            data=task();data['reference_files']=[{'path':str(source),'mime':'image/png'}]
            with patch.object(client,'request',return_value=response({'data':[{'b64_json':base64.b64encode(b'edited').decode()}]})) as request:
                self.assertEqual(client.generate(data,'secret'),b'edited')
            args=request.call_args.args
            self.assertEqual(args[0],'/v1/images/edits')
            self.assertIn(b'name="image"',args[2]);self.assertIn(b'reference-content',args[2]);self.assertIn('multipart/form-data',args[3])

    def test_post_failure_never_automatically_retries(self):
        with patch.object(client,'request',side_effect=RuntimeError('403')) as request:
            with self.assertRaises(RuntimeError):client.generate(task(),'secret')
        self.assertEqual(request.call_count,1)

    def test_async_saves_id_and_only_polls_original_task(self):
        data=task();data.update(profile=client.VIDEO_PROFILE,ratio='16:9',resolution='720p')
        calls=[response({'task_id':'task-1','status':'queued'}),response({'status':'completed'}),(b'video','video/mp4')]
        ids=[];sleeps=[]
        with patch.object(client,'request',side_effect=calls) as request:
            self.assertEqual(client.generate(data,'secret',ids.append,sleeps.append),b'video')
        self.assertEqual(ids,['task-1']);self.assertEqual(sleeps,[30])
        self.assertEqual([c.args[0] for c in request.call_args_list],['/v1/videos','/v1/videos/task-1','/v1/videos/task-1/content'])
        self.assertEqual(json.loads(request.call_args_list[0].args[2])['seconds'],5)

    def test_resume_does_not_create_a_second_task(self):
        data=task(provider_task_id='saved-task')
        with patch.object(client,'request',side_effect=[response({'status':'completed'}),(b'content','image/png')]) as request:
            self.assertEqual(client.generate(data,'secret',sleep=lambda _:None),b'content')
        self.assertTrue(all('/generations' not in c.args[0] for c in request.call_args_list))

    def test_query_error_pauses_instead_of_resubmitting(self):
        with patch.object(client,'request',side_effect=[response({'task_id':'known','status':'queued'}),RuntimeError('network')]) as request:
            with self.assertRaises(client.PendingTask):client.generate(task(),'secret',sleep=lambda _:None)
        self.assertEqual(request.call_count,2)

    def test_video_minimum_and_reference_compatibility(self):
        data=task();data.update(profile=client.VIDEO_PROFILE,ratio='16:9',resolution='720p',duration='1')
        with patch.object(client,'request') as request:
            with self.assertRaises(ValueError):client.generate(data,'secret')
        request.assert_not_called()
        with self.assertRaises(ValueError):client.validate(client.PROFILE,'x','1:1','1K',[{'mime':'video/mp4'}])
        with self.assertRaises(ValueError):client.validate(client.PROFILE,'x','16:9','4K',[])

    def test_credentials_are_removed_on_cross_origin_redirect(self):
        req=Request(client.BASE_URL+'/content',headers={'Authorization':'Bearer secret'})
        redirected=client.SafeRedirect().redirect_request(req,None,302,'',{},'https://cdn.example/image.png')
        self.assertFalse(redirected.has_header('Authorization'))
        same=client.SafeRedirect().redirect_request(req,None,302,'',{},client.BASE_URL+'/next')
        self.assertEqual(same.get_header('Authorization'),'Bearer secret')
