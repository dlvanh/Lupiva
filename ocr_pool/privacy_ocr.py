"""Fresh local OCR for reviewable image crops; never calls a remote model."""
import math
from pathlib import Path

MODEL_FILES = ('ch_PP-OCRv5_det_mobile.onnx', 'latin_PP-OCRv5_rec_mobile.onnx',
               'ch_ppocr_mobile_v2.0_cls_mobile.onnx')


def analyze(image, models):
    import cv2
    import numpy as np
    from rapidocr import RapidOCR, EngineType, LangDet, LangRec, ModelType, OCRVersion
    from .privacy_geometry import inspect_barcodes, vertical_segments
    from .privacy_proposal import propose, collection_headers

    models = Path(models)
    if any(not (models / name).is_file() for name in MODEL_FILES):
        raise ValueError('Local privacy OCR models are missing')
    engine = RapidOCR(params={
        'Global.model_root_dir': str(models), 'Global.log_level': 'warning',
        'Global.text_score': .35, 'Global.max_side_len': 2400, 'Global.use_cls': True,
        'Det.engine_type': EngineType.ONNXRUNTIME, 'Det.lang_type': LangDet.CH,
        'Det.model_type': ModelType.MOBILE, 'Det.ocr_version': OCRVersion.PPOCRV5,
        'Det.limit_side_len': 1280, 'Det.limit_type': 'max',
        'Rec.engine_type': EngineType.ONNXRUNTIME, 'Rec.lang_type': LangRec.LATIN,
        'Rec.model_type': ModelType.MOBILE, 'Rec.ocr_version': OCRVersion.PPOCRV5,
        'Det.model_path': str(models / MODEL_FILES[0]),
        'Rec.model_path': str(models / MODEL_FILES[1]),
        'Cls.model_path': str(models / MODEL_FILES[2]),
        'EngineConfig.onnxruntime.intra_op_num_threads': 4,
        'EngineConfig.onnxruntime.inter_op_num_threads': 1,
        'EngineConfig.onnxruntime.use_cuda': False,
    })
    result = engine(cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR))
    lines = []
    if result.boxes is not None:
        for i, (box, text, score) in enumerate(zip(result.boxes, result.txts, result.scores)):
            bounds = [max(0, math.floor(box[:, 0].min())), max(0, math.floor(box[:, 1].min())),
                      min(image.width, math.ceil(box[:, 0].max())), min(image.height, math.ceil(box[:, 1].max()))]
            if bounds[0] < bounds[2] and bounds[1] < bounds[3]:
                lines.append(dict(line_id=i, text=text, confidence=float(score), box=bounds))
    codes = inspect_barcodes(image)
    grid = vertical_segments(image) if collection_headers(lines) else []
    return propose(lines, codes, image.size, vertical_segments=grid, image=image), lines
