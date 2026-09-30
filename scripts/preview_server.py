"""Local preview with fresh responses and live reload.

Run: python scripts/preview_server.py --port 8000
The normal root keeps the animated entrance. /preview/ opens the rebuilt
homepage directly for review. Preview helpers are injected only by this server;
the generated production HTML is not modified.
"""
from functools import partial
from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]
WATCHED_SUFFIXES = {'.html', '.css', '.js', '.jpg', '.png', '.svg', '.mp4', '.txt'}
EXCLUDED_DIRECTORIES = {'.git', '.vercel', 'node_modules', 'scripts', 'tests', '__pycache__'}


def preview_version():
    """Hash path, size and nanosecond modification time for served content."""
    digest = sha256()
    pending = [ROOT]
    while pending:
        directory = pending.pop()
        for item in sorted(directory.iterdir()):
            if item.name.startswith('.') or item.name in EXCLUDED_DIRECTORIES:
                continue
            if item.is_symlink():
                continue
            if item.is_dir():
                pending.append(item)
            elif item.suffix.lower() in WATCHED_SUFFIXES:
                try:
                    info = item.stat()
                except FileNotFoundError:
                    continue
                digest.update(f'{item.relative_to(ROOT)}:{info.st_size}:{info.st_mtime_ns}'.encode())
    return digest.hexdigest()[:20]


def live_reload_script(version):
    return '''<script data-local-preview>
    (() => {
      const loadedVersion = VERSION;
      async function checkForEdits() {
        try {
          const response = await fetch('/__preview_version__', { cache: 'no-store' });
          if (response.ok && (await response.json()).version !== loadedVersion) {
            location.reload();
            return;
          }
        } catch (error) { /* Retry when the local preview server returns. */ }
        setTimeout(checkForEdits, 1000);
      }
      setTimeout(checkForEdits, 1000);
    })();
    </script>'''.replace('VERSION', json.dumps(version))


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def bytes_response(self, content, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        return BytesIO(content)

    def send_head(self):
        request_path = unquote(urlsplit(self.path).path)
        if request_path == '/__preview_version__':
            body = json.dumps({'version': preview_version()}).encode('utf-8')
            return self.bytes_response(body, 'application/json; charset=utf-8')

        # Keep local project settings and credentials outside the preview.
        if any(part.startswith('.') for part in request_path.split('/') if part):
            self.send_error(404)
            return None

        direct_preview = request_path.rstrip('/') == '/preview'
        path = ROOT / 'landing.html' if direct_preview else Path(self.translate_path(self.path))
        if path.is_dir() and request_path.endswith('/'):
            path = path / 'index.html'

        if path.is_file() and path.suffix.lower() == '.html':
            # Capture the version before reading so a concurrent edit reloads again.
            version = preview_version()
            content = path.read_text(encoding='utf-8')
            if direct_preview:
                access = "<script>try{sessionStorage.setItem('allowLandingAccess','1');}catch(error){}</script>"
                content = content.replace('<head>', '<head>' + access, 1)
            content = content.replace('</body>', live_reload_script(version) + '</body>', 1)
            return self.bytes_response(content.encode('utf-8'), 'text/html; charset=utf-8')

        # Force complete current asset responses instead of a cached 304 response.
        for header in ('If-Modified-Since', 'If-None-Match'):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def log_message(self, fmt, *args):
        if '/__preview_version__' not in str(args[0] if args else ''):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(PreviewHandler, directory=str(ROOT)))
    print(f'Preview: http://127.0.0.1:{args.port}/preview/', flush=True)
    print(f'Entrance: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
