"""Render four small, nonpatient tables for repeatable local OCR development."""
import csv
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'examples/pool-tests/images'


def main():
    data = json.loads((ROOT / 'examples/pool-tests/input.json').read_text(encoding='utf-8'))
    font_path = Path('C:/Windows/Fonts/arial.ttf')
    if not font_path.is_file():
        raise FileNotFoundError('Arial font not found; specify a Unicode font before rendering')
    font = ImageFont.truetype(str(font_path), 26)
    header_font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 26)
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = {'status': 'synthetic_images_only', 'documents': []}
    expected = []
    for document in data['documents'][:4]:
        raw = document['tables'][0]['raw']
        rows = list(csv.reader(io.StringIO(raw), delimiter='\t'))
        scratch = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        widths = [max(scratch.textbbox((0, 0), row[c], font=header_font if i == 0 else font)[2]
                      for i, row in enumerate(rows)) + 36 for c in range(len(rows[0]))]
        height, top, padding = 50, 70, 25
        image = Image.new('RGB', (sum(widths) + 2 * padding, top + len(rows) * height + padding), 'white')
        draw = ImageDraw.Draw(image)
        draw.text((padding, 18), 'SYNTHETIC DATA - no patient information', font=font, fill='#333333')
        for r, row in enumerate(rows):
            left = padding
            for c, cell in enumerate(row):
                box = (left, top + r * height, left + widths[c], top + (r + 1) * height)
                draw.rectangle(box, fill='#eeeeee' if r == 0 else 'white', outline='black', width=1)
                draw.text((left + 12, box[1] + 10), cell, font=header_font if r == 0 else font, fill='black')
                left += widths[c]
        target = DEST / (document['document_id'] + '.png')
        image.save(target)
        manifest['documents'].append({
            'document_id': document['document_id'], 'input_path': target.relative_to(ROOT).as_posix(),
            'context': document.get('context', {}), 'regions': [{
                'region_id': document['document_id'] + '-table',
                'bbox_xyxy': [padding - 2, top - 2, image.width - padding + 2, image.height - padding + 2],
            }],
        })
    (DEST.parent / 'regions.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Rendered four synthetic table PNGs and regions.json. No patient images read.')


if __name__ == '__main__':
    main()
