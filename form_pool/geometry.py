"""Source-rule geometry for sample forms. No reference coordinates or values."""
from statistics import median

from ocr_pool.grid_geometry import clusters


def _groups(items,distance=8):
    groups=[]
    for value,slope in sorted(items):
        if not groups or value-groups[-1][-1][0]>distance:
            groups.append([])
        groups[-1].append((value,slope))
    return [(median(p[0] for p in g),median(p[1] for p in g)) for g in groups]


def table_quad(crop):
    """Intersect outer long rules; require the six-column collection grid."""
    import cv2
    import numpy as np
    gray=np.asarray(crop.convert('L'))
    h,w=gray.shape
    binary=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,31,15)
    lines=cv2.HoughLinesP(binary,1,np.pi/1800,70,minLineLength=w*.65,maxLineGap=25)
    horizontal=[]
    for x1,y1,x2,y2 in [] if lines is None else lines.reshape(-1,4):
        if abs(x2-x1)>0 and abs(y2-y1)<abs(x2-x1)*.08:
            slope=(y2-y1)/(x2-x1)
            horizontal.append((y1+(w/2-x1)*slope,slope))
    rows=_groups(horizontal)
    if len(rows)<5:
        raise ValueError('No stable full-width sample form row rules')
    lines=cv2.HoughLinesP(binary,1,np.pi/1800,60,minLineLength=h*.23,maxLineGap=15)
    vertical=[]
    for x1,y1,x2,y2 in [] if lines is None else lines.reshape(-1,4):
        if abs(y2-y1)>0 and abs(x2-x1)<abs(y2-y1)*.08:
            slope=(x2-x1)/(y2-y1)
            vertical.append((x1+(h/2-y1)*slope,slope))
    cols=_groups(vertical)
    if len(cols)!=7 or any(cols[i+1][0]-cols[i][0]<w*.075 for i in range(6)):
        raise ValueError('Cannot establish exactly six source form columns')

    def intersection(horizontal,vertical):
        ymid,yslope=horizontal
        xmid,xslope=vertical
        yintercept=ymid-yslope*w/2
        xintercept=xmid-xslope*h/2
        y=(yslope*xintercept+yintercept)/(1-yslope*xslope)
        x=xslope*y+xintercept
        if not (-4<=x<=w+4 and -4<=y<=h+4):
            raise ValueError('Outer rule intersection escapes source crop')
        return [min(w,max(0,float(x))),min(h,max(0,float(y)))]
    quad=[intersection(rows[0],cols[0]),intersection(rows[0],cols[-1]),
          intersection(rows[-1],cols[-1]),intersection(rows[-1],cols[0])]
    return quad,dict(horizontal_rules=rows,vertical_rules=cols)


def rectified_rules(crop):
    import cv2
    import numpy as np
    gray=np.asarray(crop.convert('L'))
    h,w=gray.shape
    binary=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,31,15)
    horizontal=cv2.morphologyEx(binary,cv2.MORPH_OPEN,np.ones((1,max(25,w//3)),np.uint8))
    vertical=cv2.morphologyEx(binary,cv2.MORPH_OPEN,np.ones((max(25,h//4),1),np.uint8))
    rows=clusters(list(np.flatnonzero((horizontal>0).sum(axis=1)>w*.7)),6)
    cols=clusters(list(np.flatnonzero((vertical>0).sum(axis=0)>h*.4)),8)
    # Outer rules can be clipped by rectification; bounds are known outer
    # rule intersections, so their coordinates are not inferred from values.
    rows=[0]+[round(y) for y in rows if 6<y<h-6]+[h]
    cols=[0]+[round(x) for x in cols if 8<x<w-8]+[w]
    if len(cols)!=7 or len(rows)<6 or rows[1]>h*.3:
        raise ValueError('Rectified form rules do not establish header/body columns')
    return rows,cols
