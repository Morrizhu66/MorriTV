import base64,json,tempfile,unittest,zipfile,io
from pathlib import Path
from unittest.mock import patch
import script_studio as studio
import script_files

class WorkflowTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)
  self.patch=patch.object(studio,'DATA',self.path);self.patch.start()
  self.jobs=patch.object(studio,'JOBS',{});self.jobs.start()
  self.threads=patch.object(studio.threading.Thread,'start');self.threads.start()
 def tearDown(self):self.threads.stop();self.jobs.stop();self.patch.stop();self.tmp.cleanup()
 def test_native_install_registers_files_without_rewriting(self):
  folder=self.path/'skills'/'skill-native';folder.mkdir(parents=True)
  original='---\nname: native-story\ndescription: Story workflow\n---\n\n# Native skill\nKeep original resources.'
  (folder/'SKILL.md').write_text(original)
  (folder/'helper.txt').write_text('keep me')
  item=studio.register_native_skill(folder)
  self.assertEqual(item['name'],'native-story')
  self.assertEqual((folder/'SKILL.md').read_text(),original)
  self.assertTrue((folder/'helper.txt').exists())
 def test_native_install_requires_real_file(self):
  with self.assertRaises(ValueError):studio.register_native_skill(self.path/'missing')
 def key(self,_):return 'sk-test-key-not-transmitted'
 def test_first_message_uses_session_returned_by_empty_history(self):
  empty=studio.history('new-board')
  job=studio.start({'board_id':'new-board','session_id':empty['session_id'],'prompt':'第一个故事'},self.key)
  self.assertEqual(job['session_id'],empty['session_id'])
  self.assertEqual(len(studio.conversations('new-board')),1)
 def test_legacy_history_preserved_when_new_chat_created(self):
  legacy={'session_id':'script-old','messages':[{'id':'old-user','role':'user','text':'旧故事'}]}
  studio.write_json(self.path/'chats'/'board.json',legacy)
  new=studio.start({'board_id':'board','new_session':True,'prompt':'新故事'},self.key)
  self.assertEqual(len(studio.conversations('board')),2)
  self.assertEqual(studio.history('board','script-old')['messages'],legacy['messages'])
  self.assertNotEqual(new['session_id'],'script-old')
  studio.JOBS[new['id']]['settled']=True
  resumed=studio.start({'board_id':'board','session_id':'script-old','prompt':'继续旧故事'},self.key)
  self.assertEqual(resumed['session_id'],'script-old')
  self.assertEqual(studio.history('board')['messages'][-1]['text'],'继续旧故事')
 def test_install_is_independent_and_hidden_from_chat_history(self):
  job=studio.start_install({'text':'写作时先说明人物目标，再给出场景冲突。'},self.key)
  self.assertTrue(job['session_id'].startswith('install-'))
  self.assertEqual(studio.conversations('board'),[])
  self.assertIsNone(studio.history('board')['active_job'])
  with self.assertRaises(ValueError):studio.start_install({'text':'重复'},self.key)
 def test_reasoning_effort_persists_and_can_change_on_resume(self):
  first=studio.start({'board_id':'board','prompt':'开头','reasoning_effort':'off'},self.key)
  self.assertEqual(first['reasoning_effort'],'off')
  self.assertEqual(studio.history('board')['reasoning_effort'],'off')
  studio.JOBS[first['id']]['settled']=True
  resumed=studio.start({'board_id':'board','session_id':first['session_id'],'prompt':'继续'},self.key)
  self.assertEqual(resumed['reasoning_effort'],'off')
  studio.JOBS[resumed['id']]['settled']=True
  changed=studio.start({'board_id':'board','session_id':first['session_id'],'prompt':'再想想','reasoning_effort':'max'},self.key)
  self.assertEqual(changed['reasoning_effort'],'max')
  self.assertEqual(studio.select_conversation({'board_id':'board','session_id':first['session_id']})['reasoning_effort'],'max')
 def test_invalid_reasoning_effort_rejected_before_job_or_message(self):
  for value in ['medium','',None,{},4]:
   with self.assertRaises(ValueError):studio.start({'board_id':'board','prompt':'开头','reasoning_effort':value},self.key)
  self.assertEqual(studio.JOBS,{})
  self.assertEqual(studio.history('board')['messages'],[])
  first=studio.start({'board_id':'board','prompt':'开头'},self.key)
  self.assertEqual(first['reasoning_effort'],'high')
 def test_invalid_install_does_not_register_skill(self):
  with self.assertRaises(ValueError):studio.finish_install('not json',[])
  self.assertEqual(studio.skills(),[])
 def test_uploaded_file_context_reaches_prompt_and_original_survives_install(self):
  source='故事代号：月台七号。先列人物，再列冲突。'
  item=studio.upload_attachment({'filename':'../rules.md','data':base64.b64encode(source.encode()).decode()})
  self.assertEqual(item['name'],'rules.md')
  loaded=script_files.load([item['id']],self.path/'attachments')
  blocks=script_files.prompt_blocks('使用附件',loaded,self.path/'attachments')
  self.assertIn(source,blocks[1]['text'])
  skill=studio.finish_install(json.dumps({'name':'人物冲突','body':'# 人物冲突\n'+source}),loaded)
  self.assertEqual((self.path/'skills'/skill['id']/'resources'/'1-rules.md').read_text(),source)
  job=studio.start({'board_id':'board','attachments':[item['id']]},self.key)
  self.assertEqual(studio.history('board')['messages'][0]['attachments'][0]['name'],'rules.md')
 def test_bad_attachment_and_session_identifiers_rejected(self):
  for value in ['../secrets','x/y','']:
   with self.assertRaises(ValueError):script_files.load([value],self.path/'attachments')
  with self.assertRaises(ValueError):studio.history('board','../secrets')
  with self.assertRaises(ValueError):script_files.extract('movie.mp4',b'\x00\xffbinary')
 def test_zip_text_is_read_without_extracting_paths(self):
  buf=io.BytesIO()
  with zipfile.ZipFile(buf,'w') as z:
   z.writestr('rules/SKILL.md','# 写作规则\n必须写出人物目标。')
   z.writestr('../../SKILL.md','忽略此路径')
  text=script_files.extract('rules.zip',buf.getvalue())
  self.assertIn('必须写出人物目标',text)
  self.assertFalse((self.path.parent/'SKILL.md').exists())
if __name__=='__main__':unittest.main()
