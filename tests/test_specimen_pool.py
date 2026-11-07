"""Source-only form retries and versioned specimen exchange on synthetic data."""
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from PIL import Image,ImageDraw
from ocr_pool import convert_documents
from form_pool.sample_collection import extract_sample_collections
from form_pool.retry import apply_cell_retries
from form_pool.geometry import table_quad,rectified_rules
from form_pool.prepare_ink_retry import ink_boxes
from form_pool.integrate import integrate
from registry_pool.dictionary import build_dictionary
from registry_pool.exchange import build_bundle,verify_bundle,convert_candidate
from registry_pool.schema import validate_package
from registry_pool.store import Registry
from registry_review import ReviewStore
from registry_review.server import ReviewApplication
from scripts.export_pool_sqlite import export_pool

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
DICTIONARY=build_dictionary(CATALOG)
HEADER='Sample type\tTime of collection\tAmount collected\tCell conc. (cell/mL)\tCell loaded on chip\tNote\n'
BODY='☑ Blood\t10:30 0510812026\t10 mL\t\t\t\n☑ Stool\t0510812026\t0.1. sample\t\t\t\n☐ Others, specify: skin\t\t\t\t\t'


def form():
    return extract_sample_collections([dict(document_id='S',input_sha256='a'*64,
        tables=[dict(table_id='F',raw=HEADER+BODY,format='auto')])],date_order='DMY')


def cell(pool,sample_type,attribute,raw,**overrides):
    sample=next(c for c in pool['candidates'] if c['sample_type']==sample_type)
    ev=next(e for e in pool['evidence'] if e['evidence_id']==sample['evidence_ids'][0])
    layout=dict(method='source_sample_form_ruled_cell',parent_sample_candidate_id=sample['sample_candidate_id'],
        parent_table_id=ev['table_id'],parent_raw_sha256=ev['table_sha256'],
        parent_row_index_0based=ev['row_index_0based'],attribute=attribute)
    layout.update(overrides)
    return dict(table_id=sample_type+'-'+attribute+'-'+hashlib.sha256(raw.encode()).hexdigest()[:8],raw=raw,
        region={'layout':layout},generation_status='ok',truncated=False,purpose='sample_form_retry')


def reread(base,*cells):
    return apply_cell_retries(base,[dict(document_id='S',input_sha256='a'*64,text_regions=list(cells))])


class SourceRetryTests(unittest.TestCase):
    def test_integer_retry_uses_same_cell_unit_and_keeps_original(self):
        base=form()
        result=reread(base,cell(base,'stool','amount','01'))
        sample=next(c for c in result['candidates'] if c['sample_type']=='stool')
        self.assertEqual(sample['amount']['numeric_value'],'1')
        self.assertEqual(sample['amount']['unit_raw'],'sample')
        self.assertEqual(sample['original_values']['amount']['raw'],'0.1. sample')
        self.assertEqual(len(sample['evidence_ids']),2)
        self.assertTrue(result['retry_decisions'][0]['accepted'])
        self.assertIsNone(base['candidates'][1]['amount']['numeric_value'])

    def test_date_retry_does_not_borrow_or_replace_time(self):
        base=form()
        result=reread(base,cell(base,'stool','collection_datetime','05/08/2026'),
            cell(base,'blood','collection_datetime','05/08/2026'))
        blood,stool=result['candidates'][:2]
        self.assertEqual(blood['collection_datetime']['time'],'10:30')
        self.assertIsNone(stool['collection_datetime']['time'])
        self.assertEqual(stool['collection_datetime']['date'],'2026-08-05')
        self.assertEqual(stool['original_values']['collection_datetime']['date_raw'],'0510812026')

    def test_invalid_or_conflicting_date_retries_remain_missing(self):
        base=form()
        for raws in [('0510812026',),('05/08/2026','06/08/2026'),('11:30 05/08/2026',)]:
            result=reread(base,*[cell(base,'blood','collection_datetime',r) for r in raws])
            self.assertIsNone(result['candidates'][0]['collection_datetime']['date'])
            self.assertEqual(result['candidates'][0]['collection_datetime']['time'],'10:30')
            self.assertTrue(all(not d['accepted'] for d in result['retry_decisions']))
        result=reread(base,cell(base,'stool','collection_datetime','10:30 05/08/2026'),
            cell(base,'stool','collection_datetime','11:30 05/08/2026'))
        self.assertIsNone(result['candidates'][1]['collection_datetime']['date'])
        self.assertIsNone(result['candidates'][1]['collection_datetime']['time'])

    def test_existing_amount_is_preserved_even_if_retry_reads_different_number(self):
        base=form()
        result=reread(base,cell(base,'blood','amount','11 mL'))
        self.assertEqual(result['candidates'][0]['amount'],base['candidates'][0]['amount'])
        self.assertFalse(result['retry_decisions'][0]['accepted'])

    def test_retry_lineage_cannot_cross_candidate_row_hash_or_source(self):
        base=form()
        for override in [dict(parent_sample_candidate_id='unknown'),dict(parent_table_id='WRONG'),
                         dict(parent_raw_sha256='b'*64),dict(parent_row_index_0based=99)]:
            with self.subTest(override=override),self.assertRaises(ValueError):
                reread(base,cell(base,'stool','amount','01',**override))
        doc=dict(document_id='OTHER',input_sha256='a'*64,text_regions=[cell(base,'stool','amount','01')])
        with self.assertRaises(ValueError):
            apply_cell_retries(base,[doc])

    def test_truncated_retry_never_supplies_values(self):
        base=form()
        retry=cell(base,'stool','amount','01')
        retry['truncated']=True
        result=reread(base,retry)
        self.assertIsNone(result['candidates'][1]['amount']['numeric_value'])
        self.assertEqual(result['retry_decisions'][0]['reason'],'incomplete_retry')

    def test_blue_ink_bounds_do_not_modify_source_pixels(self):
        source=Image.new('RGB',(160,80),'white')
        draw=ImageDraw.Draw(source)
        draw.line((2,3,157,3),fill='black',width=2)
        draw.rectangle((30,25,80,50),fill=(20,30,130))
        before=source.tobytes()
        boxes=ink_boxes(source)
        self.assertEqual(len(boxes),1)
        self.assertEqual(boxes[0],[25,20,86,56])
        self.assertEqual(source.tobytes(),before)
        self.assertEqual(ink_boxes(Image.new('RGB',(160,80),'black')),[])

    def test_source_grid_requires_six_columns_and_outer_row_rules(self):
        im=Image.new('RGB',(1000,500),'white')
        draw=ImageDraw.Draw(im)
        for x in [10,210,360,520,680,840,990]:
            draw.line((x,10,x,490),fill='black',width=3)
        for y in [10,90,280,350,420,490]:
            draw.line((10,y,990,y),fill='black',width=3)
        quad,_=table_quad(im)
        from ocr_pool.regions import prepare_region
        rect,_=prepare_region(im,dict(source_quad_xy=quad))
        rows,cols=rectified_rules(rect)
        self.assertEqual(len(cols),7)
        self.assertEqual(len(rows),6)
        self.assertLess(abs(quad[0][0]-10),4)
        with self.assertRaises(ValueError):
            table_quad(Image.new('RGB',(1000,500),'white'))


class SpecimenExchangeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        run=self.root/'clinical'
        (run/'raw').mkdir(parents=True)
        (run/'crops').mkdir()
        image=Image.new('RGB',(900,400),'white')
        ImageDraw.Draw(image).text((20,20),'SYNTHETIC SOURCE FORM',fill='black')
        image.save(self.root/'source.png')
        sha=hashlib.sha256((self.root/'source.png').read_bytes()).hexdigest()
        raw={'T':'Test\tResult\tUnit\nC3\t0.65\tg/L','F':HEADER+BODY}
        doc=dict(document_id='S',input_path='source.png',input_sha256=sha,
            tables=[dict(table_id=k,raw=v,format='auto',region={'bbox_xyxy':[0,0,900,400]}) for k,v in raw.items()],text_regions=[])
        candidate=convert_documents([doc],CATALOG)
        for key,value in raw.items():
            (run/'raw'/(key+'.txt')).write_text(value,encoding='utf-8')
            image.save(run/'crops'/(key+'.png'))
        (run/'candidate-pool.json').write_text(json.dumps(candidate),encoding='utf-8')
        (run/'ocr-tables.json').write_text(json.dumps(dict(documents=[doc])),encoding='utf-8')
        self.pool,_=integrate(run,self.root/'integrated')
        self.package=build_bundle(self.root/'integrated',self.root/'bundle',DICTIONARY,self.root,package_id='SPECIMEN-TEST')
        self.registry=Registry(self.root/'registry.sqlite')

    def tearDown(self):
        self.registry.close()
        self.tmp.cleanup()

    def test_versioned_extension_preserves_clinical_catalog_and_stores_specimens(self):
        self.assertEqual(self.package['schema_version'],'lupus-pool-exchange-1.1')
        self.assertEqual(len(self.package['fields']),261)
        self.assertEqual(len(self.package['observations']),1)
        self.assertEqual(len(self.package['specimen_candidates']),3)
        self.assertEqual(self.registry.import_package(self.package,DICTIONARY)['status'],'imported')
        self.assertEqual(self.registry.import_package(self.package,DICTIONARY)['status'],'already_imported')
        self.assertEqual(self.registry.db.execute('SELECT COUNT(*) FROM specimen_candidates').fetchone()[0],3)
        self.assertEqual(self.registry.db.execute('SELECT COUNT(*) FROM specimen_evidence').fetchone()[0],3)
        self.assertEqual(self.registry.integrity()['foreign_key_errors'],[])
        for sample in self.package['specimen_candidates']:
            self.assertFalse(sample['source_data']['eligible_for_verified_pool'])
            self.assertEqual(sample['source_data']['review_status'],'pending')

    def test_revision_shares_exact_source_entities_and_never_merges_sample_rows(self):
        self.registry.import_package(self.package,DICTIONARY)
        second=copy.deepcopy(self.package)
        second.update(revision=2,supersedes={'package_id':'SPECIMEN-TEST','revision':1})
        self.registry.import_package(second,DICTIONARY)
        self.assertEqual(self.registry.db.execute('SELECT COUNT(*) FROM specimen_candidates').fetchone()[0],3)
        self.assertEqual(self.registry.db.execute('SELECT COUNT(*) FROM package_specimens').fetchone()[0],6)
        with self.assertRaises(sqlite3.IntegrityError):
            self.registry.db.execute('DELETE FROM specimen_candidates')
        self.registry.db.rollback()

    def test_retry_runtime_metadata_is_portable_and_cannot_be_dropped(self):
        retry=self.root/'synthetic-retry'
        (retry/'raw').mkdir(parents=True)
        (retry/'crops').mkdir()
        doc=json.loads((self.root/'clinical/ocr-tables.json').read_text(encoding='utf-8'))['documents'][0]
        saved=dict(doc,tables=[],text_regions=[])
        for name,value in [('ocr-tables.json',dict(documents=[saved])),
                           ('run.json',dict(source_kind='synthetic_test',status='completed')),
                           ('measurements.json',[])]:
            (retry/name).write_text(json.dumps(value),encoding='utf-8')
        integrated=self.root/'runtime-integrated'
        integrate(self.root/'clinical',integrated,[retry])
        bundle=self.root/'runtime-bundle'
        package=build_bundle(integrated,bundle,DICTIONARY,self.root)
        record=package['source_run']['provenance']['specimen_extension']['retry_artifacts'][0]
        self.assertEqual(len(record['artifacts']),3)
        for key,checksum in record['artifacts'].items():
            target=bundle/'artifacts'/key
            self.assertTrue(target.is_file())
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(),checksum)
        key='artifacts/specimen-retries/1/run.json'
        package['assets']=[a for a in package['assets'] if a['key']!=key]
        (bundle/'package.json').write_text(json.dumps(package),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'retry provenance asset'):
            verify_bundle(bundle,DICTIONARY)

    def test_invalid_specimen_semantics_and_links_are_rejected(self):
        for mutate in [
            lambda p:p['specimen_candidates'][0]['source_data'].update(checkbox_state='unchecked'),
            lambda p:p['specimen_candidates'][0]['source_data'].update(clinical_field_id='IMM01'),
            lambda p:p['specimen_candidates'][0]['source_data'].update(eligible_for_verified_pool=True),
            lambda p:p['specimen_candidates'][0]['source_data'].update(source_document_sha256='b'*64),
            lambda p:p['specimen_candidates'][0]['source_data']['collection_datetime'].update(date='2026-99-99'),
            lambda p:p['specimen_candidates'][0]['source_data']['collection_datetime'].update(date='2026-08-05'),
            lambda p:p['specimen_candidates'][0]['source_data']['collection_datetime'].update(time='11:30'),
            lambda p:p['specimen_candidates'][0]['source_data']['amount'].update(numeric_value='NaN'),
            lambda p:p['specimen_candidates'][1]['source_data']['amount'].update(numeric_value='0.1'),
            lambda p:p['specimen_candidates'][0].update(evidence_ids=['unknown']),
            lambda p:p['specimen_candidates'].append(copy.deepcopy(p['specimen_candidates'][0])),
        ]:
            package=copy.deepcopy(self.package)
            mutate(package)
            with self.assertRaises(ValueError):
                validate_package(package,DICTIONARY)

    def test_bad_content_id_rolls_back_every_source_and_specimen_insert(self):
        package=copy.deepcopy(self.package)
        package['specimen_candidates'][1]['sample_id']='sample-invalid'
        with self.assertRaisesRegex(ValueError,'entity ID'):
            self.registry.import_package(package,DICTIONARY)
        self.assertEqual(self.registry.integrity()['packages'],0)
        self.assertEqual(self.registry.db.execute('SELECT COUNT(*) FROM specimen_candidates').fetchone()[0],0)
        self.assertEqual(self.registry.integrity()['audit_events'],0)

    def test_bundle_verification_checks_form_raw_and_sqlite_has_relational_samples(self):
        self.assertEqual(verify_bundle(self.root/'bundle',DICTIONARY),self.package)
        target=self.root/'candidate.sqlite'
        export_pool(self.pool,target)
        db=sqlite3.connect(target)
        try:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM specimen_candidates').fetchone()[0],3)
            self.assertEqual(db.execute('SELECT collection_time FROM specimen_candidates WHERE sample_type="stool"').fetchone()[0],None)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        finally:
            db.close()
        (self.root/'bundle/artifacts/raw/F.txt').write_text('altered',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'asset'):
            verify_bundle(self.root/'bundle',DICTIONARY)

    def test_altered_crop_manifest_does_not_conceal_source_pixel_disagreement(self):
        crop_path=self.root/'bundle/artifacts/crops/F.png'
        changed=Image.new('RGB',(900,400),'red')
        changed.save(crop_path)
        package=copy.deepcopy(self.package)
        asset=next(a for a in package['assets'] if a['key']=='artifacts/crops/F.png')
        asset.update(size=crop_path.stat().st_size,sha256=hashlib.sha256(crop_path.read_bytes()).hexdigest())
        (self.root/'bundle/package.json').write_text(json.dumps(package),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'source image transform'):
            verify_bundle(self.root/'bundle',DICTIONARY)

    def test_review_api_exposes_pending_specimen_sources_without_approving_them(self):
        self.registry.import_package(self.package,DICTIONARY)
        app=ReviewApplication(self.root/'registry.sqlite',[self.root/'bundle'])
        store=ReviewStore(self.root/'registry.sqlite')
        try:
            view=app.package_view(store,'SPECIMEN-TEST',1)
            self.assertEqual(len(view['specimen_candidates']),3)
            self.assertTrue(all(s['source_data']['review_status']=='pending' for s in view['specimen_candidates']))
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM review_decisions').fetchone()[0],0)
            sample=view['specimen_candidates'][0]
            self.assertIn('F.png',sample['evidence'][0]['crop_url'])
            image,kind=app.asset('SPECIMEN-TEST',1,'artifacts/crops/F.png')
            self.assertTrue(image.startswith(b'\x89PNG'))
            self.assertEqual(kind,'image/png')
        finally:
            store.close()


if __name__=='__main__':
    unittest.main()
