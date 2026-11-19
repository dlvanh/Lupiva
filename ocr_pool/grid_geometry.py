"""Grid-based crop refinement using detected polygons and source pixels only."""
import math


def ordered_quad(points):
    import cv2
    import numpy as np
    points = np.asarray(points, dtype=np.float32)
    hull = cv2.convexHull(points.reshape(-1, 1, 2))
    quad = None
    for fraction in (0.015, 0.025, 0.04, 0.06):
        approx = cv2.approxPolyDP(hull, cv2.arcLength(hull, True) * fraction, True).reshape(-1, 2)
        if len(approx) == 4:
            quad = approx
            break
    if quad is None:
        quad = cv2.boxPoints(cv2.minAreaRect(points))
    # Sorting around the centroid avoids ambiguous x+y ties on rotated quads.
    center = quad.mean(axis=0)
    quad = sorted(quad.tolist(), key=lambda p: math.atan2(p[1] - center[1], p[0] - center[0]))
    start = min(range(4), key=lambda i: sum(quad[i]))
    return quad[start:] + quad[:start]


def clusters(indices, distance=4):
    groups = []
    for index in indices:
        if not groups or index > groups[-1][-1] + distance:
            groups.append([index])
        else:
            groups[-1].append(index)
    return [sum(g) / len(g) for g in groups]


def refine_table(image, detection, panel, *, assay_grid=True):
    import cv2
    import numpy as np
    quad = np.asarray(ordered_quad(detection['polygon_xy']), dtype=np.float32)
    quad[:, 0] = np.clip(quad[:, 0], 0, image.width)
    quad[:, 1] = np.clip(quad[:, 1], 0, image.height)
    width = round(max(np.linalg.norm(quad[1] - quad[0]), np.linalg.norm(quad[2] - quad[3])))
    height = round(max(np.linalg.norm(quad[3] - quad[0]), np.linalg.norm(quad[2] - quad[1])))
    if min(width, height) < 50:
        raise ValueError('Detected table too small to refine')
    target = np.asarray([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
    transform = cv2.getPerspectiveTransform(quad, target)
    gray = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY)
    rectified = cv2.warpPerspective(gray, transform, (width, height), borderValue=255)
    binary = cv2.adaptiveThreshold(rectified, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15)
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((1, max(25, width // 7)), np.uint8))
    row_samples = list(np.flatnonzero((horizontal > 0).sum(axis=1) > width * 0.35))
    lines = cv2.HoughLinesP(binary, 1, np.pi / 1800, threshold=120,
                            minLineLength=width * 0.25, maxLineGap=25)
    if lines is not None:
        for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
            if abs(x2 - x1) > 0 and abs(y2 - y1) < abs(x2 - x1) * 0.10:
                y = y1 + (width / 2 - x1) * (y2 - y1) / (x2 - x1)
                if 0 <= y < height:
                    row_samples.append(round(y))
    rows = clusters(sorted(row_samples), distance=6)
    left, top, right, bottom = 0, 0, width - 1, height - 1
    info = dict(rectified_size=[width, height], horizontal_lines=rows)
    if panel in {'ana_profile_23', 'myositis', 'antibody_grid'} and assay_grid:
        # Find the longest run of regularly ruled rows. The strip diagram above
        # the assay grid and its broad graphic column are not result columns.
        best = []
        for start in range(len(rows) - 5):
            run = [rows[start], rows[start + 1]]
            spacing = run[1] - run[0]
            if spacing < 12:
                continue
            for y in rows[start + 2:]:
                if 0.6 * spacing <= y - run[-1] <= 1.4 * spacing:
                    run.append(y)
                else:
                    break
            if len(run) > len(best):
                best = run
        if len(best) < 7:
            raise ValueError('No stable assay row grid; keep for review')
        # Never end at the detected regular run: a faint rule/graphic bar can
        # interrupt it while more assay rows continue below.
        top, bottom = max(0, best[0] - 4), height - 1
        body = binary[round(top):round(bottom)]
        vertical = cv2.morphologyEx(body, cv2.MORPH_OPEN, np.ones((max(20, len(body) // 4), 1), np.uint8))
        col_samples = list(np.flatnonzero((vertical > 0).sum(axis=0) > len(body) * 0.5))
        vlines = cv2.HoughLinesP(body, 1, np.pi / 1800, threshold=100,
                                minLineLength=len(body) * 0.6, maxLineGap=12)
        if vlines is not None:
            for x1, y1, x2, y2 in np.asarray(vlines).reshape(-1, 4):
                if abs(y2 - y1) > 0 and abs(x2 - x1) < abs(y2 - y1) * 0.1:
                    ys = np.arange(max(0, min(y1, y2)), min(len(body), max(y1, y2) + 1))
                    xs = np.rint(x1 + (ys - y1) * (x2 - x1) / (y2 - y1)).astype(int)
                    coverage = np.stack([body[ys, np.clip(xs + offset, 0, width - 1)] > 0
                                         for offset in (-2, -1, 0, 1, 2)]).any(axis=0).mean()
                    if coverage < 0.85:
                        continue
                    x = x1 + (len(body) / 2 - y1) * (x2 - x1) / (y2 - y1)
                    if 0 <= x < width:
                        col_samples.append(round(x))
        cols = clusters(sorted(col_samples), distance=8)
        info['vertical_lines'] = cols
        internal = [x for x in cols if width * 0.05 < x < width * 0.8]
        if len(internal) < 3:
            raise ValueError('Cannot establish three assay columns; keep for review')
        right = internal[2] + 5
        if not width * 0.25 < right < width * 0.7:
            raise ValueError('Uncertain assay/graphic division')
    elif panel == 'pft':
        if len(rows) < 10:
            raise ValueError('No stable PFT grid')
        gaps = np.diff(rows)
        typical = float(np.median(gaps))
        large = [i for i, gap in enumerate(gaps[:max(1, len(gaps) // 3)]) if gap > typical * 2.2]
        if large:
            top = max(0, rows[large[0] + 1] - 4)
    elif panel not in {'ana_profile_23', 'myositis'}:
        raise ValueError('No supported grid refinement for explicit panel')
    rect = np.asarray([[[left, top], [right, top], [right, bottom], [left, bottom]]], dtype=np.float32)
    source_quad = cv2.perspectiveTransform(rect, np.linalg.inv(transform))[0]
    source_quad[:, 0] = np.clip(source_quad[:, 0], 0, image.width)
    source_quad[:, 1] = np.clip(source_quad[:, 1], 0, image.height)
    info['rectified_roi_xyxy'] = [left, top, right, bottom]
    return source_quad.tolist(), info
