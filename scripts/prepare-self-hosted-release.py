#!/usr/bin/env python3
"""Render a fresh local packet from an already reviewed release binding; never deploy."""
import argparse
import ast
import base64
import gzip
import hashlib
import json
import pathlib
import re

BASE = pathlib.Path(__file__).resolve().parent / 'self-hosted'
ACTIONS = ('preflight', 'stage-release', 'backup-databases', 'activate-web', 'final-health', 'rollback-web')
REQUIRED_JOBS = {'Verify (Node 22)', 'Browser (Chromium)',
                 'Reviewed regressions (Chromium and PostgreSQL 16)'}
FIELDS = {'commit', 'previousCommit', 'previousWorkerRelease', 'runId', 'artifactId',
          'artifactSha256', 'artifactBytes', 'allRequiredJobsPassed', 'remoteRoot', 'jobs'}


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def validate(binding):
    require(isinstance(binding, dict) and set(binding) == FIELDS, 'BINDING_FIELDS')
    for key, pattern in [('commit', r'[a-f0-9]{40}'), ('previousCommit', r'[a-f0-9]{40}'),
                         ('artifactSha256', r'[a-f0-9]{64}'),
                         ('previousWorkerRelease', r'/srv/nova-worker/releases/[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*'),
                         ('remoteRoot', r'/root/ena-[a-z0-9][a-z0-9-]*/web')]:
        require(isinstance(binding[key], str) and re.fullmatch(pattern, binding[key]) is not None,
                'BINDING_' + key.upper())
    require(binding['commit'] != binding['previousCommit'], 'BINDING_SAME_RELEASE')
    for key in ('runId', 'artifactId', 'artifactBytes'):
        require(type(binding[key]) is int and binding[key] > 0, 'BINDING_' + key.upper())
    require(binding['allRequiredJobsPassed'] is True, 'CI_ADMISSION_REQUIRED')
    jobs = binding['jobs']
    require(isinstance(jobs, list) and len(jobs) == len(REQUIRED_JOBS), 'CI_JOB_SET')
    require(all(isinstance(job, dict) and set(job) == {'name', 'status', 'conclusion'}
                and job['status'] == 'completed' and job['conclusion'] == 'success'
                and isinstance(job['name'], str) for job in jobs), 'CI_JOB_NOT_SUCCESSFUL')
    require({job['name'] for job in jobs} == REQUIRED_JOBS, 'CI_JOB_SET')


def wrapper(name, source):
    ast.parse(source, feature_version=(3, 6))
    payload = base64.b64encode(gzip.compress(source.encode(), compresslevel=9, mtime=0)).decode()
    digest = hashlib.sha256(source.encode()).hexdigest()
    text = ("#!/bin/bash\nset -eu\numask 077\npython3 - <<'PYCODE'\n"
            "import base64,gzip,hashlib,os\nsource=gzip.decompress(base64.b64decode(" + repr(payload) + "))\n"
            "assert hashlib.sha256(source).hexdigest()==" + repr(digest) + "\n"
            "assert os.getuid()==0,'ROOT_REQUIRED'\nexec(compile(source," + repr(name) + ",'exec'))\nPYCODE\n")
    require(len(text.encode()) < 18432, 'CLOUD_ASSISTANT_LIMIT')
    return text


def render(binding, output):
    validate(binding)
    output = pathlib.Path(output)
    require(not output.exists() and not output.is_symlink(), 'OUTPUT_EXISTS')
    source = (BASE / 'templates/web-operator.py').read_text().replace('BINDING_LITERAL', repr(binding))
    files = {'binding.json': (json.dumps(binding, indent=2) + '\n').encode(),
             '30-runtime-cache.conf': (BASE / '30-runtime-cache.conf').read_bytes()}
    for action in ACTIONS:
        body = source + ("\ntry:\n    main(" + repr(action) + ")\nexcept Exception as error:\n"
            "    print(json.dumps({'passed':False,'safeCode':str(error) if type(error) is RuntimeError else 'WEB_OPERATOR_FAILED',"
            "'errorType':type(error).__name__}),flush=True)\n    raise SystemExit(1)\n")
        files[action + '.py'] = body.encode()
        files[action + '.sh'] = wrapper(action + '.py', body).encode()
    manifest = {'preparedOnly': True, 'productionChanged': False, 'ciAdmissionRevalidated': False,
                'commit': binding['commit'], 'previousCommit': binding['previousCommit'],
                'commands': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                             for name, data in files.items()}}
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, data in files.items():
        path = output / name
        with path.open('xb') as stream:
            stream.write(data)
        path.chmod(0o600)
    path = output / 'packet-manifest.json'
    path.write_text(json.dumps(manifest, indent=2) + '\n')
    path.chmod(0o600)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binding', type=pathlib.Path, required=True,
                        help='Non-secret binding whose exact CI/artifact identity has been separately reviewed')
    parser.add_argument('--output', type=pathlib.Path, required=True, help='New local directory; never overwrite old evidence')
    args = parser.parse_args()
    print(json.dumps(render(json.loads(args.binding.read_text()), args.output), indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'prepared': False, 'safeCode': str(error) if type(error) is RuntimeError
                          else 'PREPARATION_FAILED', 'errorType': type(error).__name__}))
        raise SystemExit(1)
