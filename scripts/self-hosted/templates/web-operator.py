# Reusable operator promoted from the 2026-11-06 release packet.
# Render locally with scripts/prepare-self-hosted-release.py; do not run this template.
import datetime, hashlib, json, os, pathlib, pwd, re, shlex, shutil, socket, stat, subprocess, tarfile, tempfile, time, urllib.error, urllib.parse, urllib.request, zipfile

BINDING = BINDING_LITERAL
ROOT = pathlib.Path(BINDING['remoteRoot'])
COMMIT = BINDING['commit']
PREVIOUS = BINDING['previousCommit']
CURRENT = pathlib.Path('/srv/open-ena/current')
RELEASES = pathlib.Path('/srv/open-ena/releases')
RELEASE = RELEASES / COMMIT
PROC = pathlib.Path('/proc')
ROOT_UID = 0
CACHE_DROPIN = pathlib.Path('/etc/systemd/system/open-ena.service.d/30-runtime-cache.conf')
CACHE_DROPIN_SHA256 = '49e29921c3ce1ea8bf018daf598fbb35a5e17f5cdb47af82d93873e8ea8de1b2'
ENV = pathlib.Path('/etc/open-ena/runtime.env')
NGINX = pathlib.Path('/www/server/panel/vhost/nginx/open-ena.conf')
NGINX_BIN = '/www/server/nginx/sbin/nginx'
SERVICE = 'open-ena.service'
WORKER_SERVICE = 'ena-nova-worker.service'
WORKER_CURRENT = pathlib.Path('/srv/nova-worker/current')
WORKER_ENV = pathlib.Path('/etc/nova-worker/runtime.env')
SANDBOX_ENV = pathlib.Path('/etc/nova-worker/sandbox.env')
ARTIFACT_ROOT = ROOT / 'artifacts' / str(BINDING['artifactId'])
ORIGINS = ['https://www.open-ena.com', 'https://www.ena.hk']
# Next 16.4.3 writes only runtime data here; compiled routes remain root-owned.
RUNTIME_CACHE_DIRS = ('.next/cache/images', '.next/cache/fetch-cache', '.next/server/route-cache')

def require(ok, code):
    if not ok: raise RuntimeError(code)

def sha(data): return hashlib.sha256(data).hexdigest()

def file_sha(path):
    value = hashlib.sha256()
    with pathlib.Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(1048576), b''): value.update(part)
    return value.hexdigest()

def run(args, timeout=90):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    require(result.returncode == 0, 'COMMAND_FAILED_' + pathlib.Path(args[0]).name)
    return result.stdout.decode().strip()

def prop(unit, name): return run(['systemctl', 'show', unit, '-p', name, '--value'])

def private_root():
    require(os.getuid() == 0, 'ROOT_REQUIRED')
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = ROOT.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o077, 'PRIVATE_OPERATOR_ROOT_REQUIRED')

def write_new(path, content):
    fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(content); stream.flush(); os.fsync(stream.fileno())

def receipt(name, value):
    value['checkedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    write_new(ROOT / name, (json.dumps(value, indent=2) + '\n').encode())
    print(json.dumps(value), flush=True)
    return value

def load(name): return json.loads((ROOT / name).read_text())

def environment():
    result = {}
    for line in ENV.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith(('#', ';')): continue
        key, separator, value = line.partition('=')
        require(separator and re.match(r'^[A-Z][A-Z0-9_]*$', key), 'ENV_FORMAT')
        values = shlex.split(value, comments=False)
        require(key not in result and len(values) <= 1, 'ENV_DUPLICATE_OR_FORMAT')
        result[key] = values[0] if values else ''
    return result

def assert_process_environment(env):
    pid = prop(SERVICE, 'MainPID')
    require(pid.isdigit() and int(pid) > 0, 'WEB_PID_INVALID')
    running = dict(part.split(b'=', 1) for part in (PROC / pid / 'environ').read_bytes().split(b'\0') if b'=' in part)
    require(all(running.get(key.encode()) == value.encode() for key, value in env.items()), 'WEB_PROCESS_ENV_MISMATCH')
    return pid

def cache_target(target):
    """Check both deploy and rollback destinations before touching current or proxy."""
    target = pathlib.Path(target)
    require(target.parent == RELEASES and re.fullmatch(r'[a-f0-9]{40}', target.name) is not None, 'CACHE_TARGET_RELEASE')
    app = pwd.getpwnam('openena')
    cache = target / '.next/cache'
    for path in (target, target / '.next', cache, cache / 'images', cache / 'fetch-cache'):
        try: info = path.lstat()
        except OSError: raise RuntimeError('CACHE_TARGET_MISSING')
        require(stat.S_ISDIR(info.st_mode) and path.resolve() == path, 'CACHE_TARGET_SYMLINK_OR_TYPE')
        if path in (cache / 'images', cache / 'fetch-cache'):
            require(info.st_uid == app.pw_uid and info.st_gid == app.pw_gid and stat.S_IMODE(info.st_mode) == 0o700, 'CACHE_TARGET_OWNER_OR_MODE')
        else:
            require(info.st_uid == ROOT_UID and not info.st_mode & 0o022 and info.st_mode & 0o005 == 0o005, 'CACHE_TARGET_PARENT_CUSTODY')
    return cache


def runtime_cache_policy(check_process=True):
    # Hash equality to an old deployment is insufficient: inspect the effective
    # policy as well as the exact, root-owned drop-in and the live mount namespace.
    for path, directory in ((CACHE_DROPIN.parent, True), (CACHE_DROPIN, False)):
        try: info = path.lstat()
        except OSError: raise RuntimeError('CACHE_DROPIN_MISSING')
        require((stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode))
            and path.resolve() == path and info.st_uid == ROOT_UID and not info.st_mode & 0o022, 'CACHE_DROPIN_CUSTODY')
    require(file_sha(CACHE_DROPIN) == CACHE_DROPIN_SHA256, 'CACHE_DROPIN_CONTENT')
    require(prop(SERVICE, 'DropInPaths') == str(CACHE_DROPIN), 'CACHE_DROPIN_SET')
    require(prop(SERVICE, 'NeedDaemonReload') == 'no', 'CACHE_DAEMON_RELOAD_PENDING')
    logical = str(CURRENT / '.next/cache')
    require(prop(SERVICE, 'ReadWritePaths') == logical, 'CACHE_WRITABLE_PATH')
    require(prop(SERVICE, 'ProtectSystem') == 'strict', 'CACHE_PROTECT_SYSTEM')
    # Older systemctl prints this structured property as [unprintable]. D-Bus
    # retains the exact exit-code and signal arrays; no text-output fallback.
    exit_status = run(['busctl', 'get-property', 'org.freedesktop.systemd1',
        '/org/freedesktop/systemd1/unit/open_2dena_2eservice',
        'org.freedesktop.systemd1.Service', 'SuccessExitStatus'])
    require(exit_status.split() == ['(aiai)', '1', '143', '0'], 'CACHE_SUCCESS_EXIT_STATUS')
    cache = cache_target(CURRENT.resolve())
    result = {'dropInSha256': CACHE_DROPIN_SHA256, 'readWritePaths': logical,
        'protectSystem': 'strict', 'successExitStatus': [143], 'cacheDirectory': str(cache),
        'processMountVerified': False}
    if check_process:
        pid = prop(SERVICE, 'MainPID')
        require(pid.isdigit() and int(pid) > 0, 'CACHE_PROCESS_PID')
        require((PROC / pid / 'cwd').resolve() == CURRENT.resolve(), 'CACHE_PROCESS_DIRECTORY')
        def unescape(value):
            return re.sub(r'\\([0-7]{3})', lambda match: chr(int(match.group(1), 8)), value)
        mounts = []
        for line in (PROC / pid / 'mountinfo').read_text().splitlines():
            fields = line.split(' - ', 1)[0].split()
            require(len(fields) >= 6, 'CACHE_PROCESS_MOUNT_FORMAT')
            root, point = unescape(fields[3]), unescape(fields[4])
            if str(cache) == point or str(cache).startswith(point.rstrip('/') + '/'):
                mounts.append((point, root, fields[5].split(',')))
        require(bool(mounts), 'CACHE_PROCESS_MOUNT_MISSING')
        point, root, options = max(mounts, key=lambda item: len(item[0]))
        require(point == root == str(cache) and 'rw' in options and 'ro' not in options, 'CACHE_PROCESS_MOUNT_BINDING')
        result['processMountVerified'] = True
    return result


def snapshot(require_web_health=True):
    require(CURRENT.is_symlink(), 'CURRENT_NOT_SYMLINK')
    require(prop(SERVICE, 'WorkingDirectory') == str(CURRENT) and prop(SERVICE, 'User') == 'openena', 'WEB_SERVICE_BINDING')
    require(prop(SERVICE, 'EnvironmentFiles') == str(ENV) + ' (ignore_errors=no)', 'WEB_ENV_BINDING')
    web_state = prop(SERVICE, 'ActiveState')
    if require_web_health: require(web_state == 'active', 'WEB_INACTIVE')
    else: require(web_state in ('active', 'inactive', 'failed'), 'WEB_STATE_TRANSITION_IN_PROGRESS')
    require(run(['systemctl', 'is-active', 'open-ena-postgresql.service']) == 'active', 'DATABASE_INACTIVE')
    require(run(['systemctl', 'is-active', 'open-ena-plugin-lab-notifications.timer']) == 'active', 'PLUGIN_TIMER_INACTIVE')
    require(run(['/opt/node/bin/node', '--version']).startswith('v22.'), 'NODE_MAJOR')
    env = environment()
    require(env.get('ENA_NOVA_ENABLED') == 'true' and env.get('ENA_NOVA_WORKER_ENABLED') == 'false', 'ENABLED_WEB_NOVA_FLAGS_CHANGED')
    require(env.get('OPEN_ENA_CLOUD_PROJECTS_ENABLED') == 'true' and env.get('OPEN_ENA_REGISTRATION_ENABLED') == 'true', 'ACCOUNT_FLAGS_CHANGED')
    require(all(env.get(name) for name in ['OPEN_ENA_PROJECT_ENCRYPTION_KEY', 'ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1', 'ENA_PLUGIN_LAB_SECRET']), 'RUNTIME_KEYS_MISSING')
    if web_state == 'active':
        pid = assert_process_environment(env)
        require((PROC / pid / 'cwd').resolve() == CURRENT.resolve(), 'WEB_PROCESS_RELEASE_MISMATCH')
    else:
        pid = prop(SERVICE, 'MainPID')
        require(pid == '0', 'INACTIVE_WEB_PROCESS_REMAINS')
    require(WORKER_CURRENT.is_symlink(), 'WORKER_CURRENT_NOT_SYMLINK')
    cache_policy = runtime_cache_policy(check_process=require_web_health and web_state == 'active')
    return {'runtimeCachePolicy': cache_policy, 'currentRelease': CURRENT.resolve().name, 'webPid': pid, 'webActive': web_state == 'active',
        'environmentSha256': file_sha(ENV), 'nginxSha256': file_sha(NGINX),
        'webUnitSha256': sha(run(['systemctl', 'cat', SERVICE]).encode()),
        'workerRelease': str(WORKER_CURRENT.resolve()), 'workerEnvironmentSha256': file_sha(WORKER_ENV),
        'sandboxEnvironmentSha256': file_sha(SANDBOX_ENV),
        'workerUnitSha256': sha(run(['systemctl', 'cat', WORKER_SERVICE]).encode()),
        'workerActive': prop(WORKER_SERVICE, 'ActiveState') == 'active',
        'workerPid': prop(WORKER_SERVICE, 'MainPID'), 'webRestartCount': prop(SERVICE, 'NRestarts')}

def guard(prior, current, fields):
    require(all(prior[name] == current[name] for name in fields), 'CONCURRENT_RUNTIME_CHANGE')

IMMUTABLE = ['environmentSha256', 'webUnitSha256', 'workerRelease', 'workerEnvironmentSha256', 'sandboxEnvironmentSha256', 'workerUnitSha256', 'workerPid', 'workerActive']

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

def request(origin, path, method='GET', accept=None):
    headers = {'Host': urllib.parse.urlsplit(origin).netloc if not origin.startswith('http://127.0.0.1') else 'www.ena.hk', 'Origin': ORIGINS[0]}
    if accept: headers['Accept'] = accept
    try: return HTTP.open(urllib.request.Request(origin + path, headers=headers, method=method), timeout=20)
    except urllib.error.HTTPError as response: return response

def image_cache_health(origin):
    # This is deliberately exercised after the real systemd restart, not just
    # in the unsandboxed canary. Loopback responses need no Nginx release header.
    path = '/_next/image?url=%2Fsocial%2Fopen-ena-logo.png&w=640&q=75'
    baseline = None
    for attempt in range(5):
        with request(origin, path, accept='image/webp') as response:
            body = response.read(2000001)
            require(response.code == 200 and response.headers.get('Content-Type') == 'image/webp'
                and 0 < len(body) <= 2000000, 'IMAGE_CACHE_RESPONSE')
            digest = sha(body)
            if baseline is None: baseline = digest
            require(digest == baseline, 'IMAGE_CACHE_BODY_CHANGED')
            state = response.headers.get('x-nextjs-cache')
            if attempt > 0 and state == 'HIT':
                return {'cache': state, 'requests': attempt + 1, 'bodySha256': digest, 'status': 200}
        if attempt < 4: time.sleep(0.25)
    raise RuntimeError('IMAGE_CACHE_NOT_HIT')


def ready(origin):
    for attempt in range(40):
        try:
            with request(origin, '/en/open-ena') as response:
                if response.code == 200: return
        except (urllib.error.URLError, TimeoutError, socket.timeout): pass
        time.sleep(1)
    raise RuntimeError('SERVICE_NOT_READY')

def wait_public_headers(expected):
    for origin in ORIGINS:
        for attempt in range(30):
            try:
                with request(origin, '/en/open-ena') as response:
                    if response.code == 200 and response.headers.get('X-ENA-Release') == expected: break
            except (urllib.error.URLError, TimeoutError, socket.timeout): pass
            time.sleep(1)
        else: raise RuntimeError('PUBLIC_RELEASE_HEADER_NOT_READY')

def database_counts():
    commands = {
        'openena': "SELECT json_build_object('users',(SELECT count(*) FROM public.open_ena_users),'projects',(SELECT count(*) FROM public.open_ena_projects))",
        'ena_plugin_lab': "SELECT json_build_object('novaSessions',(SELECT count(*) FROM public.ena_nova_sessions),'novaRuns',(SELECT count(*) FROM public.ena_nova_runs),'novaReceipts',(SELECT count(*) FROM public.ena_nova_receipts),'queuedRuns',(SELECT count(*) FROM public.ena_nova_runs WHERE queue_state='queued'),'runningRuns',(SELECT count(*) FROM public.ena_nova_runs WHERE queue_state='running'),'waitingRuns',(SELECT count(*) FROM public.ena_nova_runs WHERE queue_state='waiting'))"
    }
    return {database: json.loads(run(['runuser', '-u', 'openenadb', '--', '/usr/pgsql-17/bin/psql', '-X', '-h', '/run/open-ena-postgresql', '-p', '5433', '--no-password', '-d', database, '--set', 'ON_ERROR_STOP=1', '-Atq', '--command', 'BEGIN READ ONLY; ' + query + '; COMMIT;'])) for database, query in commands.items()}

def public_health(origin, expected=None, baseline=None):
    check_hsts = expected == COMMIT or origin == 'http://127.0.0.1:3201'
    paths = ['/en', '/en/open-ena', '/en/open-ena/account', '/en/plugins/catalog', '/en/plugins', '/zh-hans/plugins', '/zh-hant/plugins']
    for path in paths:
        with request(origin, path) as response:
            body = response.read(8388609)
            require(response.code == 200 and len(body) <= 8388608, 'PUBLIC_PAGE_FAILED')
            if check_hsts: require(response.headers.get('Strict-Transport-Security') == 'max-age=86400', 'HSTS_POLICY_MISSING')
            if expected: require(response.headers.get('X-ENA-Release') == expected, 'PUBLIC_RELEASE_MISMATCH')
            if path.endswith('/plugins'):
                require(b'Nova Code' in body and b'nova-workbench' in body, 'NOVA_PAGE_MARKER')
                require('noindex' in response.headers.get('X-Robots-Tag', '') and 'no-store' in response.headers.get('Cache-Control', ''), 'NOVA_PRIVATE_HEADERS')
                require("frame-src 'self' blob:" in response.headers.get('Content-Security-Policy', ''), 'NOVA_IFRAME_POLICY')
    with request(origin, '/api/nova/models') as response:
        require(response.code == 200, 'NOVA_MODELS_STATUS')
        models = json.load(response)
        require(models.get('enabled') is True and models.get('runtimeConfigured') is True, 'NOVA_NOT_READY')
        require(len(models.get('models', [])) == 4 and all(item.get('available') is True for item in models['models']), 'NOVA_MODELS_UNAVAILABLE')
    with request(origin, '/api/nova/sessions') as response: require(response.code == 401, 'ANONYMOUS_NOVA_ACCESS')
    with request(origin, '/api/open-ena/projects') as response: require(response.code == 401, 'ANONYMOUS_PROJECT_ACCESS')
    with request(origin, '/api/nova/fonts/sans-roman') as response:
        font = {'status': response.code, 'sha256': sha(response.read(2000001))}
        require(font['status'] in (200, 404), 'FONT_ROUTE_STATUS')
    config = {'modelsSha256': sha(json.dumps(models, sort_keys=True).encode()), 'font': font}
    if baseline: require(config == baseline['configuration'], 'PUBLIC_CONFIGURATION_CHANGED')
    header_checks = []
    if check_hsts:
        for method in ['GET', 'HEAD']:
            for path in ['/', '/en/open-ena/account', '/api/open-ena/projects', '/report-release-missing-20261106']:
                with request(origin, path, method) as response:
                    require(response.headers.get('Strict-Transport-Security') == 'max-age=86400', 'HSTS_STATUS_POLICY_MISSING')
                    if path.startswith('/report-release-missing-'): require(response.code == 404, 'MISSING_ROUTE_STATUS')
                    if path == '/api/open-ena/projects': require(response.code in [401,403,405], 'ANONYMOUS_HEADER_PROBE_ACCESS')
                    header_checks.append({'path':path,'method':method,'status':response.code})
    return {'origin': origin, 'pages': paths, 'novaEnabled': True, 'fourModelsAvailable': True, 'anonymousAccessDenied': True, 'configuration': config, 'hstsVerified':check_hsts,'headerChecks':header_checks}

def preflight():
    current = snapshot()
    require(current['currentRelease'] == PREVIOUS, 'PREVIOUS_RELEASE_CHANGED')
    require(current['workerRelease'] == BINDING['previousWorkerRelease'] and current['workerActive'], 'PREVIOUS_WORKER_CHANGED')
    require(not RELEASE.exists() and not RELEASE.is_symlink(), 'TARGET_RELEASE_ALREADY_EXISTS')
    require(shutil.disk_usage(str(CURRENT.parent)).free > max(2147483648, 5 * BINDING['artifactBytes']), 'INSUFFICIENT_FREE_SPACE')
    with socket.socket() as check: require(check.connect_ex(('127.0.0.1', 3201)) != 0, 'CANARY_PORT_IN_USE')
    old_header = ('add_header X-ENA-Release ' + PREVIOUS + ' always;').encode()
    require(NGINX.read_bytes().count(old_header) == 1, 'NGINX_RELEASE_HEADER_BINDING')
    public = [public_health(origin, PREVIOUS) for origin in ORIGINS]
    require(public[0]['configuration'] == public[1]['configuration'], 'PUBLIC_DOMAINS_DIFFER')
    receipt('preflight-receipt.json', {'passed': True, 'commit': COMMIT, 'snapshot': current, 'public': public, 'databaseCounts': database_counts(), 'productionChanged': False, 'databaseMutation': False})

def verify_artifact():
    value = json.loads((ARTIFACT_ROOT / 'artifact-download-receipt.json').read_text())
    require(value['passed'] and value['artifactId'] == BINDING['artifactId'] and value['zipSha256'] == BINDING['artifactSha256'], 'ARTIFACT_RECEIPT_MISMATCH')
    require(value['identity']['commit'] == COMMIT and value['identity']['platform'] == 'linux' and value['identity']['arch'] == 'x64' and str(value['identity']['node']).lstrip('v').split('.')[0] == '22', 'ARTIFACT_PLATFORM_IDENTITY')
    require(value['smoke']['passed'] and value['smoke']['commit'] == COMMIT, 'ARTIFACT_SMOKE_IDENTITY')
    path = ARTIFACT_ROOT / 'artifact.zip'
    require(path.stat().st_size == BINDING['artifactBytes'] and file_sha(path) == BINDING['artifactSha256'], 'STAGED_ZIP_CHANGED')
    archive_root = ARTIFACT_ROOT / 'linux-release'
    archive_name = 'ena-linux-x64-' + COMMIT + '.tar.gz'
    with zipfile.ZipFile(str(path)) as archive:
        names = archive.namelist()
        require(len(names) == 3 and set(names) == {archive_name, 'SHA256SUMS', 'smoke.json'}, 'ZIP_MEMBERS_CHANGED')
        for name in names:
            digest = hashlib.sha256()
            with archive.open(name) as stream:
                for part in iter(lambda: stream.read(1048576), b''): digest.update(part)
            require(file_sha(archive_root / name) == digest.hexdigest(), 'STAGED_MEMBER_CHANGED')
    sums = (archive_root / 'SHA256SUMS').read_text().splitlines()
    require(len(sums) == 1 and sums[0].split() == [file_sha(archive_root / archive_name), archive_name], 'ARCHIVE_CHECKSUM_FAILED')
    return value, archive_root / archive_name

def migrations(path): return {item.name: file_sha(item) for item in (path / 'migrations').glob('*.sql')}

def prepare_release_permissions():
    require(json.loads((RELEASE / 'node_modules/next/package.json').read_text())['version'] == '16.4.3', 'NEXT_CACHE_POLICY_VERSION_CHANGED')
    app = pwd.getpwnam('openena')
    for relative in RUNTIME_CACHE_DIRS:
        cache = RELEASE / relative
        require(cache.resolve() == cache and not cache.is_symlink(), 'RUNTIME_CACHE_PATH_IS_SYMLINK')
        cache.mkdir(mode=0o755, parents=True, exist_ok=True)
    # Code cannot be changed by the canary or the long-running Web identity.
    for root, directories, files in os.walk(str(RELEASE), followlinks=False):
        paths = [pathlib.Path(root)] + [pathlib.Path(root) / name for name in directories + files]
        for path in paths:
            metadata = path.lstat()
            if stat.S_ISLNK(metadata.st_mode): os.lchown(str(path), 0, app.pw_gid)
            elif stat.S_ISDIR(metadata.st_mode): os.chown(str(path), 0, app.pw_gid); os.chmod(str(path), 0o755)
            elif stat.S_ISREG(metadata.st_mode): os.chown(str(path), 0, app.pw_gid); os.chmod(str(path), 0o444 | (stat.S_IMODE(metadata.st_mode) & 0o111))
            else: raise RuntimeError('STAGED_RUNTIME_UNEXPECTED_TYPE')
    for relative in RUNTIME_CACHE_DIRS:
        cache = RELEASE / relative
        for root, directories, files in os.walk(str(cache), followlinks=False):
            for path in [pathlib.Path(root)] + [pathlib.Path(root) / name for name in directories + files]:
                metadata = path.lstat()
                require(not stat.S_ISLNK(metadata.st_mode), 'RUNTIME_CACHE_CONTAINS_SYMLINK')
                require(stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode), 'RUNTIME_CACHE_UNEXPECTED_TYPE')
                os.chown(str(path), app.pw_uid, app.pw_gid)
                os.chmod(str(path), 0o700 if stat.S_ISDIR(metadata.st_mode) else 0o600)

def release_manifest():
    result = {}
    for root, directories, files in os.walk(str(RELEASE), followlinks=False):
        directory = pathlib.Path(root); relative_root = str(directory.relative_to(RELEASE))
        metadata = directory.lstat()
        result[relative_root] = {'directory': True, 'mode': stat.S_IMODE(metadata.st_mode), 'uid': metadata.st_uid, 'gid': metadata.st_gid}
        if relative_root in RUNTIME_CACHE_DIRS:
            require(stat.S_ISDIR(metadata.st_mode) and not directory.is_symlink(), 'RUNTIME_CACHE_ANCHOR_CHANGED')
            result[relative_root]['runtimeCache'] = True
            directories[:] = []; continue
        for name in directories + files:
            path = pathlib.Path(root) / name; metadata = path.lstat(); relative = str(path.relative_to(RELEASE))
            if stat.S_ISLNK(metadata.st_mode):
                require(relative not in RUNTIME_CACHE_DIRS, 'RUNTIME_CACHE_ANCHOR_CHANGED')
                result[relative] = {'link': os.readlink(str(path)), 'uid': metadata.st_uid, 'gid': metadata.st_gid}
            elif stat.S_ISREG(metadata.st_mode): result[relative] = {'sha256': file_sha(path), 'mode': stat.S_IMODE(metadata.st_mode), 'uid': metadata.st_uid, 'gid': metadata.st_gid}
            else: require(stat.S_ISDIR(metadata.st_mode), 'STAGED_RUNTIME_UNEXPECTED_TYPE')
    return result

def verify_release_manifest(staged):
    content = (ROOT / 'release-content-manifest.json').read_bytes()
    require(sha(content) == staged['contentManifestSha256'], 'STAGED_MANIFEST_CHANGED')
    require(release_manifest() == json.loads(content.decode()), 'STAGED_RUNTIME_CONTENT_CHANGED')

def stage_release():
    prior = load('preflight-receipt.json')
    require(prior['passed'] and prior['commit'] == COMMIT, 'PREFLIGHT_MISMATCH')
    now = snapshot(); guard(prior['snapshot'], now, IMMUTABLE + ['nginxSha256', 'currentRelease'])
    artifact, archive_path = verify_artifact()
    require(not RELEASE.exists() and not RELEASE.is_symlink(), 'RELEASE_ALREADY_EXISTS')
    with tarfile.open(str(archive_path), 'r:gz') as archive:
        for member in archive.getmembers():
            path = pathlib.PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts and not any(part.startswith('.env') for part in path.parts), 'UNSAFE_ARCHIVE_PATH')
            require(member.isfile() or member.isdir() or member.issym() or member.islnk(), 'UNSAFE_ARCHIVE_TYPE')
            if member.issym() or member.islnk():
                target = pathlib.PurePosixPath(member.linkname)
                resolved = os.path.normpath(str(path.parent / target) if member.issym() else str(target))
                require(not target.is_absolute() and resolved != '..' and not resolved.startswith('../'), 'UNSAFE_ARCHIVE_LINK')
    RELEASE.mkdir(mode=0o755)
    run(['tar', '-xzf', str(archive_path), '--no-same-owner', '-C', str(RELEASE)], timeout=180)
    require(json.loads((RELEASE / 'release.json').read_text()) == artifact['identity'], 'EXTRACTED_RELEASE_IDENTITY')
    require((RELEASE / '.next/BUILD_ID').read_text().strip() == artifact['smoke']['buildId'], 'EXTRACTED_BUILD_ID')
    require(migrations(CURRENT) == migrations(RELEASE) and len(migrations(RELEASE)) >= 12, 'MIGRATIONS_CHANGED')
    worker = 'scripts/plugin-lab-notifications.mjs'
    require(file_sha(CURRENT / worker) == file_sha(RELEASE / worker), 'PLUGIN_NOTIFICATION_WORKER_CHANGED')
    prepare_release_permissions()
    content_manifest = (json.dumps(release_manifest(), sort_keys=True) + '\n').encode()
    write_new(ROOT / 'release-content-manifest.json', content_manifest)
    receipt('stage-release-receipt.json', {'passed': True, 'commit': COMMIT, 'buildId': artifact['smoke']['buildId'], 'releaseDirectory': str(RELEASE), 'migrationHashes': migrations(RELEASE), 'contentManifestSha256': sha(content_manifest), 'codeOwner': 'root', 'runtimeCacheDirectories': list(RUNTIME_CACHE_DIRS), 'productionChanged': False, 'databaseMutation': False})

def atomic(path, content, metadata):
    fd, temporary = tempfile.mkstemp(prefix='.ena-reliability-', dir=str(path.parent))
    try:
        os.fchmod(fd, stat.S_IMODE(metadata.st_mode)); os.fchown(fd, metadata.st_uid, metadata.st_gid)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def point_current(target):
    cache_target(pathlib.Path(target))
    temporary = CURRENT.parent / ('.current-reliability-' + COMMIT[:12])
    require(not temporary.exists() and not temporary.is_symlink(), 'TEMP_LINK_EXISTS')
    temporary.symlink_to(target); os.replace(str(temporary), str(CURRENT))

def backup_databases():
    prior = load('preflight-receipt.json')
    require(prior['passed'] and prior['commit'] == COMMIT, 'PREFLIGHT_MISMATCH')
    guard(prior['snapshot'], snapshot(), IMMUTABLE + ['nginxSha256', 'currentRelease'])
    require(not (ROOT / 'database-backup-receipt.json').exists(), 'BACKUP_ALREADY_RECORDED')
    backup = ROOT / ('database-backup-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    prefix = ['runuser','-u','openenadb','--']
    options = ['-h','/run/open-ena-postgresql','-p','5433','--no-password']
    def sql(database, query):
        return run(prefix + ['/usr/pgsql-17/bin/psql','-X'] + options + ['-d',database,'--set','ON_ERROR_STOP=1','-Atq','--command',query])
    schema_query = "SELECT json_agg(json_build_array(table_name,column_name,data_type,is_nullable,column_default) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public'"
    results = []
    for index, database in enumerate(['openena','ena_plugin_lab']):
        dump = backup / (database + '.dump')
        with dump.open('xb') as stream:
            value = subprocess.run(prefix + ['/usr/pgsql-17/bin/pg_dump'] + options + ['-d',database,'--format=custom'], stdout=stream, stderr=subprocess.PIPE, timeout=300)
        require(value.returncode == 0 and dump.stat().st_size > 0, 'DATABASE_BACKUP_FAILED')
        scratch = 'ena_report_rehearsal_' + str(os.getpid()) + '_' + str(index)
        require(re.fullmatch(r'ena_report_rehearsal_[0-9]+_[01]', scratch) is not None, 'SCRATCH_NAME_INVALID')
        require(sql('postgres', "SELECT count(*) FROM pg_database WHERE datname='"+scratch+"'") == '0', 'SCRATCH_ALREADY_EXISTS')
        source_schema = sql(database, schema_query)
        created = False
        try:
            run(prefix + ['/usr/pgsql-17/bin/createdb'] + options + ['--template=template0',scratch]); created = True
            sql('postgres', 'REVOKE ALL ON DATABASE ' + scratch + ' FROM PUBLIC')
            with dump.open('rb') as stream:
                restored = subprocess.run(prefix + ['/usr/pgsql-17/bin/pg_restore'] + options + ['--dbname',scratch,'--exit-on-error','--single-transaction','--no-owner','--no-privileges'], stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            require(restored.returncode == 0, 'SCRATCH_RESTORE_FAILED')
            require(sql(scratch, schema_query) == source_schema, 'RESTORED_SCHEMA_MISMATCH')
            tables = int(sql(scratch, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"))
        finally:
            if created: run(prefix + ['/usr/pgsql-17/bin/dropdb'] + options + [scratch])
        require(sql('postgres', "SELECT count(*) FROM pg_database WHERE datname='"+scratch+"'") == '0', 'SCRATCH_CLEANUP_FAILED')
        results.append({'database':database,'backupBytes':dump.stat().st_size,'backupSha256':file_sha(dump),'restoredTables':tables,'schemaSha256':sha(source_schema.encode()),'restoreVerified':True,'scratchRemoved':True})
    guard(prior['snapshot'], snapshot(), IMMUTABLE + ['nginxSha256', 'currentRelease'])
    receipt('database-backup-receipt.json', {'passed':True,'commit':COMMIT,'previousCommit':PREVIOUS,'backupDirectory':str(backup),'databases':results,'productionDatabaseMutation':False,'servicesChanged':False})

def activate():
    prior = load('preflight-receipt.json'); staged = load('stage-release-receipt.json')
    require(prior['passed'] and staged['passed'] and prior['commit'] == staged['commit'] == COMMIT, 'STAGE_NOT_VERIFIED')
    database_backup = load('database-backup-receipt.json')
    require(database_backup['passed'] and database_backup['previousCommit'] == PREVIOUS and database_backup['commit'] == COMMIT, 'DATABASE_BACKUP_REQUIRED')
    require(0 <= time.time() - (ROOT / 'database-backup-receipt.json').stat().st_mtime < 1800, 'DATABASE_BACKUP_STALE')
    require(0 <= time.time() - (ROOT / 'preflight-receipt.json').stat().st_mtime < 3600, 'PREFLIGHT_STALE')
    now = snapshot(); guard(prior['snapshot'], now, IMMUTABLE + ['nginxSha256', 'currentRelease'])
    artifact, unused = verify_artifact()
    require(json.loads((RELEASE / 'release.json').read_text()) == artifact['identity'] and (RELEASE / '.next/BUILD_ID').read_text().strip() == artifact['smoke']['buildId'], 'STAGED_RELEASE_IDENTITY')
    require(migrations(CURRENT) == migrations(RELEASE) == staged['migrationHashes'], 'MIGRATIONS_CHANGED')
    verify_release_manifest(staged)
    cache_target(RELEASE); cache_target(CURRENT.resolve())
    old_env = ENV.read_bytes(); old_nginx = NGINX.read_bytes(); env = environment()
    with socket.socket() as check: require(check.connect_ex(('127.0.0.1', 3201)) != 0, 'CANARY_PORT_IN_USE')
    app = pwd.getpwnam('openena')
    def as_app(): os.initgroups('openena', app.pw_gid); os.setgid(app.pw_gid); os.setuid(app.pw_uid)
    canary_env = dict(env, PATH='/opt/node/bin:/usr/bin:/bin', HOSTNAME='127.0.0.1', PORT='3201', NODE_ENV='production')
    with (ROOT / 'canary-server.log').open('xb') as log:
        child = subprocess.Popen(['/opt/node/bin/node', 'server.js'], cwd=str(RELEASE), env=canary_env, stdout=log, stderr=log, preexec_fn=as_app)
        try:
            ready('http://127.0.0.1:3201')
            canary = public_health('http://127.0.0.1:3201', baseline=prior['public'][0])
        finally:
            child.terminate()
            try: child.wait(timeout=10)
            except subprocess.TimeoutExpired: child.kill(); child.wait()
    guard(prior['snapshot'], snapshot(), IMMUTABLE + ['nginxSha256', 'currentRelease'])
    backup = ROOT / ('cutover-backup-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    for name, content in [('runtime.env', old_env), ('open-ena.conf', old_nginx), ('open-ena.service.txt', run(['systemctl', 'cat', SERVICE]).encode()), ('worker-runtime.env', WORKER_ENV.read_bytes()), ('sandbox.env', SANDBOX_ENV.read_bytes()), ('ena-nova-worker.service.txt', run(['systemctl', 'cat', WORKER_SERVICE]).encode()), ('previous-release.txt', (str(CURRENT.resolve()) + '\n').encode()), ('previous-worker-release.txt', (str(WORKER_CURRENT.resolve()) + '\n').encode())]:
        write_new(backup / name, content)
    write_new(backup / 'binding.json', (json.dumps(prior['snapshot'], indent=2) + '\n').encode())
    old_header = ('add_header X-ENA-Release ' + PREVIOUS + ' always;').encode()
    require(old_nginx.count(old_header) == 1, 'RELEASE_HEADER_BINDING')
    new_nginx = old_nginx.replace(old_header, ('add_header X-ENA-Release ' + COMMIT + ' always;').encode())
    other_sites = {str(path): file_sha(path) for path in NGINX.parent.glob('*.conf') if path != NGINX}
    nginx_stat = NGINX.stat(); old_target = str(CURRENT.resolve()); switched = False
    print(json.dumps({'phase': 'CANARY_PASSED_BINDINGS_BACKED_UP', 'commit': COMMIT, 'backupDirectory': str(backup), 'databaseMutation': False}), flush=True)
    try:
        verify_release_manifest(staged)
        guard(prior['snapshot'], snapshot(), IMMUTABLE + ['nginxSha256', 'currentRelease'])
        require(old_target == str(RELEASES / PREVIOUS), 'OLD_TARGET_BINDING_CHANGED')
        require(ENV.read_bytes() == old_env and NGINX.read_bytes() == old_nginx, 'CONCURRENT_RUNTIME_CHANGE')
        atomic(NGINX, new_nginx, nginx_stat); run([NGINX_BIN, '-t'])
        point_current(str(RELEASE)); switched = True
        run(['systemctl', 'restart', SERVICE]); ready('http://127.0.0.1:3200')
        require(assert_process_environment(env) != now['webPid'], 'WEB_PID_NOT_CHANGED')
        require((PROC / prop(SERVICE, 'MainPID') / 'cwd').resolve() == RELEASE, 'NEW_PROCESS_IDENTITY')
        runtime_cache_policy()
        cache_health = image_cache_health('http://127.0.0.1:3200')
        public_health('http://127.0.0.1:3200', baseline=prior['public'][0])
        run([NGINX_BIN, '-s', 'reload'])
        wait_public_headers(COMMIT)
        public = [public_health(origin, COMMIT, prior['public'][0]) for origin in ORIGINS]
        after = snapshot(); guard(prior['snapshot'], after, IMMUTABLE)
        require(ENV.read_bytes() == old_env and NGINX.read_bytes() == new_nginx, 'POST_DEPLOY_CONFIGURATION_CHANGED')
        require(all(file_sha(path) == digest for path, digest in other_sites.items()), 'OTHER_SITE_CHANGED')
        receipt('deployment-receipt.json', {'status': 'WEB_DEPLOYED_PENDING_WORKER_AND_LIVE_ACCEPTANCE', 'passed': True, 'commit': COMMIT, 'previousCommit': PREVIOUS, 'artifactId': BINDING['artifactId'], 'artifactSha256': BINDING['artifactSha256'], 'buildId': artifact['smoke']['buildId'], 'snapshot': after, 'backupDirectory': str(backup), 'canary': canary, 'public': public, 'imageCache': cache_health, 'runtimeConfigurationUnchanged': True, 'keysPreserved': True, 'novaFlagsPreserved': True, 'databaseMutation': False, 'workerChanged': False, 'otherSitesUnchanged': True})
    except Exception:
        # Recovery may admit PID 0 or a broken process mount, never policy drift.
        guard(prior['snapshot'], snapshot(require_web_health=False), IMMUTABLE)
        cache_target(pathlib.Path(old_target))
        require(CURRENT.resolve() in (pathlib.Path(old_target), RELEASE), 'CONCURRENT_RELEASE_CHANGE_REQUIRES_OPERATOR')
        require(NGINX.read_bytes() in (old_nginx, new_nginx), 'CONCURRENT_PROXY_CHANGE_REQUIRES_OPERATOR')
        require(ENV.read_bytes() == old_env, 'CONCURRENT_ENV_CHANGE_REQUIRES_OPERATOR')
        if switched: point_current(old_target)
        atomic(NGINX, old_nginx, nginx_stat); run([NGINX_BIN, '-t'])
        if switched: run(['systemctl', 'restart', SERVICE])
        run([NGINX_BIN, '-s', 'reload']); ready('http://127.0.0.1:3200')
        wait_public_headers(PREVIOUS)
        public = [public_health(origin, PREVIOUS, prior['public'][0]) for origin in ORIGINS]
        require(CURRENT.resolve().name == PREVIOUS and ENV.read_bytes() == old_env and NGINX.read_bytes() == old_nginx, 'ROLLBACK_MISMATCH')
        after = snapshot(); guard(prior['snapshot'], after, IMMUTABLE)
        cache_health = image_cache_health('http://127.0.0.1:3200')
        receipt('rollback-receipt.json', {'status': 'WEB_ROLLED_BACK', 'previousCommit': PREVIOUS, 'databaseMutation': False, 'runtimeConfigurationUnchanged': True, 'backupDirectory': str(backup), 'public': public, 'snapshot': after, 'imageCache': cache_health})
        raise

def final_health():
    deployment = load('deployment-receipt.json'); prior = load('preflight-receipt.json'); now = snapshot()
    require(deployment['passed'] and deployment['commit'] == COMMIT and now['currentRelease'] == COMMIT, 'DEPLOYMENT_IDENTITY')
    guard(deployment['snapshot'], now, ['environmentSha256', 'nginxSha256', 'webUnitSha256'])
    require(now['workerActive'], 'WORKER_INACTIVE')
    public = [public_health(origin, COMMIT, prior['public'][0]) for origin in ORIGINS]
    cache_health = image_cache_health('http://127.0.0.1:3200')
    receipt('final-web-health-receipt.json', {'passed': True, 'commit': COMMIT, 'snapshot': now, 'public': public, 'imageCache': cache_health, 'databaseCounts': database_counts(), 'databaseMutation': False, 'liveGenerationExercised': False})

def rollback_web():
    deployment = load('deployment-receipt.json'); prior = load('preflight-receipt.json'); now = snapshot(require_web_health=False)
    require(deployment['passed'] and deployment['commit'] == COMMIT and now['currentRelease'] == COMMIT, 'DEPLOYMENT_IDENTITY')
    guard(deployment['snapshot'], now, ['environmentSha256', 'nginxSha256', 'webUnitSha256'])
    # Coordinate worker rollback first if it has already changed. PID may differ after its restart.
    guard(prior['snapshot'], now, ['workerRelease', 'workerEnvironmentSha256', 'sandboxEnvironmentSha256', 'workerUnitSha256', 'workerActive'])
    backup = pathlib.Path(deployment['backupDirectory'])
    require(backup.parent == ROOT and backup.is_dir() and not backup.is_symlink(), 'BACKUP_BINDING')
    old_env = (backup / 'runtime.env').read_bytes(); old_nginx = (backup / 'open-ena.conf').read_bytes()
    require(ENV.read_bytes() == old_env and sha(old_env) == prior['snapshot']['environmentSha256'] and sha(old_nginx) == prior['snapshot']['nginxSha256'], 'BACKUP_HASH_MISMATCH')
    old_target = pathlib.Path((backup / 'previous-release.txt').read_text().strip())
    require(old_target == RELEASES / PREVIOUS and old_target.is_dir(), 'PREVIOUS_RELEASE_MISSING')
    cache_target(old_target)
    nginx_stat = NGINX.stat(); target_nginx = NGINX.read_bytes()
    # Validate the restored proxy before changing current. A failed nginx test leaves
    # the target release and target proxy binding intact, including for a crashed Web.
    guard(now, snapshot(require_web_health=False), ['currentRelease', 'environmentSha256', 'nginxSha256', 'webUnitSha256', 'workerRelease', 'workerEnvironmentSha256', 'sandboxEnvironmentSha256', 'workerUnitSha256', 'workerActive'])
    try:
        atomic(NGINX, old_nginx, nginx_stat); run([NGINX_BIN, '-t'])
    except Exception:
        require(NGINX.read_bytes() in (old_nginx, target_nginx), 'CONCURRENT_PROXY_CHANGE_REQUIRES_OPERATOR')
        atomic(NGINX, target_nginx, nginx_stat)
        raise
    point_current(str(old_target))
    run(['systemctl', 'restart', SERVICE]); ready('http://127.0.0.1:3200')
    run([NGINX_BIN, '-s', 'reload']); wait_public_headers(PREVIOUS)
    public = [public_health(origin, PREVIOUS, prior['public'][0]) for origin in ORIGINS]
    after = snapshot()
    require(after['currentRelease'] == PREVIOUS and ENV.read_bytes() == old_env and NGINX.read_bytes() == old_nginx, 'MANUAL_ROLLBACK_MISMATCH')
    guard(now, after, ['environmentSha256', 'webUnitSha256'])
    cache_health = image_cache_health('http://127.0.0.1:3200')
    receipt('manual-rollback-receipt.json', {'passed': True, 'status': 'WEB_ROLLED_BACK_AFTER_COORDINATED_WORKER_ROLLBACK', 'commit': PREVIOUS, 'revertedCommit': COMMIT, 'snapshot': after, 'public': public, 'imageCache': cache_health, 'runtimeConfigurationUnchanged': True, 'databaseMutation': False})

def main(action):
    private_root()
    require(BINDING['allRequiredJobsPassed'] is True, 'CI_ADMISSION_MISSING')
    {'preflight': preflight, 'stage-release': stage_release, 'backup-databases': backup_databases, 'activate-web': activate, 'final-health': final_health, 'rollback-web': rollback_web}[action]()
