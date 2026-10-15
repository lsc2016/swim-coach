#!/usr/bin/env python3
"""수영 코치 로컬 서버.

- app/ 의 화면 파일을 보여 주고
- data/ 아래 .md 파일을 읽고 쓰는 아주 작은 API를 제공한다.
- 맥북은 http://localhost:8080, 휴대폰은 https://<맥이름>.local:8443 (오프라인 저장용 HTTPS)
"""
import json
import os
import ssl
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, "app")
DATA = os.path.join(ROOT, "data")
CERTS = os.path.join(ROOT, "certs")
HTTP_PORT = int(os.environ.get("HTTP_PORT", 8080))
HTTPS_PORT = int(os.environ.get("HTTPS_PORT", 8443))


def read_all_md():
    files = {}
    for base, _, names in os.walk(DATA):
        for name in sorted(names):
            if not name.endswith(".md"):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, DATA).replace(os.sep, "/")
            with open(full, encoding="utf-8") as f:
                files[rel] = f.read()
    return files


def safe_data_path(rel):
    if not rel or not rel.endswith(".md"):
        return None
    full = os.path.normpath(os.path.join(DATA, rel))
    if not full.startswith(DATA + os.sep):
        return None
    return full


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP, **kwargs)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/files":
            return self.send_json({"files": read_all_md()})
        if url.path == "/ca.crt":
            path = os.path.join(CERTS, "ca.crt")
            if not os.path.exists(path):
                return self.send_error(404)
            with open(path, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/x-x509-ca-cert")
            self.send_header("Content-Disposition", 'attachment; filename="swim-coach-ca.crt"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_PUT(self):
        url = urlparse(self.path)
        if url.path != "/api/file":
            return self.send_error(404)
        rel = parse_qs(url.query).get("path", [""])[0]
        full = safe_data_path(rel)
        if not full:
            return self.send_json({"error": "bad path"}, 400)
        length = int(self.headers.get("Content-Length", 0))
        text = self.rfile.read(length).decode("utf-8")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        tmp = full + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, full)
        return self.send_json({"ok": True, "path": rel})


Handler.extensions_map.update({
    ".webmanifest": "application/manifest+json",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
})


def main():
    servers = [ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), Handler)]
    crt, key = os.path.join(CERTS, "server.crt"), os.path.join(CERTS, "server.key")
    if os.path.exists(crt) and os.path.exists(key):
        https = ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), Handler)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(crt, key)
        https.socket = ctx.wrap_socket(https.socket, server_side=True)
        servers.append(https)
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")


if __name__ == "__main__":
    main()
