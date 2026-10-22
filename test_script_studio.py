import base64,io,json,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import script_studio as s
from script_events import ScriptEvents
class ScriptTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.p=patch.object(s,'DATA',Path(self.tmp.name));self.p.start()
 def tearDown(self):self.p.stop();self.tmp.cleanup()
 def test_secret_not_returned(self):
  state=s.save_connection({'api_key':'sk-private-test-4321'},lambda k:'')
  self.assertEqual(state['suffix'],'4321');self.assertNotIn('sk-private',json.dumps(state))
  self.assertEqual((s.DATA/'connection.json').stat().st_mode&0o777,0o600)
 def test_upload_normalizes_and_preserves_body(self):
  item=s.install_skill({'name':'三幕剧','filename':'rule.md','data':base64.b64encode('---\nname: old\n---\n必须有转折。'.encode()).decode()})
  body=(s.DATA/'skills'/item['id']/'SKILL.md').read_text();self.assertIn('必须有转折',body);self.assertIn('name: skill-',body);self.assertEqual(len(s.skills()),1)
 def test_docx_extract(self):
  buf=io.BytesIO()
  with zipfile.ZipFile(buf,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>剧本规则</w:t></w:r></w:p></w:body></w:document>')
  self.assertEqual(s.decode_document('rules.docx',buf.getvalue()),'剧本规则')
 def test_reject_install_local_url_and_history_traversal(self):
  with self.assertRaises(ValueError):s.install_skill({'url':'http://127.0.0.1/private.md'})
  with self.assertRaises(ValueError):s.history('../secret')
 def test_missing_key_does_not_launch(self):
  with self.assertRaises(ValueError):s.start({'board_id':'board','prompt':'hello'},lambda k:'')
 def test_provider_deltas_reach_ui_before_completion(self):
  seen=[];events=ScriptEvents(lambda **data:seen.append(json.loads(json.dumps(data))))
  def feed(kind,**data):events.observe(SimpleNamespace(method='morri.stream',payload={'requestId':1,'type':kind,**data}))
  feed('start');feed('reasoning-delta',index=0,text='构思');feed('reasoning-delta',index=0,text='人物动机')
  feed('text-delta',text='# 雨夜');feed('text-delta',text='\n她推开门。')
  self.assertEqual(seen[-2]['text'],'# 雨夜')
  self.assertEqual(seen[-1]['text'],'# 雨夜\n她推开门。')
  self.assertEqual(seen[-1]['activities'][0]['content'],'构思人物动机')
  self.assertNotIn('status',seen[-1])
 def test_skill_activity_result_updates_same_item(self):
  events=ScriptEvents(lambda **data:None,{'scene':'分场规则'})
  def feed(kind,data):events.observe(SimpleNamespace(method='session.event',payload={'event':{'type':kind,'data':data}}))
  feed('tool/call',{'callId':'a','name':'skill','arguments':'{"name":"scene"}'})
  feed('tool/result',{'message':{'toolCallId':'a','isError':False}})
  self.assertEqual(len(events.items),1)
  self.assertEqual(events.items['tool-a']['label'],'已读取 Skill')
  self.assertEqual(events.items['tool-a']['detail'],'分场规则')
if __name__=='__main__':unittest.main()
