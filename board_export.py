"""Export only selected, local-library media; never arbitrary filesystem paths."""
import csv
import io
import json
import re
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import urlopen


def build_export(payload, roots, cloud_images, read_value):
    media = payload.get('media', [])
    if not isinstance(media, list) or len(media) > 200:
        raise ValueError('一次最多导出 200 份采用素材')
    result = io.BytesIO()
    total = 0
    with zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr('storyboard.json', json.dumps(payload.get('shots', []), ensure_ascii=False, indent=2))
        table = io.StringIO()
        writer = csv.writer(table)
        writer.writerow(['镜号', '镜头', '场景', '描述', '对白', '目标时长', '采用图片', '采用视频'])
        for i, shot in enumerate(payload.get('shots', [])):
            writer.writerow([i+1, shot.get('name'), shot.get('scene'), shot.get('description'), shot.get('dialogue'), shot.get('duration'), bool(shot.get('image')), bool(shot.get('video'))])
        bundle.writestr('storyboard.csv', '\ufeff' + table.getvalue())
        for index, item in enumerate(media):
            url = urlparse(str(item.get('url', '')))
            if url.scheme or url.netloc or not url.path.startswith('/media/'):
                raise ValueError('只可导出已保存到素材库的结果')
            parts = Path(unquote(url.path.removeprefix('/media/'))).parts
            if not parts or parts[0] not in roots:
                raise ValueError('素材路径无效')
            root = roots[parts[0]].resolve()
            source = root.joinpath(*parts[1:]).resolve()
            if not source.is_relative_to(root):
                raise ValueError('素材已移动或删除，请重新选择采用版本')
            if source.suffix.lower() not in {'.png','.jpg','.jpeg','.webp','.gif','.mp4','.webm','.mov'}:
                raise ValueError('不支持的素材格式')
            cloud = cloud_images.info(source)
            if not source.is_file() and not cloud:
                raise ValueError("素材已移动或删除，请重新选择采用版本")
            if cloud:
                with urlopen(cloud_images.url(cloud, read_value), timeout=120) as response:
                    data = response.read(128 * 1024 * 1024 + 1)
            else:
                if source.stat().st_size > 128 * 1024 * 1024:
                    raise ValueError('单个素材超过 128 MiB，请单独下载')
                data = source.read_bytes()
            if len(data) > 128 * 1024 * 1024:
                raise ValueError('单个素材超过 128 MiB，请单独下载')
            total += len(data)
            if total > 512 * 1024 * 1024:
                raise ValueError('导出超过 512 MiB，请分批导出')
            name = re.sub(r'[^\w\-\u4e00-\u9fff]', '_', str(item.get('name') or 'shot'))[:100]
            name = f'{index+1:03d}-{name}'
            bundle.writestr(name + source.suffix, data)
            bundle.writestr(name + '-prompt.json', json.dumps(item.get('snapshot') or {}, ensure_ascii=False, indent=2))
    return result.getvalue()
