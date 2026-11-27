#!/usr/bin/env python3
"""Conservative daily-commit allowlist and staged-blob scanner. Never prints content."""
import os
from pathlib import PurePosixPath
import re
import subprocess
import sys

ROOTS = ('.github/workflows/', 'backend/src/', 'backend/test/', 'frontend/src/',
         'frontend/tests/', 'docs/', 'scripts/', 'n8n/workflows/')
EXACT = {'backend/package.json', 'backend/package-lock.json', 'backend/Dockerfile',
         'backend/.dockerignore', 'frontend/package.json', 'frontend/package-lock.json',
         'frontend/Dockerfile', 'frontend/.dockerignore', 'frontend/index.html',
         'frontend/nginx.conf', '.gitignore', 'README.md',
         'docker-compose.yml', 'docker-compose.validation.yml',
         'compose.production.yml', 'compose.staging.yml',
         'deploy/Dockerfile.backend', 'deploy/Dockerfile.frontend'}
SUFFIXES = {'.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.css', '.html', '.md',
            '.json', '.yml', '.yaml', '.sh', '.py', '.service', '.timer'}
DENY = re.compile(r'(^|[/_.-])(env|secrets?|credentials?|api[_-]?keys?|passwords?|'
                  r'certificates?|certs?|backups?|dumps?|logs?|node_modules|data|'
                  r'test-results|playwright-report|dist|coverage)([/_.-]|$)', re.I)
# Deliberately conservative: false positives require a developer's manual review.
PATTERNS = [
    re.compile(r'-----BEGIN (?:[A-Z ]*PRIVATE KEY|CERTIFICATE)-----'),
    re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|'
               r'AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|tvly-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})'),
    re.compile(r'(?i)\b(?:postgres(?:ql)?|mysql|https?)://[^\s/:]+:[^\s/@]+@'),
]
ASSIGNMENT = re.compile(
    r'''(?ix)["']?\b(?:[a-z0-9_]*(?:api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token))\b["']?\s*[:=]\s*["']?([^\s"',;}{]+)''')
PLACEHOLDER = re.compile(r'(?i)^(?:\$|<|\{|process\.|os\.|self\.|config\.|env\.|'
                         r'ci[-_]|test[-_]|fake[-_]|mock[-_]|placeholder|example|'
                         r'your[-_]|change[-_]?me|none$|null$|true$|false$)')


def git(*args):
    return subprocess.check_output(['git', *args])


def allowed(name):
    path = PurePosixPath(name)
    if DENY.search(name) or any(p.startswith('.') for p in path.parts if p != '.github'):
        return name == '.gitignore' or name in {'backend/.dockerignore', 'frontend/.dockerignore'}
    return name in EXACT or (
        name.startswith(ROOTS) and path.suffix in SUFFIXES
    ) or (name.startswith('frontend/') and len(path.parts) == 2 and name.endswith('.config.js'))


def scan():
    for raw in git('diff', '--cached', '--name-only', '-z', '--no-renames').split(b'\0'):
        if not raw:
            continue
        name = os.fsdecode(raw)
        if not allowed(name):
            raise ValueError('staged path outside allowlist')
        entry = git('ls-files', '--stage', '-z', '--', name)
        if not entry:  # deletion
            continue
        mode = entry.split(b' ', 1)[0]
        if mode not in (b'100644', b'100755'):
            raise ValueError('symlink or non-regular staged file')
        blob = git('show', ':' + name)
        if b'\0' in blob or len(blob) > 2_000_000:
            raise ValueError('binary or oversized staged file')
        text = blob.decode('utf-8')
        if any(p.search(text) for p in PATTERNS):
            raise ValueError('possible secret in staged content')
        for match in ASSIGNMENT.finditer(text):
            value = match.group(1)
            if value and not PLACEHOLDER.search(value):
                raise ValueError('possible credential assignment in staged content')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['paths']:
            names = set(git('diff', '--name-only', '-z', '--no-renames').split(b'\0'))
            names.update(git('ls-files', '--others', '--exclude-standard', '-z').split(b'\0'))
            for name in sorted(names):
                if name and allowed(os.fsdecode(name)):
                    sys.stdout.buffer.write(name + b'\0')
        elif sys.argv[1:] == ['scan']:
            scan()
        else:
            raise ValueError('usage: commit-policy.py paths|scan')
    except (ValueError, UnicodeError, subprocess.CalledProcessError) as error:
        print(f'BLOCKED: {error.__class__.__name__}; review paths/content manually (content withheld)', file=sys.stderr)
        sys.exit(1)
