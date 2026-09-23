"""本機開發用伺服器：提供靜態檔案，並接受 POST /__save?path=相對路徑 把瀏覽器產生的圖片存進專案。

用法：python tools/dev_server.py [port]   （預設 8765）
只綁定 127.0.0.1，存檔路徑限制在專案資料夾內。
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/__save":
            self.send_error(404)
            return
        rel = parse_qs(url.query).get("path", [""])[0]
        target = (ROOT / rel).resolve()
        if not rel or ROOT not in target.parents:
            self.send_error(400, "path 必須在專案資料夾內")
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"http://localhost:{port}/")
    server.serve_forever()
