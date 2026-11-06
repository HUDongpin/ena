"""Fault checks for recovery admission and pre-switch proxy validation."""
import hashlib, json, os, pathlib, tempfile, types, unittest
from unittest.mock import patch

BASE = pathlib.Path(__file__).resolve().parents[1] / "scripts/self-hosted"
TARGET = '318ebb2b7ebb1e296de46c52c5151943eb4e18ce'
OLD = '8d4ab4b1099dabd727b846928169ab79f6608fda'
BINDING = {'commit': TARGET, 'previousCommit': OLD, 'previousWorkerRelease': '/srv/nova-worker/releases/8d4-cohost-69ff0ded', 'artifactId': 13161965567, 'artifactBytes': 269994885, 'artifactSha256': '80250bf46e898e312a001dad5a0f4cb7f0c622670bcb3678ca58420a2d153e0f', 'remoteRoot': '/root/ena-nova-reliability-release-20261103/web', 'allRequiredJobsPassed': True}

def operator():
    module = types.ModuleType('local_operator_fault_fixture')
    source = (BASE/'templates/web-operator.py').read_text().replace('BINDING_LITERAL', repr(BINDING))
    exec(compile(source, str(BASE/'templates/web-operator.py'), 'exec'), module.__dict__)
    return module

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ena-recovery-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve(); self.m = operator()

    def snapshot_fixture(self, state='failed', pid='0'):
        m = self.m; root = self.root
        m.CURRENT = root/'current'; release = root/TARGET; release.mkdir(); m.CURRENT.symlink_to(release)
        m.ROOT_UID=os.getuid();m.RELEASES=root
        m.CACHE_DROPIN=root/'units/30-runtime-cache.conf';m.CACHE_DROPIN.parent.mkdir();m.CACHE_DROPIN.write_bytes((BASE/'30-runtime-cache.conf').read_bytes())
        for part in ['images','fetch-cache']:
            (release/'.next/cache'/part).mkdir(parents=True);(release/'.next/cache'/part).chmod(0o700)
        patcher=patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=os.getuid(),pw_gid=os.getgid()))
        patcher.start();self.addCleanup(patcher.stop)
        m.WORKER_CURRENT = root/'worker-current'; worker = root/'old-worker'; worker.mkdir(); m.WORKER_CURRENT.symlink_to(worker)
        m.ENV = root/'runtime.env'; m.NGINX = root/'nginx.conf'; m.WORKER_ENV = root/'worker.env'; m.SANDBOX_ENV = root/'sandbox.env'
        flags = {'ENA_NOVA_ENABLED':'true','ENA_NOVA_WORKER_ENABLED':'false','OPEN_ENA_CLOUD_PROJECTS_ENABLED':'true','OPEN_ENA_REGISTRATION_ENABLED':'true','OPEN_ENA_PROJECT_ENCRYPTION_KEY':'fixture','ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1':'fixture','ENA_PLUGIN_LAB_SECRET':'fixture'}
        m.ENV.write_text(''.join(key+'='+value+'\n' for key,value in flags.items()))
        for path in (m.NGINX,m.WORKER_ENV,m.SANDBOX_ENV): path.write_text('fixture')
        def prop(unit, name):
            values = {'WorkingDirectory':str(m.CURRENT),'User':'openena','EnvironmentFiles':str(m.ENV)+' (ignore_errors=no)','ActiveState':state if unit==m.SERVICE else 'active','MainPID':pid if unit==m.SERVICE else '10','NRestarts':'0','ReadWritePaths':str(m.CURRENT/'.next/cache'),'ProtectSystem':'strict','DropInPaths':str(m.CACHE_DROPIN),'NeedDaemonReload':'no'}
            return values[name]
        m.prop = prop
        m.run = lambda args,timeout=90: '(aiai) 1 143 0' if args[0]=='busctl' else 'v22.23.0' if args[0]=='/opt/node/bin/node' else 'active' if args[:2]==['systemctl','is-active'] else 'unit fixture'
        m.assert_process_environment = lambda env: self.fail('Failed/inactive PID 0 must not inspect /proc environment')

    def test_failed_web_pid_zero_admitted_for_rollback(self):
        self.snapshot_fixture()
        value = self.m.snapshot(require_web_health=False)
        self.assertEqual(value['webPid'],'0'); self.assertFalse(value['webActive']); self.assertEqual(value['currentRelease'],TARGET)

    def test_forward_still_rejects_failed_web(self):
        self.snapshot_fixture()
        with self.assertRaisesRegex(RuntimeError,'WEB_INACTIVE'): self.m.snapshot()

    def test_inactive_web_with_remaining_pid_rejected(self):
        self.snapshot_fixture(state='inactive',pid='41')
        with self.assertRaisesRegex(RuntimeError,'INACTIVE_WEB_PROCESS_REMAINS'): self.m.snapshot(require_web_health=False)

    def test_transitioning_web_rejected_for_rollback(self):
        self.snapshot_fixture(state='deactivating')
        with self.assertRaisesRegex(RuntimeError,'WEB_STATE_TRANSITION_IN_PROGRESS'): self.m.snapshot(require_web_health=False)

    def rollback_fixture(self, fail_nginx=False):
        m = self.m; m.ROOT = self.root; m.ENV = self.root/'runtime.env'; m.NGINX = self.root/'nginx.conf'
        m.ENV.write_bytes(b'unchanged fixture environment\n'); m.NGINX.write_bytes(b'target proxy\n')
        backup = self.root/'cutover-backup-fixture'; backup.mkdir()
        (backup/'runtime.env').write_bytes(m.ENV.read_bytes()); (backup/'open-ena.conf').write_bytes(b'previous proxy\n')
        old_target = pathlib.Path('/srv/open-ena/releases')/OLD
        (backup/'previous-release.txt').write_text(str(old_target)+'\n')
        state = {'current':TARGET,'active':False}; actions = []; receipts = []
        def snapshot(require_web_health=True):
            if require_web_health and not state['active']: raise RuntimeError('WEB_INACTIVE')
            return {'currentRelease':state['current'],'webActive':state['active'],'webPid':'100' if state['active'] else '0','environmentSha256':m.file_sha(m.ENV),'nginxSha256':m.file_sha(m.NGINX),'webUnitSha256':'unit','workerRelease':BINDING['previousWorkerRelease'],'workerEnvironmentSha256':'worker-env','sandboxEnvironmentSha256':'sandbox-env','workerUnitSha256':'worker-unit','workerActive':True}
        deployed = snapshot(False); prior = dict(deployed,nginxSha256=m.sha(b'previous proxy\n'))
        m.load = lambda name: {'passed':True,'commit':TARGET,'snapshot':deployed,'backupDirectory':str(backup)} if name=='deployment-receipt.json' else {'snapshot':prior,'public':[{'configuration':{}}]}
        m.snapshot = snapshot
        m.cache_target = lambda target: target/'.next/cache'
        m.image_cache_health = lambda origin: {'cache':'HIT'}
        def atomic(path,data,metadata): actions.append('proxy-old' if data==b'previous proxy\n' else 'proxy-target'); path.write_bytes(data)
        def point_current(target): actions.append('switch-current'); state['current']=pathlib.Path(target).name
        def run(args,timeout=90):
            if args == [m.NGINX_BIN,'-t']:
                actions.append('nginx-test')
                if fail_nginx: raise RuntimeError('COMMAND_FAILED_nginx')
            if args == ['systemctl','restart',m.SERVICE]: actions.append('restart-web'); state['active']=True
            return ''
        m.atomic=atomic; m.point_current=point_current; m.run=run; m.ready=lambda origin: None; m.wait_public_headers=lambda expected: None
        m.public_health=lambda *args,**kwargs: {'passed':True}; m.receipt=lambda name,value: receipts.append((name,value))
        original_is_dir = pathlib.Path.is_dir
        patcher = patch.object(pathlib.Path,'is_dir',lambda path: path==old_target or original_is_dir(path))
        patcher.start(); self.addCleanup(patcher.stop)
        return state,actions,receipts

    def test_crashed_web_rolls_back_and_restarts_old_release(self):
        state,actions,receipts=self.rollback_fixture()
        self.m.rollback_web()
        self.assertEqual(state,{'current':OLD,'active':True})
        self.assertLess(actions.index('nginx-test'),actions.index('switch-current'))
        self.assertTrue(receipts[-1][1]['passed'])

    def test_invalid_restore_proxy_does_not_switch_and_restores_target_proxy(self):
        state,actions,receipts=self.rollback_fixture(fail_nginx=True)
        with self.assertRaisesRegex(RuntimeError,'COMMAND_FAILED_nginx'): self.m.rollback_web()
        self.assertNotIn('switch-current',actions); self.assertNotIn('restart-web',actions)
        self.assertEqual(self.m.NGINX.read_bytes(),b'target proxy\n'); self.assertEqual(state['current'],TARGET); self.assertEqual(receipts,[])

    def test_changed_environment_blocks_rollback_before_mutation(self):
        state,actions,receipts=self.rollback_fixture()
        self.m.ENV.write_bytes(b'concurrent changed fixture\n')
        with self.assertRaisesRegex(RuntimeError,'CONCURRENT_RUNTIME_CHANGE'): self.m.rollback_web()
        self.assertEqual(actions,[]); self.assertEqual(state['current'],TARGET)

    def manifest_fixture(self):
        m=self.m; m.ROOT=self.root; m.RELEASE=self.root/'release'; m.RELEASE.mkdir()
        code=m.RELEASE/'.next/server/app/page.js'; code.parent.mkdir(parents=True); code.write_text('original compiled route')
        for relative in m.RUNTIME_CACHE_DIRS: (m.RELEASE/relative).mkdir(parents=True,exist_ok=True)
        content=(json.dumps(m.release_manifest(),sort_keys=True)+'\n').encode()
        (m.ROOT/'release-content-manifest.json').write_bytes(content)
        return code,{'contentManifestSha256':m.sha(content)}

    def test_runtime_cache_writes_allowed(self):
        code,stage=self.manifest_fixture()
        for relative in self.m.RUNTIME_CACHE_DIRS:
            data=self.m.RELEASE/relative/'new-cache-key'/'payload'; data.parent.mkdir(); data.write_text('normal runtime data')
        self.m.verify_release_manifest(stage)

    def test_compiled_route_mutation_rejected(self):
        code,stage=self.manifest_fixture(); code.write_text('modified compiled route')
        with self.assertRaisesRegex(RuntimeError,'STAGED_RUNTIME_CONTENT_CHANGED'): self.m.verify_release_manifest(stage)

    def test_compiled_route_addition_rejected(self):
        code,stage=self.manifest_fixture(); (code.parent/'injected.js').write_text('added executable code')
        with self.assertRaisesRegex(RuntimeError,'STAGED_RUNTIME_CONTENT_CHANGED'): self.m.verify_release_manifest(stage)

    def test_runtime_code_symlink_replacement_rejected(self):
        code,stage=self.manifest_fixture(); code.unlink(); code.symlink_to(self.m.RELEASE/self.m.RUNTIME_CACHE_DIRS[0]/'payload')
        with self.assertRaisesRegex(RuntimeError,'STAGED_RUNTIME_CONTENT_CHANGED'): self.m.verify_release_manifest(stage)

    def test_cache_anchor_symlink_rejected(self):
        code,stage=self.manifest_fixture(); anchor=self.m.RELEASE/self.m.RUNTIME_CACHE_DIRS[0]; anchor.rmdir(); anchor.symlink_to(code.parent)
        with self.assertRaisesRegex(RuntimeError,'RUNTIME_CACHE_ANCHOR_CHANGED'): self.m.verify_release_manifest(stage)

    def test_cache_anchor_permissions_changed_rejected(self):
        code,stage=self.manifest_fixture(); anchor=self.m.RELEASE/self.m.RUNTIME_CACHE_DIRS[0]; anchor.chmod(0o700 if anchor.stat().st_mode & 0o077 else 0o755)
        with self.assertRaisesRegex(RuntimeError,'STAGED_RUNTIME_CONTENT_CHANGED'): self.m.verify_release_manifest(stage)

    def test_permission_policy_root_code_and_only_three_mutable_caches(self):
        code,stage=self.manifest_fixture(); package=self.m.RELEASE/'node_modules/next/package.json'; package.parent.mkdir(parents=True); package.write_text('{"version":"16.4.3"}')
        owners=[]
        with patch.object(self.m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=50001,pw_gid=50002)), patch.object(self.m.os,'chown',side_effect=lambda path,uid,gid: owners.append((path,uid,gid))), patch.object(self.m.os,'lchown',side_effect=lambda path,uid,gid: owners.append((path,uid,gid))):
            self.m.prepare_release_permissions()
        self.assertIn((str(code),0,50002),owners); self.assertEqual(code.stat().st_mode & 0o777,0o444)
        writable={str(pathlib.Path(path).relative_to(self.m.RELEASE)) for path,uid,gid in owners if uid==50001}
        self.assertEqual(writable,set(self.m.RUNTIME_CACHE_DIRS))



    def test_snapshot_rejects_pinned_old_cache_even_when_unit_hash_is_unchanged(self):
        self.snapshot_fixture()
        old_prop = self.m.prop
        self.m.prop = lambda unit, name: '/srv/open-ena/releases/' + OLD + '/.next/cache' if name == 'ReadWritePaths' else old_prop(unit, name)
        with self.assertRaisesRegex(RuntimeError, 'CACHE_'):
            self.m.snapshot(require_web_health=False)

    def test_snapshot_rejects_missing_dropin_even_during_failed_web_recovery(self):
        self.snapshot_fixture()
        self.m.CACHE_DROPIN = self.root/'missing.conf'
        with self.assertRaisesRegex(RuntimeError, 'CACHE_'):
            self.m.snapshot(require_web_health=False)



class CachePolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ena-cache-policy-')
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve()
        self.m = operator()
        m = self.m
        m.ROOT_UID = os.getuid()
        m.RELEASES = self.root/'releases'
        self.old = m.RELEASES/OLD
        self.new = m.RELEASES/TARGET
        for release in [self.old, self.new]:
            for part in ['images','fetch-cache']:
                (release/'.next/cache'/part).mkdir(parents=True)
                (release/'.next/cache'/part).chmod(0o700)
        m.CURRENT = self.root/'current'; m.CURRENT.symlink_to(self.old)
        m.CACHE_DROPIN = self.root/'units/open-ena.service.d/30-runtime-cache.conf'
        m.CACHE_DROPIN.parent.mkdir(parents=True)
        m.CACHE_DROPIN.write_bytes((BASE/'30-runtime-cache.conf').read_bytes())
        m.CACHE_DROPIN.chmod(0o644)
        m.PROC = self.root/'proc'; (m.PROC/'101').mkdir(parents=True)
        (m.PROC/'101/cwd').symlink_to(self.old)
        self.mount(self.old)
        self.properties = {'ReadWritePaths':str(m.CURRENT/'.next/cache'), 'ProtectSystem':'strict',
                           'DropInPaths':str(m.CACHE_DROPIN),'NeedDaemonReload':'no','MainPID':'101'}
        m.prop = lambda unit,name:self.properties[name]
        m.run = lambda args,timeout=90:'(aiai) 1 143 0' if args[0]=='busctl' else self.fail('Unexpected subprocess: '+repr(args))
        patcher = patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=os.getuid(),pw_gid=os.getgid()))
        patcher.start();self.addCleanup(patcher.stop)

    def mount(self, release, options='rw,relatime', source=None, pid='101'):
        target = release/'.next/cache'
        (self.m.PROC/pid/'mountinfo').write_text('1 0 8:1 / / ro,relatime - ext4 /dev/fixture rw\n' +
            '2 1 8:1 '+str(source or target)+' '+str(target)+' '+options+' - ext4 /dev/fixture rw\n')

    def check(self, process=True):
        self.assertTrue(callable(getattr(self.m,'runtime_cache_policy',None)), 'Missing runtime cache guard')
        return self.m.runtime_cache_policy(check_process=process)

    def test_current_link_policy_and_structured_exit_status_pass(self):
        self.assertEqual(self.check()['cacheDirectory'],str(self.old/'.next/cache'))

    def test_pinned_cache_path_is_rejected_even_if_it_matches_current_release(self):
        self.properties['ReadWritePaths']=str(self.old/'.next/cache')
        with self.assertRaisesRegex(RuntimeError,'CACHE_WRITABLE_PATH'): self.check()

    def test_broad_write_exception_is_rejected(self):
        self.properties['ReadWritePaths']+=' /srv'
        with self.assertRaisesRegex(RuntimeError,'CACHE_WRITABLE_PATH'): self.check()

    def test_missing_dropin_is_rejected(self):
        self.m.CACHE_DROPIN.unlink()
        with self.assertRaisesRegex(RuntimeError,'CACHE_DROPIN'): self.check()

    def test_changed_dropin_is_rejected(self):
        self.m.CACHE_DROPIN.write_text('[Service]\nReadWritePaths=/srv\n')
        with self.assertRaisesRegex(RuntimeError,'CACHE_DROPIN_CONTENT'): self.check()

    def test_symlink_dropin_is_rejected(self):
        saved=self.root/'saved.conf';self.m.CACHE_DROPIN.rename(saved);self.m.CACHE_DROPIN.symlink_to(saved)
        with self.assertRaisesRegex(RuntimeError,'CACHE_DROPIN'): self.check()

    def test_writable_dropin_directory_is_rejected(self):
        self.m.CACHE_DROPIN.parent.chmod(0o777)
        with self.assertRaisesRegex(RuntimeError,'CACHE_DROPIN'): self.check()

    def test_extra_override_is_rejected(self):
        self.properties['DropInPaths']+=' /etc/systemd/system/open-ena.service.d/99-other.conf'
        with self.assertRaisesRegex(RuntimeError,'CACHE_DROPIN_SET'): self.check()

    def test_pending_daemon_reload_is_rejected(self):
        self.properties['NeedDaemonReload']='yes'
        with self.assertRaisesRegex(RuntimeError,'CACHE_DAEMON_RELOAD'): self.check()

    def test_security_policy_and_exit_status_are_checked_separately(self):
        self.properties['ProtectSystem']='no'
        with self.assertRaisesRegex(RuntimeError,'CACHE_PROTECT_SYSTEM'): self.check()
        self.properties['ProtectSystem']='strict';self.m.run=lambda *a,**k:'(aiai) 0 0'
        with self.assertRaisesRegex(RuntimeError,'CACHE_SUCCESS_EXIT_STATUS'): self.check()

    def test_stale_or_readonly_process_mount_is_rejected(self):
        self.mount(self.old,options='ro,relatime')
        with self.assertRaisesRegex(RuntimeError,'CACHE_PROCESS_MOUNT'): self.check()
        self.mount(self.old,source=self.new/'.next/cache')
        with self.assertRaisesRegex(RuntimeError,'CACHE_PROCESS_MOUNT'): self.check()

    def test_forward_and_back_switch_require_fresh_process_mount(self):
        self.check()
        self.m.CURRENT.unlink();self.m.CURRENT.symlink_to(self.new)
        (self.m.PROC/'101/cwd').unlink();(self.m.PROC/'101/cwd').symlink_to(self.new)
        with self.assertRaisesRegex(RuntimeError,'CACHE_PROCESS_MOUNT'):self.check()
        self.mount(self.new);self.assertEqual(self.check()['cacheDirectory'],str(self.new/'.next/cache'))
        self.m.CURRENT.unlink();self.m.CURRENT.symlink_to(self.old)
        (self.m.PROC/'101/cwd').unlink();(self.m.PROC/'101/cwd').symlink_to(self.old)
        with self.assertRaisesRegex(RuntimeError,'CACHE_PROCESS_MOUNT'):self.check()
        self.mount(self.old);self.check()

    def test_inactive_recovery_checks_policy_without_inspecting_proc(self):
        self.properties['MainPID']='0'
        self.check(process=False)
        self.properties['ReadWritePaths']=str(self.old/'.next/cache')
        with self.assertRaisesRegex(RuntimeError,'CACHE_WRITABLE_PATH'):self.check(process=False)

    def test_missing_or_symlink_destination_cache_rejected_before_switch(self):
        cache=self.new/'.next/cache/images';cache.rmdir()
        with self.assertRaisesRegex(RuntimeError,'CACHE_TARGET'): self.m.point_current(str(self.new))
        self.assertEqual(self.m.CURRENT.resolve(),self.old)
        cache.symlink_to(self.old/'.next/cache/images')
        with self.assertRaisesRegex(RuntimeError,'CACHE_TARGET'): self.m.point_current(str(self.new))
        self.assertEqual(self.m.CURRENT.resolve(),self.old)

class ImageCacheTests(unittest.TestCase):
    def setUp(self):
        self.m=operator();self.requests=[]
        self.m.time=types.SimpleNamespace(sleep=lambda seconds:None)

    def responses(self, cache_states, changed_body=False):
        import io
        states=iter(cache_states)
        def request(origin,path,method='GET',accept=None):
            self.requests.append((origin,path,accept))
            r=io.BytesIO(b'changed' if changed_body and len(self.requests)>1 else b'webp-fixture')
            r.code=200;r.headers={'Content-Type':'image/webp','x-nextjs-cache':next(states,'MISS')}
            return r
        self.m.request=request

    def check(self):
        self.assertTrue(callable(getattr(self.m,'image_cache_health',None)), 'Missing post-restart image check')
        return self.m.image_cache_health('http://127.0.0.1:3200')

    def test_miss_then_hit_with_matching_body_passes_without_proxy_release_header(self):
        self.responses(['MISS','HIT']);self.assertEqual(self.check()['cache'],'HIT')
        self.assertEqual(self.requests[0][2],'image/webp')

    def test_repeated_miss_is_rejected(self):
        self.responses(['MISS']*6)
        with self.assertRaisesRegex(RuntimeError,'IMAGE_CACHE_NOT_HIT'): self.check()

    def test_changed_image_body_is_rejected(self):
        self.responses(['MISS','HIT'],changed_body=True)
        with self.assertRaisesRegex(RuntimeError,'IMAGE_CACHE_BODY_CHANGED'): self.check()



class ActivationTests(unittest.TestCase):
    # Linux service/HTTP boundaries are simulated; the real transaction, file
    # backups, symlink switches and cache policy guard run against temp files.
    mount = CachePolicyTests.mount

    def setUp(self):
        CachePolicyTests.setUp(self)
        m=self.m;m.ROOT=self.root/'audit';m.ROOT.mkdir();m.RELEASE=self.new
        m.ENV=self.root/'runtime.env';m.ENV.write_text('synthetic fixture')
        m.NGINX=self.root/'site.conf';m.NGINX.write_text('add_header X-ENA-Release '+OLD+' always;\n')
        m.WORKER_ENV=self.root/'worker.env';m.WORKER_ENV.write_text('fixture')
        m.SANDBOX_ENV=self.root/'sandbox.env';m.SANDBOX_ENV.write_text('fixture')
        m.WORKER_CURRENT=self.root/'worker';m.WORKER_CURRENT.mkdir()
        (self.new/'release.json').write_text(json.dumps({'commit':TARGET}))
        (self.new/'.next/BUILD_ID').write_text('build-fixture')
        self.actions=[];self.next_pid=101;self.image_failure=False;self.policy_drift=False;self.bad_mount=False
        def snapshot(require_web_health=True):
            policy=m.runtime_cache_policy(check_process=require_web_health)
            return {'currentRelease':m.CURRENT.resolve().name,'webPid':self.properties['MainPID'],
                'environmentSha256':m.file_sha(m.ENV),'nginxSha256':m.file_sha(m.NGINX),'webUnitSha256':m.file_sha(m.CACHE_DROPIN),
                'workerRelease':str(m.WORKER_CURRENT),'workerEnvironmentSha256':'w-env','sandboxEnvironmentSha256':'s-env',
                'workerUnitSha256':'w-unit','workerPid':'999','workerActive':True,'runtimeCachePolicy':policy}
        m.snapshot=snapshot
        prior={'passed':True,'commit':TARGET,'snapshot':snapshot(),'public':[{'configuration':{}}]}
        staged={'passed':True,'commit':TARGET,'migrationHashes':{'001.sql':'fixture'},'contentManifestSha256':'fixture'}
        self.data={'preflight-receipt.json':prior,'stage-release-receipt.json':staged,
            'database-backup-receipt.json':{'passed':True,'commit':TARGET,'previousCommit':OLD}}
        for name,value in self.data.items():(m.ROOT/name).write_text(json.dumps(value))
        m.load=lambda name:json.loads((m.ROOT/name).read_text())
        m.verify_artifact=lambda:({'identity':{'commit':TARGET},'smoke':{'buildId':'build-fixture'}},None)
        m.verify_release_manifest=lambda staged:None
        m.migrations=lambda path:{'001.sql':'fixture'}
        m.environment=lambda:{'FIXTURE':'yes'}
        m.ready=lambda origin:None;m.wait_public_headers=lambda expected:None
        m.public_health=lambda *a,**k:{'passed':True}
        m.assert_process_environment=lambda env:self.properties['MainPID']
        def image_health(origin):
            self.actions.append('image-'+m.CURRENT.resolve().name)
            if self.image_failure and m.CURRENT.resolve()==self.new:
                if self.policy_drift:self.properties['ReadWritePaths']=str(self.old/'.next/cache')
                raise RuntimeError('IMAGE_CACHE_NOT_HIT')
            return {'cache':'HIT'}
        m.image_cache_health=image_health
        def run(args,timeout=90):
            if args[0]=='busctl':return '(aiai) 1 143 0'
            if args[:2]==['systemctl','cat']:return 'unit fixture'
            self.actions.append(tuple(args))
            if args==['systemctl','restart',m.SERVICE]:
                self.next_pid+=1;pid=str(self.next_pid);self.properties['MainPID']=pid
                (m.PROC/pid).mkdir();(m.PROC/pid/'cwd').symlink_to(m.CURRENT.resolve())
                self.mount(m.CURRENT.resolve(),pid=pid,options='ro' if self.bad_mount and m.CURRENT.resolve()==self.new else 'rw,relatime')
            return ''
        m.run=run
        child=types.SimpleNamespace(terminate=lambda:None,wait=lambda timeout:None,kill=lambda:None)
        patcher=patch.object(m.subprocess,'Popen',return_value=child);patcher.start();self.addCleanup(patcher.stop)
        socket=types.SimpleNamespace(connect_ex=lambda endpoint:1)
        class SocketContext:
            def __enter__(self):return socket
            def __exit__(self,*args):pass
        patcher=patch.object(m.socket,'socket',side_effect=SocketContext);patcher.start();self.addCleanup(patcher.stop)

    def execute(self, action):
        import contextlib,io
        with contextlib.redirect_stdout(io.StringIO()):getattr(self.m,action)()

    def test_deploy_then_manual_rollback_preserves_policy_and_validates_both_mounts(self):
        content=self.m.CACHE_DROPIN.read_bytes()
        self.execute('activate')
        deployed=json.loads((self.m.ROOT/'deployment-receipt.json').read_text())
        self.assertEqual(self.m.CURRENT.resolve(),self.new)
        self.assertTrue(deployed['snapshot']['runtimeCachePolicy']['processMountVerified'])
        self.execute('rollback_web')
        result=json.loads((self.m.ROOT/'manual-rollback-receipt.json').read_text())
        self.assertEqual(self.m.CURRENT.resolve(),self.old)
        self.assertEqual(result['snapshot']['runtimeCachePolicy']['cacheDirectory'],str(self.old/'.next/cache'))
        self.assertEqual(result['imageCache']['cache'],'HIT')
        self.assertEqual(self.m.CACHE_DROPIN.read_bytes(),content)

    def test_post_restart_cache_failure_recovers_old_release_and_checks_it(self):
        self.image_failure=True
        with self.assertRaisesRegex(RuntimeError,'IMAGE_CACHE_NOT_HIT'):self.execute('activate')
        self.assertEqual(self.m.CURRENT.resolve(),self.old)
        result=json.loads((self.m.ROOT/'rollback-receipt.json').read_text())
        self.assertTrue(result['snapshot']['runtimeCachePolicy']['processMountVerified'])
        self.assertEqual(result['imageCache']['cache'],'HIT')
        self.assertFalse((self.m.ROOT/'deployment-receipt.json').exists())

    def test_pinned_policy_blocks_forward_activation_before_mutation(self):
        self.properties['ReadWritePaths']=str(self.old/'.next/cache')
        before=self.m.NGINX.read_bytes()
        with self.assertRaisesRegex(RuntimeError,'CACHE_WRITABLE_PATH'):self.execute('activate')
        self.assertEqual(self.m.CURRENT.resolve(),self.old);self.assertEqual(self.actions,[])
        self.assertEqual(self.m.NGINX.read_bytes(),before)

    def test_new_process_readonly_mount_triggers_checked_automatic_rollback(self):
        self.bad_mount=True
        with self.assertRaisesRegex(RuntimeError,'CACHE_PROCESS_MOUNT'):self.execute('activate')
        self.assertEqual(self.m.CURRENT.resolve(),self.old)
        result=json.loads((self.m.ROOT/'rollback-receipt.json').read_text())
        self.assertTrue(result['snapshot']['runtimeCachePolicy']['processMountVerified'])
        self.assertEqual(result['imageCache']['cache'],'HIT')

    def test_policy_drift_during_failed_activation_blocks_automatic_rollback(self):
        self.image_failure=True;self.policy_drift=True
        with self.assertRaisesRegex(RuntimeError,'CACHE_WRITABLE_PATH'):self.execute('activate')
        self.assertEqual(self.m.CURRENT.resolve(),self.new)
        self.assertFalse((self.m.ROOT/'rollback-receipt.json').exists())
        self.assertEqual(self.actions.count(('systemctl','restart',self.m.SERVICE)),1)

    def test_missing_rollback_cache_blocks_before_proxy_or_symlink_mutation(self):
        self.execute('activate');(self.old/'.next/cache/images').rmdir()
        before=self.m.NGINX.read_bytes();self.actions=[]
        with self.assertRaisesRegex(RuntimeError,'CACHE_TARGET_MISSING'):self.execute('rollback_web')
        self.assertEqual(self.m.CURRENT.resolve(),self.new);self.assertEqual(self.m.NGINX.read_bytes(),before)
        self.assertEqual(self.actions,[])

    def test_changed_dropin_blocks_manual_rollback_before_mutation(self):
        self.execute('activate');self.m.CACHE_DROPIN.write_text('concurrent change')
        before=self.m.NGINX.read_bytes();self.actions=[]
        with self.assertRaisesRegex(RuntimeError,'CACHE_DROPIN_CONTENT'):self.execute('rollback_web')
        self.assertEqual(self.m.CURRENT.resolve(),self.new);self.assertEqual(self.m.NGINX.read_bytes(),before)
        self.assertEqual(self.actions,[])

class PacketTests(unittest.TestCase):
    def renderer(self):
        import importlib.util
        path=BASE.parent/'prepare-self-hosted-release.py'
        self.assertTrue(path.exists(),'Missing reusable local-only packet renderer')
        spec=importlib.util.spec_from_file_location('packet_renderer',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

    def binding(self):
        value=dict(BINDING,runId=123)
        value['jobs']=[{'name':name,'status':'completed','conclusion':'success'} for name in [
            'Verify (Node 22)','Browser (Chromium)','Reviewed regressions (Chromium and PostgreSQL 16)']]
        return value

    def test_rendered_packet_contains_guard_all_actions_and_exact_dropin(self):
        import ast,base64,gzip,re
        with tempfile.TemporaryDirectory() as folder:
            out=pathlib.Path(folder)/'packet';manifest=self.renderer().render(self.binding(),out)
            self.assertTrue(manifest['preparedOnly']);self.assertFalse(manifest['productionChanged'])
            for action in ['preflight','stage-release','backup-databases','activate-web','final-health','rollback-web']:
                source=(out/(action+'.py')).read_text();ast.parse(source,feature_version=(3,6))
                self.assertIn('def runtime_cache_policy',source);self.assertIn('def image_cache_health',source)
                self.assertNotIn('BINDING_LITERAL',source)
                shell=(out/(action+'.sh')).read_text()
                self.assertLess(len(shell.encode()),18432)
                payload=ast.literal_eval(re.search(r'base64.b64decode\((.*?)\)\)',shell).group(1))
                self.assertEqual(gzip.decompress(base64.b64decode(payload)).decode(),source)
                self.assertIn(hashlib.sha256(source.encode()).hexdigest(),shell)
            self.assertEqual((out/'30-runtime-cache.conf').read_bytes(),(BASE/'30-runtime-cache.conf').read_bytes())
            self.assertEqual(hashlib.sha256((out/'30-runtime-cache.conf').read_bytes()).hexdigest(),operator().CACHE_DROPIN_SHA256)

    def test_renderer_refuses_failed_or_incomplete_ci_binding_before_creating_packet(self):
        with tempfile.TemporaryDirectory() as folder:
            out=pathlib.Path(folder)/'packet';binding=self.binding();binding['jobs'][0]['conclusion']='failure'
            with self.assertRaisesRegex(RuntimeError,'CI_'):self.renderer().render(binding,out)
            self.assertFalse(out.exists())

    def test_renderer_refuses_unsafe_paths_and_unexpected_secret_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            for value in [dict(self.binding(),remoteRoot='/etc/systemd/system'),dict(self.binding(),secret='synthetic')]:
                out=pathlib.Path(folder)/'packet'
                with self.assertRaises(RuntimeError):self.renderer().render(value,out)
                self.assertFalse(out.exists())

    def test_renderer_does_not_overwrite_existing_packets(self):
        with tempfile.TemporaryDirectory() as folder:
            out=pathlib.Path(folder);sentinel=out/'keep';sentinel.write_text('historical evidence')
            with self.assertRaisesRegex(RuntimeError,'OUTPUT_EXISTS'):self.renderer().render(self.binding(),out)
            self.assertEqual(sentinel.read_text(),'historical evidence')

if __name__=='__main__': unittest.main(verbosity=2)
