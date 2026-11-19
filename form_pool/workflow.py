"""Bounded specimen extension shared by full and saved-clinical workflows."""


def extend_specimens(stages,clinical,*,start=23):
    cells=stages.module(f'{start:02d}-form-cell-regions','form_pool.prepare_retry',
        ['--ocr-run',clinical],output='manifest.json')
    cell_run=stages.recognize(f'{start+1:02d}-form-cell-ocr',cells,max_new_tokens=512)
    ink=stages.module(f'{start+2:02d}-form-ink-regions','form_pool.prepare_ink_retry',
        ['--ocr-run',cell_run],output='manifest.json',skip=cell_run is None)
    ink_run=stages.recognize(f'{start+3:02d}-form-ink-ocr',ink,max_new_tokens=512)
    args=['--run',clinical]
    for run in (cell_run,ink_run):
        if run is not None:
            args.extend(['--retry-run',run])
    return stages.module(f'{start+4:02d}-form-integrated','form_pool.integrate',args)
