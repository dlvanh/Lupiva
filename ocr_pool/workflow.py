"""Local stage execution with immutable attempts, bounded retries and resume."""
from contextlib import contextmanager
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def sha(path):
    result=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            result.update(block)
    return result.hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path,value):
    path=Path(path)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Windows readers/virus scanners can briefly prevent atomic replacement.
    # Keep the old complete state and the recoverable new state if it persists.
    for attempt in range(8):
        try:
            os.replace(temp,path)
            break
        except PermissionError:
            if attempt==7:raise
            time.sleep(min(.02*2**attempt,.25))


def venv_python(folder):
    return folder / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')


def process_token(pid):
    """Return live process creation identity; a reused PID is not the old child."""
    if os.name=='nt':
        import ctypes
        from ctypes import wintypes
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
        kernel.OpenProcess.restype=wintypes.HANDLE
        kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        kernel.GetExitCodeProcess.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)]
        kernel.GetProcessTimes.argtypes=[wintypes.HANDLE]+[ctypes.POINTER(wintypes.FILETIME)]*4
        handle=kernel.OpenProcess(0x1000,False,pid)
        if not handle:
            if ctypes.get_last_error()==5:
                raise RuntimeError('Cannot establish whether previous child is live')
            return None
        try:
            code=wintypes.DWORD()
            if not kernel.GetExitCodeProcess(handle,ctypes.byref(code)):
                raise RuntimeError('Cannot query previous child')
            if code.value!=259:
                return None
            times=[wintypes.FILETIME() for _ in range(4)]
            if not kernel.GetProcessTimes(handle,*[ctypes.byref(t) for t in times]):
                raise RuntimeError('Cannot read process creation identity')
            return str((times[0].dwHighDateTime<<32)|times[0].dwLowDateTime)
        finally:
            kernel.CloseHandle(handle)
    path=Path('/proc')/str(pid)/'stat'
    if path.exists():
        body=path.read_text().rsplit(')',1)[1].split()
        return None if body[0]=='Z' else body[19]
    try:
        os.kill(pid,0)
    except ProcessLookupError:
        return None
    raise RuntimeError('Process identity unavailable; do not restart automatically')


@contextmanager
def workflow_lock(root):
    """OS lock is released even if the runner crashes; file alone is not liveness."""
    path=Path(root)/'workflow.lock'
    with path.open('a+b') as stream:
        if path.stat().st_size==0:
            stream.write(b'0')
            stream.flush()
        stream.seek(0)
        if os.name=='nt':
            import msvcrt
            try:
                msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
            except OSError as error:
                raise RuntimeError('Another runner holds the workflow lock') from error
        else:
            import fcntl
            try:
                fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except OSError as error:
                raise RuntimeError('Another runner holds the workflow lock') from error
        try:
            yield
        finally:
            stream.seek(0)
            if os.name=='nt':
                msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
            else:
                fcntl.flock(stream,fcntl.LOCK_UN)


class Workflow:
    def __init__(self,root,configuration,*,resume=False,max_attempts=2,cwd=None):
        self.root=Path(root).resolve()
        self.cwd=Path(cwd or Path.cwd()).resolve()
        self.path=self.root/'workflow.json'
        self.max_attempts=max_attempts
        if not 1<=max_attempts<=3:
            raise ValueError('Use one to three attempts per stage')
        if self.path.exists():
            if not resume:
                raise FileExistsError('Use --resume or a fresh workflow output')
            self.state=read(self.path)
            if self.state['configuration']!=configuration or self.state['max_attempts']!=max_attempts:
                raise ValueError('Inputs, code, models or settings changed; use a fresh workflow')
        else:
            if resume:
                raise FileNotFoundError('No workflow to resume')
            self.state=dict(version='local-ocr-workflow-1',configuration=configuration,
                            max_attempts=max_attempts,status='running',stages={})
            self.save()

    def save(self):
        self.state['updated_at_utc']=datetime.now(timezone.utc).isoformat()
        write(self.path,self.state)

    def stage(self,name,command,outputs,*,skip=False):
        """Builders receive a fresh attempt directory. Successful files are hashed."""
        entry=self.state['stages'].setdefault(name,dict(attempts=[]))
        attempts=entry['attempts']
        if attempts and attempts[-1]['status']=='completed':
            last=attempts[-1]
            for key,checksum in last['artifacts'].items():
                path=self.root/key
                if not path.is_file() or sha(path)!=checksum:
                    raise ValueError('Completed stage artifact changed: '+key)
            print(name+': verified completed',flush=True)
            return self.root/last['output']
        if entry.get('status')=='skipped':
            if not skip:
                raise ValueError('Stage skip condition changed')
            return None
        if skip:
            entry['status']='skipped'
            self.save()
            print(name+': no applicable regions',flush=True)
            return None
        if attempts and attempts[-1]['status']=='running':
            prior=attempts[-1]
            if prior.get('pid'):
                current=process_token(prior['pid'])
                if current and (prior.get('process_token') is None or current==prior.get('process_token')):
                    raise RuntimeError('Previous stage child is still live; do not restart')
            elif not prior.get('launch_failed'):
                # Crash between spawn and PID recording cannot prove child death.
                raise RuntimeError('Child launch state uncertain; inspect before recovery')
            prior['status']='interrupted'
            self.save()
        while len(attempts)<self.max_attempts:
            folder=self.root/(name+'-attempt-'+str(len(attempts)+1))
            folder.mkdir()
            args=[str(x) for x in command(folder)]
            item=dict(status='running',output=folder.relative_to(self.root).as_posix(),command=args)
            attempts.append(item)
            entry['status']='running'
            self.save()
            print(name+': attempt '+str(len(attempts)),flush=True)
            child=None
            try:
                with (folder/'stdout.log').open('wb') as stdout,(folder/'stderr.log').open('wb') as stderr:
                    try:
                        child=subprocess.Popen(args,cwd=self.cwd,stdout=stdout,stderr=stderr,shell=False)
                    except Exception:
                        item['launch_failed']=True
                        raise
                    item['pid']=child.pid
                    item['process_token']=process_token(child.pid)
                    self.save()
                    code=child.wait()
                item['exit_code']=code
                if code:
                    raise RuntimeError('Stage command exited '+str(code)+'; see local stderr.log')
                expected=[Path(p) for p in outputs(folder)]
                if not expected or any(not p.exists() for p in expected):
                    raise ValueError('Stage did not create its required outputs')
                files=[file for p in expected for file in (sorted(p.rglob('*')) if p.is_dir() else [p]) if file.is_file()]
                item['artifacts']={p.relative_to(self.root).as_posix():sha(p) for p in files}
                item['status']=entry['status']='completed'
                self.save()
                return folder
            except Exception as error:
                if child is not None and child.poll() is None:
                    item.update(status='running',error_type=type(error).__name__,error=str(error))
                    self.save()
                    raise RuntimeError('Stage child remains live; do not restart') from error
                item.update(status='failed',error_type=type(error).__name__,error=str(error))
                entry['status']='failed'
                self.save()
        raise RuntimeError('Stage exhausted bounded attempts: '+name)

    def complete(self,final):
        self.state.update(status='completed',final=str(final))
        self.save()
