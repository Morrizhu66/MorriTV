"""Bounded attachment ingestion. Originals stay local; readable content goes to Harness."""
import base64, io, json, re, subprocess, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

MAX_BYTES = 20 * 1024 * 1024
MAX_TEXT = 150000

def extract(name, data, depth=0):
    suffix = Path(name).suffix.lower()
    if data.startswith(b'%PDF'):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) > 200: raise ValueError('PDF 请控制在 200 页以内')
        text = '\n\n'.join(page.extract_text() or '' for page in reader.pages)
    elif zipfile.is_zipfile(io.BytesIO(data)):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 500 or sum(x.file_size for x in entries) > 40 * 1024 * 1024:
                raise ValueError('压缩包展开后过大，请精简文件')
            if suffix in {'.docx', '.pptx', '.xlsx', '.odt'}:
                selected = [i for i in entries if re.match(r'(word/document|ppt/slides/slide\d+|xl/(sharedStrings|worksheets/sheet\d+)|content)\.xml$', i.filename)]
                text = '\n\n'.join(i.filename + '\n' + '\n'.join(t for t in ET.fromstring(archive.read(i)).itertext() if t.strip()) for i in selected)
            else:
                if depth: raise ValueError('请先解压嵌套的压缩包')
                parts = []
                for i in entries:
                    if i.is_dir() or i.filename.startswith('__MACOSX/') or '/.' in i.filename: continue
                    try: value = extract(i.filename, archive.read(i), depth+1)
                    except (ValueError, UnicodeError):
                        value = '[二进制资源，原文件已保留，不作为文本读取]'
                    parts.append('文件：'+i.filename+'\n'+value)
                text = '\n\n'.join(parts)
    elif suffix in {'.doc', '.rtf'}:
        result = subprocess.run(['/usr/bin/textutil','-convert','txt','-stdin','-stdout','-format',suffix[1:]], input=data, capture_output=True, timeout=20)
        if result.returncode: raise ValueError('无法读取此文档，请另存为 DOCX 或文本')
        text = result.stdout.decode('utf-8')
    else:
        try: text = data.decode('utf-8-sig')
        except UnicodeError: raise ValueError('这个文件无法读取为写作资料，请转换为文档、图片或文本后重试')
        if '\x00' in text or sum(ord(c)<9 for c in text) > 3: raise ValueError('此二进制文件没有可读取的文本')
    if not text.strip(): raise ValueError('文件中没有可读取的文字；扫描 PDF 请先转成文字或图片')
    if len(text) > MAX_TEXT: raise ValueError('附件文字超过 15 万字，请拆分后上传')
    return text

def ingest(payload, root):
    try: data = base64.b64decode(payload.get('data',''), validate=True)
    except Exception: raise ValueError('上传内容无效')
    if not data or len(data)>MAX_BYTES: raise ValueError('单个附件请控制在 20 MB 以内')
    name = Path(str(payload.get('filename') or '附件').replace('\\','/')).name[:180]
    mime = 'image/png' if data.startswith(b'\x89PNG\r\n') else 'image/jpeg' if data.startswith(b'\xff\xd8\xff') else 'image/webp' if data[:4]==b'RIFF' and data[8:12]==b'WEBP' else 'image/gif' if data.startswith((b'GIF87a',b'GIF89a')) else ''
    text = '' if mime else extract(name,data)
    import uuid
    ident = uuid.uuid4().hex
    folder = root/ident;folder.mkdir(parents=True)
    (folder/'original').write_bytes(data);(folder/'original').chmod(0o600)
    item = dict(id=ident,name=name,size=len(data),kind='image' if mime else 'document',mime=mime,characters=len(text))
    (folder/'content.json').write_text(json.dumps(dict(item, text=text),ensure_ascii=False));(folder/'content.json').chmod(0o600)
    return item

def load(ids, root):
    if not isinstance(ids,list) or len(ids)>6: raise ValueError('每条消息最多添加 6 个附件')
    items=[]
    for ident in ids:
        if not isinstance(ident,str) or not re.fullmatch(r'[a-f0-9]{32}',ident): raise ValueError('附件标识无效')
        path=root/ident/'content.json'
        if not path.exists(): raise ValueError('附件不存在，请重新上传')
        items.append(json.loads(path.read_text()))
    if sum(i['characters'] for i in items)>MAX_TEXT: raise ValueError('附件文字合计超过 15 万字，请分次发送')
    return items

def prompt_blocks(prompt, items, root):
    blocks=[{'type':'text','text':prompt}]
    for item in items:
        blocks.append({'type':'text','text':'\n附件：'+item['name']+'\n'+item['text']})
        if item['kind']=='image':
            blocks.append({'type':'image','mimeType':item['mime'],'data':base64.b64encode((root/item['id']/'original').read_bytes()).decode()})
    return blocks
