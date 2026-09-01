import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        self.send_header('Origin-Agent-Cluster','?1')
        super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1',8899), H).serve_forever()
