#!/usr/bin/env python3
"""Validate copied Compose files using only temporary placeholder environments."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DIGEST = '@sha256:' + 'a' * 64


def compose(directory, env, files):
    command = ['docker', 'compose', '--project-directory', str(directory),
               '--env-file', str(directory / '.env'), '-p', 'researchos-ci']
    for file in files:
        command.extend(['-f', str(directory / file)])
    subprocess.run([*command, 'config', '--quiet'], env=env, check=True)
    return json.loads(subprocess.check_output([*command, 'config', '--format', 'json'], env=env))


with tempfile.TemporaryDirectory(prefix='researchos-compose-ci-') as temporary:
    directory = Path(temporary)
    for name in ('docker-compose.yml', 'docker-compose.validation.yml',
                 'compose.production.yml', 'compose.staging.yml'):
        shutil.copyfile(ROOT / name, directory / name)
    (directory / 'backend').mkdir()
    (directory / 'frontend').mkdir()
    (directory / 'backend/.env').write_text('')
    (directory / '.env').write_text('')
    secrets = directory / 'deploy/secrets'
    secrets.mkdir(parents=True)
    (directory / 'deploy/tls').mkdir()
    for name in ('postgres_password', 'internal_api_key', 'gemini_api_key',
                 'tavily_api_key', 'n8n_encryption_key'):
        (secrets / name).write_text('ci-placeholder-not-for-production')
    # Do not inherit the real checkout's .env, provider keys or Compose variables.
    env = {name: os.environ[name] for name in ('PATH', 'HOME') if name in os.environ}
    env.update({
        'INTERNAL_API_KEY': 'ci-placeholder-not-for-production',
        'FRONTEND_ORIGIN': 'https://ci.example.invalid',
        'INTERNAL_RESEARCH_USER_ID': 'ci-service-user',
        'TLS_DIRECTORY': str(directory / 'deploy/tls'),
        'SECRETS_DIRECTORY': str(secrets),
        **{name + '_IMAGE': image + DIGEST for name, image in (
            ('BACKEND', 'backend'), ('FRONTEND', 'frontend'), ('EDGE', 'nginx'),
            ('POSTGRES', 'postgres'), ('N8N', 'n8n'))},
    })
    for files in (['docker-compose.yml'], ['docker-compose.yml', 'docker-compose.validation.yml']):
        config = compose(directory, env, files)
        backend, worker = (config['services'][key] for key in ('backend', 'worker'))
        if worker['image'] != backend['image'] or worker['build'] != backend['build']:
            raise SystemExit('Worker must use the same backend image and build context')
        if Path(backend['build']['context']).name != 'backend':
            raise SystemExit('Unexpected backend build context')
        if Path(config['services']['frontend']['build']['context']).name != 'frontend':
            raise SystemExit('Unexpected frontend build context')
    hardened = compose(directory, env, ['compose.production.yml', 'compose.staging.yml'])
    if hardened['services']['worker']['image'] != hardened['services']['backend']['image']:
        raise SystemExit('Hardened worker must use backend image')
    subprocess.run(['python3', str(ROOT / 'scripts/ops/preflight.py')],
                   input=json.dumps(hardened).encode(), check=True, env=env)
print('PASS: local, validation and hardened Compose; worker uses backend image; placeholders only')
