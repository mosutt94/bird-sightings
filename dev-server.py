#!/usr/bin/env python3
"""Local dev server for BirdApp.

Serves static files from the current directory and proxies
`/.netlify/functions/ebird` to the real eBird API so local dev matches
the deployed Netlify environment. Reads EBIRD_API_KEY from a local
`.env.local` file (gitignored).

Run:  python3 dev-server.py
"""
import http.server
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

PORT = 8000
EBIRD_BASE = 'https://api.ebird.org/v2'


def load_env(path='.env.local'):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


ENV = load_env()


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/.netlify/functions/ebird'):
            self.proxy_ebird()
            return
        super().do_GET()

    def proxy_ebird(self):
        api_key = ENV.get('EBIRD_API_KEY') or os.environ.get('EBIRD_API_KEY')
        if not api_key:
            self.send_error(500, 'EBIRD_API_KEY not set in .env.local')
            return

        parsed = urllib.parse.urlparse(self.path)
        params = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
        path = params.pop('path', None)
        if not path:
            self.send_error(400, 'missing path param')
            return

        qs = urllib.parse.urlencode(params)
        url = f'{EBIRD_BASE}/{path}' + (f'?{qs}' if qs else '')
        req = urllib.request.Request(url, headers={'X-eBirdApiToken': api_key})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
                self.send_response(r.status)
                self.send_header('Content-Type', r.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', e.headers.get('Content-Type', 'application/json'))
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_error(502, f'Proxy error: {e}')


def main():
    if not (ENV.get('EBIRD_API_KEY') or os.environ.get('EBIRD_API_KEY')):
        print('Warning: EBIRD_API_KEY not found in .env.local — eBird requests will 500.',
              file=sys.stderr)
    server = http.server.HTTPServer(('', PORT), Handler)
    print(f'BirdApp dev server: http://localhost:{PORT}')
    print('Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')


if __name__ == '__main__':
    main()
