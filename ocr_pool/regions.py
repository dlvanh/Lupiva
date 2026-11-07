"""Source-only image crops, with a reversible description of their provenance."""
import math


def spec_from_provenance(provenance):
    """Reconstruct only recorded source transforms; never guess coordinates."""
    if provenance.get('method') == 'transformed_source_parts':
        return dict(parent_region=spec_from_provenance(provenance['parent']),
                    crop_parts=provenance['crop_parts'])
    if 'source_quad_xy' in provenance:
        return dict(source_quad_xy=provenance['source_quad_xy'])
    if 'bbox_xyxy' in provenance:
        return dict(bbox_xyxy=provenance['bbox_xyxy'])
    if provenance.get('method') == 'source_header_and_section_stack':
        return dict(parts=[dict(bbox_xyxy=p['source_bbox_xyxy'],role=p['role']) for p in provenance['parts']])
    raise ValueError('Unsupported recorded source transform')


def prepare_region(image, spec):
    from PIL import Image
    coordinate_space = 'exif_transposed_source_pixels'

    if 'parent_region' in spec:
        parent, parent_evidence = prepare_region(image, spec['parent_region'])
        parts = spec['crop_parts']
        crops = []
        for part in parts:
            l, t, r, b = part['bbox_xyxy']
            if not (0 <= l < r <= parent.width and 0 <= t < b <= parent.height):
                raise ValueError('Invalid rectangle in transformed parent crop')
            crops.append(parent.crop((l, t, r, b)))
        if not crops or len({c.width for c in crops}) != 1:
            raise ValueError('Transformed crop parts must have equal widths')
        result = Image.new('RGB', (crops[0].width, sum(c.height for c in crops)), 'white')
        y = 0
        for crop in crops:
            result.paste(crop, (0, y))
            y += crop.height
        return result, dict(method='transformed_source_parts', parent=parent_evidence,
                            crop_parts=parts, coordinate_space=coordinate_space)

    def rectangle(box):
        left, top, right, bottom = box
        if not (0 <= left < right <= image.width and 0 <= top < bottom <= image.height):
            raise ValueError('Invalid source rectangle')
        return image.crop(box)

    if 'parts' in spec:
        # Repeat real source headers above an isolated section. Do not invent
        # header text, remove values or rescale individual cells.
        crops = [rectangle(p['bbox_xyxy']) for p in spec['parts']]
        if not crops or len({c.width for c in crops}) != 1:
            raise ValueError('Composite parts must have equal source widths')
        result = Image.new('RGB', (crops[0].width, sum(c.height for c in crops)), 'white')
        provenance, y = [], 0
        for part, crop in zip(spec['parts'], crops):
            result.paste(crop, (0, y))
            provenance.append({'source_bbox_xyxy': part['bbox_xyxy'],
                               'crop_bbox_xyxy': [0, y, crop.width, y + crop.height],
                               'role': part['role']})
            y += crop.height
        return result, {'method': 'source_header_and_section_stack', 'parts': provenance,
                        'coordinate_space': coordinate_space}
    if 'source_quad_xy' in spec:
        quad = spec['source_quad_xy']  # upper left, upper right, lower right, lower left
        if len(quad) != 4 or any(not (0 <= x <= image.width and 0 <= y <= image.height) for x, y in quad):
            raise ValueError('Invalid source quadrilateral')
        ul, ur, lr, ll = quad
        width = round(max(math.dist(ul, ur), math.dist(ll, lr)))
        height = round(max(math.dist(ul, ll), math.dist(ur, lr)))
        if min(width, height) < 2:
            raise ValueError('Degenerate source quadrilateral')
        result = image.transform((width, height), Image.Transform.QUAD,
                                 tuple(v for point in (ul, ll, lr, ur) for v in point),
                                 resample=Image.Resampling.BICUBIC)
        return result, {'method': 'pil_quad_bilinear', 'source_quad_xy': quad,
                        'crop_size': [width, height], 'coordinate_space': coordinate_space}
    box = spec['bbox_xyxy']
    return rectangle(box), {'bbox_xyxy': box, 'coordinate_space': coordinate_space}
