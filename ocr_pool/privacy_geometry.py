"""Source-only structure checks for local privacy proposals; no text recognition."""
import hashlib
import math


def text_ink_band(image, box):
    """Tighten a loose OCR box only around a separated, unclipped text band."""
    if image is None:
        return None
    import cv2
    import numpy as np
    gray = cv2.cvtColor(np.asarray(image.crop(box).convert('RGB')),cv2.COLOR_RGB2GRAY)
    _, ink = cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    # Long rules are not characters; a rule must not join neighboring rows.
    rules = cv2.morphologyEx(ink,cv2.MORPH_OPEN,np.ones((1,max(12,gray.shape[1]//2)),np.uint8))
    ink = cv2.subtract(ink,rules)
    occupied = (ink > 0).sum(axis=1) >= max(2,gray.shape[1]*.015)
    edges = np.diff(np.r_[False,occupied,False].astype('int8'))
    bands = list(zip(np.flatnonzero(edges == 1),np.flatnonzero(edges == -1)))
    bands = [(a,b) for a,b in bands if b-a >= .25*gray.shape[0]
             and a >= 2 and b <= gray.shape[0]-2
             and abs((a+b)/2-gray.shape[0]/2) < .3*gray.shape[0]
             and (ink[a:b]>0).any(axis=0).sum() >= .65*gray.shape[1]]
    if len(bands) != 1:
        return None
    a,b = bands[0]
    return [box[0],int(box[1]+a),box[2],int(box[1]+b)]


def blue_ink_bounds(image, region):
    """Bound signing ink; reject a search window that cuts through the ink."""
    if image is None:
        return None
    import numpy as np
    rgb = np.asarray(image.crop(region).convert('RGB')).astype('int16')
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    ys, xs = np.nonzero((blue-red >= 13) & (blue-green >= 4) & (red < 205))
    if len(xs) < 32 or xs.min() == 0 or ys.min() == 0 or xs.max() == rgb.shape[1]-1 or ys.max() == rgb.shape[0]-1:
        return None
    return [int(xs.min()+region[0]), int(ys.min()+region[1]),
            int(xs.max()+region[0]+1), int(ys.max()+region[1]+1)]


def vertical_segments(image):
    import cv2
    import numpy as np
    gray=cv2.cvtColor(np.asarray(image.convert('RGB')),cv2.COLOR_RGB2GRAY)
    binary=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,31,15)
    side=min(image.size)
    found=cv2.HoughLinesP(binary,1,np.pi/1800,threshold=max(30,round(side*.023)),
                          minLineLength=side*.04,maxLineGap=side*.02)
    result=[]
    if found is None:return result
    for x0,y0,x1,y1 in np.asarray(found).reshape(-1,4):
        dx=x1-x0;dy=y1-y0
        if abs(dy)<side*.06 or abs(dx)>abs(dy)*.10:continue
        ys=np.arange(min(y0,y1),max(y0,y1)+1)
        xs=np.rint(x0+(ys-y0)*dx/dy).astype(int)
        coverage=np.stack([binary[ys,np.clip(xs+off,0,image.width-1)]>0 for off in (-2,-1,0,1,2)]).any(axis=0).mean()
        if coverage>=.80:result.append([int(x0),int(y0),int(x1),int(y1)])
    return result


def inspect_barcodes(image):
    """Keep decoding evidence. An OpenCV rectangle alone never warrants masking."""
    import cv2
    import numpy as np
    import zxingcpp
    array=cv2.cvtColor(np.asarray(image.convert('RGB')),cv2.COLOR_RGB2BGR);result=[]
    for code in zxingcpp.read_barcodes(array,try_rotate=True,try_downscale=True,return_errors=True):
        points=[code.position.top_left,code.position.top_right,code.position.bottom_right,code.position.bottom_left]
        result.append(dict(box=[min(p.x for p in points),min(p.y for p in points),max(p.x for p in points),max(p.y for p in points)],
                           source='zxingcpp',decoded=bool(code.valid),valid=bool(code.valid),format=str(code.format),
                           payload_sha256=hashlib.sha256(code.bytes).hexdigest() if code.valid else None))
    found,points=cv2.barcode_BarcodeDetector().detect(array)
    if found and points is not None:
        for quad in np.asarray(points).reshape(-1,4,2):
            box=[math.floor(quad[:,0].min()),math.floor(quad[:,1].min()),math.ceil(quad[:,0].max()),math.ceil(quad[:,1].max())]
            gray=cv2.cvtColor(array,cv2.COLOR_BGR2GRAY)
            x0,y0,x1,y1=box;roi=gray[max(0,y0):min(image.height,y1),max(0,x0):min(image.width,x1)]
            if roi.size:
                _,ink=cv2.threshold(roi,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
                # Long, repeated vertical bars create many supported columns.
                support=(ink>0).mean(axis=0)>.65
                runs=sum(bool(support[i]) and (i==0 or not support[i-1]) for i in range(len(support)))
            else:runs=0
            result.append(dict(box=box,source='opencv',decoded=False,valid=False,
                               structural_assessment='parallel_bar_candidate' if runs>=12 else 'insufficient_parallel_bars',
                               supported_bar_runs=runs))
    return result
