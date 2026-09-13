"""Install the additive student-preview hook only onto the reviewed server."""
import hashlib
from pathlib import Path
import shutil
import sys

server = Path('/root/em-console-api/server.py')
backup = Path(sys.argv[1])
source = server.read_bytes()
assert hashlib.sha256(source).hexdigest() == 'e5126dbdf9d5df349e5316c3319719749c462ed13a914b1da1bdf8b4d0b07def', 'Console server changed; review before deploying'
text = source.decode('utf-8')
anchor = '        if self._biz("GET", path, params) or self._mail(path, params) or self._wa("GET", path, params):'
assert text.count(anchor) == 1
text = text.replace(anchor,
    '        import student_previews\n'
    '        if student_previews.handle(self, path, params, _convex_query, build_index, _lib, WEBROOT):\n'
    '            return\n\n' + anchor)
compile(text, str(server), 'exec')
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(server, backup / 'console-server.py')
module = server.with_name('student_previews.py')
assert not module.exists(), 'Preview module already exists; review before replacing'
shutil.copy2(Path(__file__).with_name('student_previews.py'), module)
staged = server.with_suffix('.student-preview-staged')
staged.write_text(text, encoding='utf-8')
staged.chmod(server.stat().st_mode & 0o777)
staged.replace(server)
print('Installed student-preview module and reviewed additive GET hook.')
