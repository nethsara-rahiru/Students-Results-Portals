#!/usr/bin/env python3
"""Create a static-only Pages artifact. No credentials, database dumps or test server."""
import base64
import json
import os
import re
from pathlib import Path
import shutil
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]

def validate(url, key):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('SUPABASE_URL must be an HTTPS project URL without credentials')
    if key.startswith('sb_publishable_'):
        return
    try:
        payload = key.split('.')[1]
        role = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['role']
        if role == 'anon':
            return
    except (IndexError, KeyError, ValueError):
        pass
    raise ValueError('Only a publishable or legacy anon key can be deployed. Never use secret/service-role keys.')

def main():
    destination = ROOT / 'dist'
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(ROOT / 'public', destination)
    url = os.environ.get('SUPABASE_URL', '').strip()
    key = os.environ.get('SUPABASE_PUBLISHABLE_KEY', '').strip()
    if url or key:
        validate(url, key)
        config = {'supabaseUrl': url, 'supabaseKey': key, 'turnstileSiteKey': os.environ.get('TURNSTILE_SITE_KEY', '').strip()}
        (destination / 'config.js').write_text('export const config = ' + json.dumps(config) + ';\n')
    # Validate even checked-in defaults before uploading any public configuration.
    source = (destination / 'config.js').read_text()
    if not (url or key):
        values = {}
        for field in ('supabaseUrl', 'supabaseKey'):
            match = re.search(r'\b' + field + r'''\s*:\s*(["'])(.*?)\1''', source)
            if not match:
                raise ValueError('Cannot read public config.js; use the documented literal settings format')
            values[field] = match.group(2)
        validate(values['supabaseUrl'], values['supabaseKey'])
    for path in destination.rglob('*'):
        if path.is_file() and (path.name.startswith('.env') or 'credentials' in path.name.lower() or path.suffix in ('.pem', '.sql', '.gz')):
            raise ValueError('Refusing a potentially private file in public/: ' + path.name)
    (destination / '.nojekyll').touch()
    print('Prepared dist/ with static assets only. No Node runtime required.')

if __name__ == '__main__':
    main()
