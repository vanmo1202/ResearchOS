"""Behavioral tests use disposable repositories; never commit in the source checkout."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
CANONICAL = '/home/vanmo/projects/ResearchOS'
REMOTE = 'https://github.com/vanmo1202/ResearchOS.git'


class AutomationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='researchos-automation-')
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / 'repo'
        self.repo.mkdir()
        self.env = {**os.environ, 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'}
        self.git('init', '-b', 'automation-ci-cd')
        self.git('config', 'user.name', 'Automation Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('remote', 'add', 'origin', REMOTE)
        self.write('docs/example.md', 'initial\n')
        self.git('add', 'docs/example.md')
        self.git('commit', '-m', 'fixture')
        dev = self.repo / 'scripts/dev'
        dev.mkdir(parents=True)
        for name in ('daily-commit.sh', 'safe-push.sh', 'git-guard.sh', 'commit-policy.py'):
            source = SOURCE / name
            if source.exists():
                # Only the fixture copy has a different fixed repository path.
                (dev / name).write_text(source.read_text().replace(CANONICAL, str(self.repo)))
        self.git('add', 'scripts/dev')
        self.git('commit', '--amend', '--no-edit')
        self.script = dev / 'daily-commit.sh'

    def git(self, *args, ok=True):
        result = subprocess.run(['git', *args], cwd=self.repo, env=self.env,
                                text=True, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def write(self, path, text):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def run_daily(self, *args, success=True, cwd=None):
        result = subprocess.run(['bash', str(self.script), *args], cwd=cwd or self.repo,
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_no_changes_and_unknown_files(self):
        self.write('unknown.txt', 'not allowed\n')
        self.assertIn('NO CHANGES', self.run_daily())
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '1')
        self.assertEqual(self.git('diff', '--cached'), '')

    def test_commit_once_and_preserve_nonallowed_files(self):
        self.write('docs/example.md', 'updated\n')
        self.write('.env', 'SECRET=ci-placeholder\n')
        self.write('backend/node_modules/pkg.js', 'untracked\n')
        self.run_daily()
        self.assertRegex(self.git('log', '-1', '--format=%s'), r'^chore\(daily\): ResearchOS update \d{4}-\d{2}-\d{2}$')
        self.assertEqual(self.git('show', '--format=', '--name-only', 'HEAD'), 'docs/example.md')
        self.assertEqual(self.git('diff', '--cached'), '')
        self.write('docs/example.md', 'another update\n')
        self.assertIn('ALREADY COMMITTED', self.run_daily())
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '2')

    def test_dry_run_does_not_stage_or_commit(self):
        self.write('docs/example.md', 'updated\n')
        self.assertIn('DRY RUN', self.run_daily('--dry-run'))
        self.assertEqual(self.git('diff', '--cached'), '')
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '1')

    def test_wrong_branch_remote_directory(self):
        self.git('switch', '-c', 'wrong')
        self.run_daily(success=False)
        self.git('switch', 'automation-ci-cd')
        self.git('remote', 'set-url', 'origin', 'https://example.invalid/other.git')
        self.run_daily(success=False)
        self.git('remote', 'set-url', 'origin', REMOTE)
        self.run_daily(success=False, cwd=Path(self.tmp.name))

    def test_existing_staging_preserved(self):
        self.write('docs/example.md', 'staged\n')
        self.git('add', 'docs/example.md')
        before = self.git('diff', '--cached')
        self.run_daily(success=False)
        self.assertEqual(self.git('diff', '--cached'), before)

    def test_secrets_rejected_without_staging(self):
        for content in ('TAVILY_API_KEY=' + 'tvly-' + 'a' * 32,
                        'pass' + 'word = "real-looking-value-123"',
                        '-----BEGIN ' + 'PRIVATE KEY-----'):
            with self.subTest(content=content[:12]):
                self.write('docs/example.md', content + '\n')
                self.run_daily(success=False)
                self.assertEqual(self.git('diff', '--cached'), '')
                self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '1')

    def test_symlink_and_binary_blocked(self):
        (self.repo / 'docs/link.md').symlink_to('/etc/passwd')
        self.run_daily(success=False)
        (self.repo / 'docs/link.md').unlink()
        (self.repo / 'docs/file.md').write_bytes(b'abc\x00binary')
        self.run_daily(success=False)
        self.assertEqual(self.git('diff', '--cached'), '')

    def test_lock_blocks_second_process(self):
        import fcntl
        with open(self.repo / '.git/researchos-automation.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertIn('LOCKED', self.run_daily(success=False))

    def test_git_operation_blocks_commit(self):
        (self.repo / '.git/MERGE_HEAD').write_text(self.git('rev-parse', 'HEAD'))
        self.run_daily(success=False)

    def test_deletion_committed(self):
        (self.repo / 'docs/example.md').unlink()
        self.run_daily()
        self.assertEqual(self.git('show', '--format=', '--name-status', 'HEAD'), 'D\tdocs/example.md')

    def test_sensitive_names_excluded_even_in_allowlist(self):
        for name in ('docs/secrets.md', 'docs/backup.sql', 'docs/password.txt',
                     'docs/cert.pem', 'docs/backup/data.json', 'docs/error.log'):
            self.write(name, 'sensitive\n')
        self.assertIn('NO CHANGES', self.run_daily())
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '1')

    def test_whitespace_failure_preserves_index(self):
        self.write('docs/example.md', 'invalid trailing whitespace   \n')
        self.run_daily(success=False)
        self.assertEqual(self.git('diff', '--cached'), '')
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '1')

    def test_manual_commit_does_not_limit_daily_commit(self):
        self.write('docs/example.md', 'manual\n')
        self.git('add', 'docs/example.md')
        self.git('commit', '-m', 'developer change')
        self.write('docs/example.md', 'daily\n')
        self.run_daily()
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '3')

    def test_history_enforces_cap_without_marker(self):
        self.write('docs/example.md', 'daily\n')
        self.run_daily()
        shutil.rmtree(self.repo / '.git/researchos-daily')
        self.write('docs/example.md', 'next change\n')
        self.assertIn('ALREADY COMMITTED', self.run_daily())
        self.assertEqual(self.git('rev-list', '--count', 'HEAD'), '2')

    def test_literal_unusual_path(self):
        self.write('docs/--odd [name]\nline.md', 'safe text\n')
        self.run_daily()
        names = subprocess.check_output(['git', 'show', '--format=', '--name-only', '-z', 'HEAD'],
                                        cwd=self.repo, env=self.env)
        self.assertIn(b'docs/--odd [name]\nline.md\x00', names)

    def test_manual_push_fast_forward_and_divergence(self):
        # The fixture-only guard uses a local bare origin; real scripts accept GitHub only.
        bare = Path(self.tmp.name) / 'remote.git'
        subprocess.run(['git', 'init', '--bare', str(bare)], check=True, capture_output=True)
        guard = self.repo / 'scripts/dev/git-guard.sh'
        guard.write_text(guard.read_text().replace(REMOTE, str(bare)))
        self.git('remote', 'set-url', 'origin', str(bare))
        push = self.repo / 'scripts/dev/safe-push.sh'
        result = subprocess.run(['bash', str(push)], cwd=self.repo, env=self.env, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.git('rev-parse', 'origin/automation-ci-cd'))
        clone = Path(self.tmp.name) / 'other'
        subprocess.run(['git', 'clone', '-b', 'automation-ci-cd', str(bare), str(clone)], check=True, capture_output=True)
        def other(*args):
            subprocess.run(['git', '-C', str(clone), *args], check=True, capture_output=True)
        other('config', 'user.name', 'Other')
        other('config', 'user.email', 'other@example.invalid')
        (clone / 'other.txt').write_text('upstream\n')
        other('add', 'other.txt')
        other('commit', '-m', 'upstream')
        other('push', 'origin', 'automation-ci-cd')
        self.write('docs/example.md', 'local divergence\n')
        self.git('add', 'docs/example.md')
        self.git('commit', '-m', 'local')
        result = subprocess.run(['bash', str(push)], cwd=self.repo, env=self.env, capture_output=True)
        self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
