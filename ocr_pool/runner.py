"""Shared commands and publication stages for local candidate workflows."""
from pathlib import Path
import shutil
import sys

from .workflow import read,sha


def fingerprints(root):
    root=Path(root)
    paths=[p for folder in ('scripts','ocr_pool','registry_pool','form_pool')
           for p in (root/folder).glob('*.py')]
    paths+=list((root/'schemas').glob('*.json'))
    code={p.relative_to(root).as_posix():sha(p) for p in sorted(paths)}
    models={p.relative_to(root).as_posix():sha(p)
            for folder in ('SenOCR-Vi','PP-DocLayoutV3')
            for p in sorted((root/'models'/folder).iterdir()) if p.is_file()}
    if not any(k.endswith('.safetensors') for k in models):
        raise ValueError('Local model weights missing')
    return dict(code=code,models=models,python=sys.executable)


class RunnerStages:
    def __init__(self,flow,root):
        self.flow,self.root=flow,Path(root)

    def script_command(self,script,*args):
        return [sys.executable,'-X','utf8',str(self.root/'scripts'/script),*map(str,args)]

    def script(self,name,script,args,output='out',*,skip=False):
        folder=self.flow.stage(name,
            lambda f:self.script_command(script,*args,'--output',f/output),
            lambda f:[f/output],skip=skip)
        return folder/output if folder else None

    def module(self,name,module,args,output='out',*,skip=False):
        folder=self.flow.stage(name,
            lambda f:[sys.executable,'-X','utf8','-m',module,*map(str,args),'--output',str(f/output)],
            lambda f:[f/output],skip=skip)
        return folder/output if folder else None

    def recognize(self,name,manifest,*,max_new_tokens=2048):
        applicable=manifest and any(d.get('regions') for d in read(manifest)['documents'])
        return self.script(name,'recognize_regions.py',
            ['--manifest',manifest,'--max-new-tokens',max_new_tokens],skip=not applicable)

    def publish(self,run,*,start):
        sqlite=self.script(f'{start:02d}-sqlite','export_pool_sqlite.py',
            [run/'candidate-pool.json'],output='candidate-pool.sqlite')
        published=run/'candidate-pool.sqlite'
        if published.exists():
            if sha(published)!=sha(sqlite):
                raise ValueError('Published SQLite differs from the verified stage output')
        else:
            shutil.copy2(sqlite,published)
        self.flow.stage(f'{start+1:02d}-review',
            lambda f:self.script_command('render_pool_review.py',run),lambda f:[run/'review.html'])
        return self.script(f'{start+2:02d}-bundle','manage_pool.py',['bundle','--run',run])
