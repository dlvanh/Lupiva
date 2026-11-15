"""Novel values and table layouts: protect identifiers without erasing clinical data."""
import importlib.util
import io
import unittest
from PIL import Image, ImageDraw, ImageFont
from ocr_pool.privacy_proposal import date_mentions, propose, render,collection_headers,outgoing_review_items
from ocr_pool.privacy_geometry import vertical_segments, inspect_barcodes


def line(i,text,box,confidence=.95):
    return dict(line_id=i,text=text,box=box,confidence=confidence)


def specimen_lines(offset=0):
    return [line(0,'Sample type',[20+offset,100,120+offset,125]),
            line(1,'Time of',[160+offset,95,220+offset,115]),
            line(2,'collection',[155+offset,118,225+offset,138]),
            line(3,'Amount collected',[270+offset,100,370+offset,130]),
            line(4,'Blood',[30+offset,185,90+offset,210]),
            line(5,'07112/72X',[160+offset,170,235+offset,200],.42),
            line(6,'6.8 mL',[270+offset,170,345+offset,200]),
            line(7,'Stool',[30+offset,250,90+offset,275]),
            # Deliberately merged OCR date/amount across two neighboring cells.
            line(8,'?9/??/29 0.6 sample',[158+offset,245,370+offset,270],.4),
            line(9,'Others, specify: tissue',[20+offset,310,400+offset,335])]


class PrivacyProposalTests(unittest.TestCase):
    def test_mixed_date_uses_word_boxes_and_preserves_neighboring_result(self):
        mixed = line(10,'Date: 23/06/2032 CRP: 8.4 mg/L',[35,115,565,145])
        mixed['words'] = [dict(text=text,box=box,confidence=.98) for text,box in [
            ('Date:',[35,115,90,145]),('23/06/2032',[110,115,255,145]),
            ('CRP:',[285,115,355,145]),('8.4',[375,115,420,145]),('mg/L',[445,115,505,145])]]
        image = Image.new('RGB',(650,400),'#657483')
        plan = propose([mixed],[],image.size,image=image)
        self.assertFalse(plan['review_items'])
        mask = plan['masks'][0]
        self.assertEqual(['contextual_calendar_date_token'],mask['reasons'])
        self.assertLess(mask['box'][2],285)
        out = render(image,plan)
        self.assertEqual((255,255,255),out.getpixel((180,130)))
        self.assertEqual(image.getpixel((390,130)),out.getpixel((390,130)))
        self.assertTrue(plan['dates_local'][0]['masked_as_date_field'])
        for words in ([],mixed['words'][:-1],
                      [{**w,'confidence':.4} if w['text']=='23/06/2032' else w for w in mixed['words']]):
            with self.subTest(words=words):
                blocked = propose([{**mixed,'words':words}],[],image.size)
                self.assertIn('date_shares_line_with_other_content',[r['code'] for r in blocked['review_items']])
        conflict = line(11,'9.7',[240,130,280,155])
        self.assertTrue(propose([mixed,conflict],[],image.size)['review_items'])

    def test_date_character_tokens_short_year_and_reference_guards(self):
        mixed = line(1,'Date: 25/08/34 CRP',[25,85,400,110])
        words = [dict(text='Date:',box=[25,85,75,110],confidence=.99)]
        words += [dict(text=c,box=[100+12*i,85,110+12*i,110],confidence=.99)
                  for i,c in enumerate('25/08/34')]
        words.append(dict(text='CRP',box=[250,85,300,110],confidence=.99))
        mixed['words'] = words
        plan = propose([mixed],[],(500,300))
        self.assertFalse(plan['review_items'])
        self.assertIsNone(plan['dates_local'][0]['mentions'][0]['normalized'])
        self.assertTrue(plan['dates_local'][0]['requires_review'])
        reference = {**mixed,'text':'Reference range: 25/08/34 CRP'}
        self.assertFalse(propose([reference],[],(500,300))['masks'])
        for text in ('Date: 31/02/2034 CRP','Date: 4.7-8.9 CRP'):
            self.assertFalse(propose([{**mixed,'text':text}],[],(500,300))['masks'])

    def test_overlapping_ocr_date_boxes_need_separate_source_ink_bands(self):
        mixed = line(1,'Date: 27/09/2036 CRP',[30,118,440,174])
        mixed['words'] = [dict(text=t,box=b,confidence=c) for t,b,c in [
            ('Date:',[30,118,95,174],.6),('27/09/2036',[180,118,325,174],.99),
            ('CRP',[380,118,440,174],.98)]]
        previous = line(2,'Previous',[180,90,325,138])
        image = Image.new('RGB',(520,350),'white'); draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=22)
        draw.text((180,100),'10/08/2035',font=font,fill='black')
        draw.text((180,142),'27/09/2036',font=font,fill='black')
        plan = propose([mixed,previous],[],image.size,image=image)
        self.assertFalse(plan['review_items'])
        self.assertGreater(plan['masks'][0]['box'][1],138)
        mask_top = plan['masks'][0]['box'][1]
        self.assertEqual(image.crop((0,0,520,mask_top)).tobytes(),
                         render(image,plan).crop((0,0,520,mask_top)).tobytes())
        touching = line(3,'Clinical annotation',[180,140,325,174])
        self.assertTrue(propose([mixed,previous,touching],[],image.size,image=image)['review_items'])

    def test_unlabeled_date_token_is_masked_but_not_given_clinical_context(self):
        date = line(1,'18/12/2037 note',[45,95,350,122])
        date['words'] = [dict(text='18/12/2037',box=[45,95,190,122],confidence=.99),
                         dict(text='note',box=[250,95,305,122],confidence=.99)]
        plan = propose([date],[],(500,300))
        self.assertFalse(plan['review_items'])
        self.assertTrue(plan['dates_local'][0]['requires_review'])
        self.assertEqual(['calendar_date_token'],plan['masks'][0]['reasons'])

    def test_header_date_needs_separable_geometry_and_stays_local(self):
        title = line(1,'Spirometry - Plethysmography',[35,110,290,138])
        date = line(2,'19/07/2033',[365,110,505,138])
        date['words'] = [dict(text=date['text'],box=date['box'],confidence=.99)]
        heads = [line(3,'Pred.val.',[165,145,240,170]),line(4,'%Pre',[310,145,365,170])]
        plan = propose([title,date,*heads],[],(630,540))
        self.assertFalse(plan['review_items'])
        self.assertEqual('2033-07-19',plan['dates_local'][0]['mentions'][0]['normalized'])
        self.assertTrue(plan['masks'])
        for changed in ({**date,'words':[]},{**date,'box':[365,350,505,378]}):
            blocked = propose([title,changed,*heads],[],(630,540))
            self.assertIn('date_without_context',[r['code'] for r in blocked['review_items']])

    def test_lab_footer_ink_below_real_results_is_masked_with_margin(self):
        heads = [line(1,'Test',[40,95,130,120]),line(2,'Result',[220,95,300,120]),
                 line(3,'Unit',[360,95,405,120])]
        rows = [line(4,'Ure',[45,170,100,195]),line(5,'6.9',[235,170,280,195]),
                line(6,'CK',[45,225,100,250]),line(7,'87',[235,225,280,250])]
        signer = line(8,'Dr. Alpha Beta',[400,460,570,487])
        image = Image.new('RGB',(700,650),'#eeeeee')
        draw = ImageDraw.Draw(image)
        draw.line([(425,425),(475,399),(515,438)],fill='#1838a2',width=4)
        plan = propose([*heads,*rows,signer],[],image.size,image=image)
        self.assertFalse(plan['review_items'])
        mask = next(m for m in plan['masks'] if 'staff_signature_footer' in m['reasons'])
        self.assertGreater(mask['box'][1],250)
        self.assertLess(mask['box'][1],399)
        out = render(image,plan); top = plan['crop'][1]
        self.assertEqual((255,255,255),out.getpixel((475,399-top)))
        self.assertEqual(image.getpixel((250,180)),out.getpixel((250,180-top)))
        for changed in ([*heads,signer], [*heads,*rows,signer,line(9,'CRP 9.6 mg/L',[450,420,580,447])],
                        [*heads,*rows,{**signer,'box':[240,210,410,237]}],
                        [*heads,*rows,{**signer,'text':'Dr. Alpha Beta CRP 9.6 mg/L'}],
                        [*heads,*rows,signer,line(10,'Unknown assay',[45,510,170,536]),
                         line(11,'9.7',[235,510,280,536])]):
            with self.subTest(lines=changed):
                blocked = propose(changed,[],image.size,image=image)
                self.assertIn('staff_signature_needs_review',[r['code'] for r in blocked['review_items']])
        no_ink = propose([*heads,*rows,signer],[],image.size,image=Image.new('RGB',image.size,'white'))
        self.assertTrue(no_ink['review_items'])
        draw.line([(319,400),(380,416)],fill='#1838a2',width=4)
        self.assertTrue(propose([*heads,*rows,signer],[],image.size,image=image)['review_items'])

    def test_missing_result_header_needs_unit_reference_and_repeated_clinical_rows(self):
        heads = [line(1,'Xét nghiệm',[35,125,135,151]),line(2,'Đơn vị',[355,125,410,151]),
                 line(3,'Khoảng tham chiếu',[450,125,610,151])]
        rows = [line(4,'Ure',[40,195,100,220]),line(5,'5.6',[230,195,280,220]),
                line(6,'CK',[40,250,100,275]),line(7,'93',[230,250,280,275])]
        plan = propose([*heads,*rows],[],(680,550))
        self.assertEqual('detected_lab_table_header',plan['crop_reason'])
        self.assertEqual(109,plan['crop'][1])
        self.assertFalse(plan['review_items'])
        for changed in ([*heads,*rows[:2]], [*heads[:2],*rows],
                        [*heads,*[r for r in rows if r['line_id'] not in {4,6}]],
                        [line(1,'Result',[230,125,310,151]),line(2,'Flow volume graph',[50,180,240,210])]):
            with self.subTest(lines=changed):
                self.assertEqual('no_reliable_result_header_keep_page',propose(changed,[],(680,550))['crop_reason'])
        lost_value = outgoing_review_items([*heads,*rows],plan['crop'],[{'box':rows[1]['box']}],plan['crop_reason'])
        self.assertIn('outgoing_table_header_needs_review',[r['code'] for r in lost_value])
        extra = [*heads,*rows,line(8,'CRP',[40,305,100,330]),line(9,'7.2',[230,305,280,330])]
        lost_value = outgoing_review_items(extra,plan['crop'],[{'box':[240,200,260,215]}],plan['crop_reason'])
        self.assertIn('outgoing_result_needs_review',[r['code'] for r in lost_value])

    def test_echo_measurement_fallback_requires_ordered_sections_and_units(self):
        lines = [line(1,'SIÊU ÂM TIM, MÀNG TIM QUA THÀNH NGỰC',[180,45,630,75]),
                 line(2,'Kỹ thuật: Siêu âm tim',[55,105,330,134]),
                 line(3,'Mô tả: Thất trái',[55,145,310,173]),
                 line(4,'LVEDD 51 mm LVESD 33 mm EF 62%',[55,185,490,216]),
                 line(5,'Chức năng tâm trương',[55,285,350,314]),
                 line(6,'MV E 75 cm/s',[55,330,265,356]),
                 line(7,'Kích thước và chức năng buồng tim phải',[55,430,510,460]),
                 line(8,'TAPSE 24 mm',[55,480,250,508])]
        plan = propose(lines,[],(750,600))
        self.assertEqual('detected_echo_report_sections',plan['crop_reason'])
        self.assertEqual([0,105,750,600],plan['crop'])
        self.assertFalse(plan['review_items'])
        ocr_variant = [{**r,'text':r['text'].replace('Chức năng','Chưrc nng').replace('chức năng','chưrc nng')}
                       for r in lines]
        self.assertEqual(plan['crop'],propose(ocr_variant,[],(750,600))['crop'])
        for changed in (lines[1:],lines[:4], [r for r in lines if r['line_id'] not in {4,6,8}],
                        [*lines,line(9,'Mô tả: Trang khác',[55,520,310,548])]):
            with self.subTest(lines=changed):
                self.assertEqual('no_reliable_result_header_keep_page',propose(changed,[],(750,600))['crop_reason'])

    def test_skewed_lab_header_masks_administrative_fields_without_cutting_headings(self):
        header = [line(1,'Chỉ định',[20,121,80,144]),line(2,'Kết quả',[150,109,210,130]),
                  line(3,'Đơn vị',[245,103,286,125]),line(4,'Tham chiếu',[331,100,386,121])]
        staff = line(5,'Người nhận mẫu: CN. Tên Giả Lập',[20,88,112,117])
        label = line(6,'Giờ nhận mẫu:',[282,74,335,97])
        timestamp = line(7,'10:32 18/10/2026',[327,72,408,96])
        result = line(8,'7.58',[168,157,204,177])
        plan = propose([*header,staff,label,timestamp,result],[],[440,560])
        self.assertFalse(plan['review_items'])
        self.assertEqual({m['line_id'] for m in plan['masks']},{5,7})
        self.assertEqual(plan['dates_local'][0]['box'],timestamp['box'])
        ambiguous = propose([*header,staff,timestamp,result],[],[440,560])
        self.assertIn('date_without_context',{entry['code'] for entry in ambiguous['review_items']})
        touching = {**staff,'box':[20,88,112,124]}
        guarded = propose([*header,touching,label,timestamp,result],[],[440,560])
        self.assertIn('staff_name_needs_review',{entry['code'] for entry in guarded['review_items']})

    def test_pft_crop_excludes_paired_timestamp_before_pre_post_headers(self):
        lines = [line(1,'Spirometry - Plethysmography',[40,125,275,163]),
                 line(2,'22/09/2026',[350,122,430,147]),
                 line(3,'1:33:18 PM',[455,124,540,146]),
                 line(4,'Pre',[270,158,302,182]),
                 line(5,'Post',[387,159,425,182]),
                 line(6,'Upper SD',[170,170,235,194]),
                 line(7,'Pred.val.',[242,171,305,195]),
                 line(8,'%Pre',[315,169,361,194])]
        plan = propose(lines,[],[640,520])
        self.assertEqual(plan['crop_reason'],'detected_pft_table_header')
        self.assertEqual(plan['crop'][1],151)
        self.assertFalse(plan['review_items'])
        self.assertEqual(plan['resolved_by_crop'][0]['code'],'date_without_context')
        for altered in ([entry for entry in lines if entry['line_id'] != 3],
                        [*lines,line(9,'Nội dung khác',[60,141,145,158])]):
            with self.subTest(altered=altered):
                plan=propose(altered,[],[640,520])
                self.assertLess(plan['crop'][1],151)
                self.assertIn('date_without_context',[item['code'] for item in plan['review_items']])

    def test_lab_signing_block_requires_department_and_clear_space(self):
        lines=[line(1,'Chỉ định',[30,90,90,115]),line(2,'Kết quả',[170,90,233,115]),
               line(3,'Đơn vị',[260,90,305,115]),line(4,'Khoa xét nghiệm',[210,275,315,293]),
               line(5,'CKT. Tên giả lập',[220,333,315,353])]
        plan=propose(lines,[],[400,440])
        mask=next(m for m in plan['masks'] if 'staff_signature_footer' in m['reasons'])
        self.assertEqual(mask['box'],[170,293,355,373])
        self.assertFalse(plan['review_items'])
        for ambiguous in ([*lines[:3],lines[-1]], [*lines,line(6,'Kết quả khác',[250,300,295,322])]):
            plan=propose(ambiguous,[],[400,440])
            self.assertIn('staff_signature_needs_review',[r['code'] for r in plan['review_items']])

    def test_lab_technician_stamp_requires_isolated_signature_below_department(self):
        header = [line(1,'Chỉ định',[30,90,90,115]),line(2,'Kết quả',[170,90,233,115]),
                  line(3,'Đơn vị',[260,90,305,115])]
        department = line(4,'Khoa xét nghiệm',[210,265,315,285])
        signature = line(5,'Indecipherable',[228,296,306,329],.61)
        technician = line(6,'CN. Tên Giả Lập',[220,334,315,353])
        plan = propose([*header,department,signature,technician],[],[400,650])
        self.assertFalse(plan['review_items'])
        self.assertEqual([m['line_id'] for m in plan['masks']],[6])
        note = {**signature,'text':'Kết quả 6.4','confidence':.99}
        ambiguous = propose([*header,department,note,technician],[],[400,650])
        self.assertIn('staff_signature_needs_review',{item['code'] for item in ambiguous['review_items']})

    def test_echo_crop_requires_page_with_crf_findings(self):
        lines = [line(0,'Tên giả lập',[210,20,310,45]),
                 line(1,'Siêu âm tim, màng tim qua thành ngực',[105,50,390,88]),
                 line(2,'Kỹ thuật: Siêu âm tim, màng tim qua thành ngực',[60,90,412,120]),
                 line(3,'Mô tả: Nhĩ trái',[58,117,190,141]),
                 line(4,'RVOT RV/LV ratio TAPSE',[61,273,322,297]),
                 line(5,'FAC (%) RV FWS (%) RA area RAVI',[60,295,405,326])]
        plan = propose(lines,[],[500,520])
        self.assertEqual(plan['crop_reason'],'no_reliable_result_header_keep_page')

    def test_echo_continuation_excludes_neighbor_without_dropping_initial_values(self):
        labels = ['32 22 74 21 <1 23 10 / / / /','Vận động vùng thất phải: Bình thường',
                  '3. Van hai lá','6. Van ba lá','10. Áp lực động mạch phổi',
                  '12. Màng ngoài tim: Không có dịch',
                  '14. Chất lượng hình ảnh: Trung bình','Kết luận: Ghi nhận giả lập',
                  'So sánh với siêu âm trước: Chưa có', 'Phát hiện khẩn cấp/nguy hiểm: Không']
        lines = [line(i,label,[75,90+24*i,380,112+24*i]) for i,label in enumerate(labels)]
        neighbor = line(10,'Phiếu kế bên',[414,65,499,94])
        plan = propose([*lines,neighbor],[],[500,520])
        self.assertEqual(plan['crop_reason'],'detected_echo_report_sections')
        self.assertEqual(plan['crop'],[70,85,390,333])
        self.assertEqual(propose(lines[1:],[],[500,520])['crop'],[0,0,500,520])
        self.assertEqual(propose(lines[:5]+lines[6:],[],[500,520])['crop'],[0,0,500,520])

    def test_ecg_crop_excludes_adjacent_report_and_retains_impression_continuation(self):
        lines = [line(0,'Điện tim thường',[310,30,480,55]),
                 line(1,'Kỹ thuật: Điện tim thường',[105,82,290,105]),
                 line(2,'Mô tả: - Nhịp xoang',[108,107,250,129]),
                 line(3,'- Khoảng QTc: 430 ms',[110,131,277,153]),
                 line(4,'Kết luận: - Nhịp xoang',[115,161,287,182]),
                 line(5,'- Trục trung gian',[118,184,252,205]),
                 line(6,'Dữ liệu phiếu bên cạnh',[0,123,90,151]),
                 line(7,'Mô tả: Phiếu khác',[90,300,250,322])]
        barcode = {'box':[24,400,75,460]}
        plan = propose(lines,[barcode],[520,560])
        self.assertEqual(plan['crop_reason'],'detected_ecg_report_sections')
        self.assertEqual(plan['crop'],[101,26,484,209])
        self.assertFalse(plan['review_items'])
        self.assertEqual(plan['resolved_by_crop'][0]['code'],'unverified_barcode')

        for extra in (line(8,'Chữ ký',[300,184,377,204]),
                      line(8,'Dữ liệu phiếu bên cạnh',[0,90,106,113])):
            with self.subTest(extra=extra):
                ambiguous = propose([*lines,extra],[],[520,560])
                self.assertEqual(ambiguous['crop'],[0,0,520,560])

    def test_diagnostic_report_crop_keeps_findings_and_excludes_signed_footer(self):
        lines = [line(0,'Kết quả chẩn đoán',[45,30,245,50]),
                 line(1,'PID: SYNTHETIC',[40,60,190,80]),
                 line(2,'Kỹ thuật:',[30,100,130,120]),
                 line(3,'Mô tả:',[30,145,110,165]),
                 line(4,'Kết luận: Kết quả giả lập',[30,240,290,263]),
                 line(5,'Bác sĩ chuyên khoa',[225,290,380,310]),
                 line(6,'Tra cứu kết quả',[60,340,245,365])]
        plan = propose(lines,[],[400,440])
        self.assertEqual(plan['crop'],[0,100,400,290])
        self.assertEqual(plan['crop_reason'],'detected_diagnostic_report_sections')
        self.assertFalse(plan['review_items'])
        self.assertEqual(propose(lines[:-1],[],[400,440])['crop'],[0,0,400,440])

        offset_impression = [*lines,line(7,'Nội dung cuối',[35,277,160,296])]
        offset_plan = propose(offset_impression,[],[400,440])
        self.assertEqual(offset_plan['crop'],[0,100,400,304])
        self.assertIn({'box':[217,282,400,304],
                       'reasons':['staff_diagnostic_report_footer'], 'line_id':None},
                      offset_plan['masks'])
        self.assertFalse(offset_plan['review_items'])

        for box in ([35,277,230,296], [230,283,350,290]):
            with self.subTest(box=box):
                ambiguous = [*offset_impression,line(8,'Dòng khác',box)]
                self.assertEqual(propose(ambiguous,[],[400,440])['crop'],[0,0,400,440])

    def test_outgoing_gate_flags_masked_value_and_heading(self):
        lines = [line(0,'Xét nghiệm',[30,100,120,125]),line(1,'Kết quả',[200,100,280,125]),
                 line(2,'Đơn vị',[320,100,370,125]),line(3,'C3',[30,150,65,175]),
                 line(4,'0.78',[213,150,263,175]),line(5,'g/L',[320,150,360,175])]
        crop = [0, 84, 400, 260]
        reason = 'detected_lab_table_header'
        self.assertEqual(outgoing_review_items(lines,crop,[],reason),[])
        self.assertEqual([i['code'] for i in outgoing_review_items(lines,crop,[{'box':[207,145,217,178]}],reason)],
                         ['outgoing_result_needs_review'])
        self.assertEqual([i['code'] for i in outgoing_review_items(lines,crop,[{'box':[220,99,225,126]}],reason)],
                         ['outgoing_table_header_needs_review'])

    def test_reference_intervals_never_parse_as_dates(self):
        for s in ['0.45-0.58','12.6-14.9','29.5 - 43.2','7.2-10','2.3.2024.5','12/03-2025','A12/03/2025X']:
            with self.subTest(s=s):self.assertEqual([],date_mentions(s,contextual=True))

    def test_calendar_validation_and_date_formats(self):
        for s in ['29/02/2023','31/04/2027','12/13/2028','00/02/2028']:
            self.assertEqual([],date_mentions(s,contextual=True))
        for s in ['29/02/2024','2024-02-29','Ngày 29 tháng 02 năm 2024']:
            self.assertEqual('2024-02-29',date_mentions(s,contextual=True)[0]['normalized'])

    def test_short_year_not_invented(self):
        self.assertEqual([],date_mentions('08/11/28'))
        self.assertIsNone(date_mentions('Ngày lấy mẫu 08/11/28',contextual=True)[0]['normalized'])

    def test_valid_date_without_label_is_reviewed_not_erased(self):
        p=propose([line(0,'14/05/2027',[20,100,180,125])],[],(500,500))
        self.assertEqual([],p['masks']);self.assertEqual('date_without_context',p['review_items'][0]['code'])

    def test_date_label_can_be_separate_chunk(self):
        p=propose([line(0,'Ngày lấy mẫu:',[10,100,150,125]),
                   line(1,'14/05/2027',[160,100,300,125])],[],(500,500))
        self.assertEqual('2027-05-14',p['dates_local'][0]['mentions'][0]['normalized'])

    def test_reference_label_protects_calendar_looking_text(self):
        p=propose([line(0,'Reference range: 12/03/2025',[10,100,350,130])],[],(500,500))
        self.assertEqual([],p['masks']);self.assertEqual('date_like_reference_value',p['ignored_items'][0]['code'])

    def test_date_sharing_a_line_with_a_lab_value_requires_local_review(self):
        p=propose([line(0,'Date: 17/04/2029 CRP: 6.2 mg/L',[10,100,450,130])],[],(500,500))
        self.assertEqual([],p['masks'])
        self.assertEqual('date_shares_line_with_other_content',p['review_items'][0]['code'])
        self.assertFalse(p['dates_local'][0]['masked_as_date_field'])

    def test_timestamp_field_is_masked_and_retained_locally(self):
        p=propose([line(0,'Giờ chỉ định: 08:15 17/04/2029',[10,100,450,130])],[],(500,500))
        self.assertTrue(p['dates_local'][0]['masked_as_date_field'])
        self.assertTrue(any('contextual_calendar_date' in m['reasons'] for m in p['masks']))

    def test_word_date_masked_with_local_copy(self):
        p=propose([line(0,'Ngày 17 tháng 04 năm 2029',[10,100,450,130])],[],(500,500))
        self.assertEqual('2029-04-17',p['dates_local'][0]['mentions'][0]['normalized'])
        self.assertIn('contextual_calendar_date',p['masks'][0]['reasons'])

    def test_year_label_spelling_variant_does_not_repair_date_digits(self):
        self.assertEqual('2031-11-21',date_mentions('ngày 21 tháng 11 nm 2031',contextual=True)[0]['normalized'])
        self.assertEqual([],date_mentions('ngày 21 tháng 11 nm 2O31',contextual=True))

    def test_laboratory_numbers_do_not_trigger_phone_or_identity(self):
        p=propose([line(0,'CMV 0.375 COI',[20,100,200,130]),line(1,'C3 0.91 g/L',[20,150,200,180])],[],(500,500))
        self.assertEqual([],p['masks'])

    def test_resident_and_academic_physician_titles_are_staff(self):
        from ocr_pool.metadata import fold
        from ocr_pool.privacy_proposal import STAFF_TITLE
        for text in ('Ths.BSNT Tên Giả Lập', 'BSNT Tên Giả', 'PGS.TS.BS Tên Giả', 'BS.CK2 Tên Giả'):
            self.assertTrue(STAFF_TITLE.match(fold(text)), text)
        for text in ('BSA 1.7', 'Basophil 0.6', 'Bsl 12'):
            self.assertFalse(STAFF_TITLE.match(fold(text)), text)
        from ocr_pool.privacy_proposal import STAFF_ROLE
        for text in ('Ngròi nhân mu: CN. Tên Giả', 'Nguròi nhân mãu: Tên Giả', 'Nguòi láy mãu:'):
            self.assertTrue(STAFF_ROLE.match(fold(text)), text)
        for text in ('Ngày nhận mẫu: 07/09', 'Ngoại vi: 5', 'Nguồn: abc'):
            self.assertFalse(STAFF_ROLE.match(fold(text)), text)
        header = [line(1,'Chỉ định',[30,90,90,115]),line(2,'Kết quả',[170,90,233,115]),
                  line(3,'Đơn vị',[260,90,305,115])]
        image = Image.new('RGB',(400,650),'#dddddd')
        ImageDraw.Draw(image).line([(240,290),(270,300),(300,285)],fill='#1838a2',width=4)
        name = line(4,'Ths.BSNT Tên Giả Lập',[200,330,330,352])
        plan = propose([*header,name],[],image.size,image=image)
        masked = any(m.get('line_id') == 4 or 'staff_signature_footer' in m['reasons'] for m in plan['masks'])
        reviewed = any('staff' in item['code'] for item in plan['review_items'])
        self.assertTrue(masked or reviewed)

    def test_role_row_cut_by_crop_top_masks_the_administrative_sliver_only(self):
        header = [line(1,'Chỉ định',[30,120,90,140]),line(2,'Kết quả',[170,120,233,140]),
                  line(3,'Đơn vị',[260,120,305,140]),line(4,'CRP 4.81',[30,160,140,180]),
                  line(5,'WBC 6.70',[30,190,140,210])]
        role = line(6,'Ngròi lấy mẫu:',[30,92,120,112])
        image = Image.new('RGB',(400,400),'#dddddd')
        plan = propose([role,*header],[],image.size,image=image)
        if plan['crop'][1] > role['box'][1]:
            strip = [m for m in plan['masks'] if m.get('line_id') == 6]
            reviewed = [r for r in plan['review_items'] if 6 in r.get('line_ids', [])]
            self.assertTrue(strip or reviewed)
            for mask in strip:
                self.assertLessEqual(mask['box'][3], 120)

    def test_staff_names_are_masked_from_inline_and_adjacent_role_fields(self):
        items = [line(0,'Bác sĩ chỉ định: Nguyễn Văn An',[20,30,290,55]),
                 line(1,'Người lấy mẫu:',[20,76,150,99]),
                 line(2,'Trần Thị Minh',[175,76,305,99]),
                 line(3,'CRP 4.81 mg/L',[20,145,185,173])]
        image = Image.new('RGB',(500,500),'#426587')
        plan = propose(items,[],image.size,image=image)
        self.assertEqual([],plan['review_items'])
        self.assertEqual(['staff_name_field']*2,[m['reasons'][0] for m in plan['masks']])
        result = render(image,plan)
        self.assertEqual((255,255,255),result.getpixel((180,84)))
        self.assertEqual(image.getpixel((60,155)),result.getpixel((60,155)))

    def test_staff_field_with_clinical_text_and_unbounded_signature_require_review(self):
        items = [line(0,'Người nhận mẫu: Nguyễn Văn An CRP 4.81 mg/L',[20,30,450,55]),
                 line(1,'Chữ ký',[290,380,380,410])]
        plan = propose(items,[],(500,500))
        self.assertEqual([],plan['masks'])
        self.assertEqual({'staff_name_needs_review','staff_signature_needs_review'},
                         {r['code'] for r in plan['review_items']})

    def test_isolated_panel_footer_masks_signature_without_erasing_legend(self):
        headings = [line(0,'Antigen',[50,100,120,120]),line(1,'Intensity',[200,100,280,120]),
                    line(2,'Class',[360,100,410,120])]
        legend = line(3,'36 - 70 Positive',[70,348,260,372])
        marker = line(4,'LABORATORY',[420,445,540,470])
        name = line(5,'ThS. Nguyễn Văn An',[390,515,580,541])
        image = Image.new('RGB',(620,650),'#dddddd')
        draw = ImageDraw.Draw(image)
        draw.line([(454,485),(490,506),(545,479)],fill='#1838a2',width=4)
        plan = propose([*headings,legend,marker,name],[],image.size,image=image)
        self.assertEqual([],plan['review_items'])
        self.assertIn('staff_signature_footer',plan['masks'][0]['reasons'])
        result = render(image,plan)
        self.assertEqual((255,255,255),result.getpixel((490,506-plan['crop'][1])))
        self.assertEqual(image.getpixel((100,360)),result.getpixel((100,360-plan['crop'][1])))
        clinical = line(6,'12.38',[520,485,575,510])
        blocked = propose([*headings,legend,marker,name,clinical],[],image.size,image=image)
        self.assertIn('staff_signature_needs_review',[r['code'] for r in blocked['review_items']])
        self.assertFalse(any('staff_signature_footer' in m['reasons'] for m in blocked['masks']))

    def test_pft_signature_mask_can_end_before_separate_same_line_footer(self):
        lines = [line(0,'Pred.val.',[125,92,185,110]),
                 line(1,'%Pre',[245,92,285,110]),
                 line(2,'ThS.BS. Nguyễn Văn An',[350,508,490,534]),
                 line(3,'Software 2.4.1',[495,510,600,534])]
        image = Image.new('RGB',(620,620),'#dddddd')
        draw = ImageDraw.Draw(image)
        draw.line([(375,475),(405,464),(418,483)],fill='#1838a2',width=4)
        plan = propose(lines,[],image.size,image=image)
        self.assertEqual([],plan['review_items'])
        mask = next(m for m in plan['masks'] if 'staff_signature_footer' in m['reasons'])
        self.assertEqual(495,mask['box'][2])
        out = render(image,plan)
        self.assertEqual((255,255,255),out.getpixel((405,464-plan['crop'][1])))
        self.assertEqual(image.getpixel((500,521)),out.getpixel((500,521-plan['crop'][1])))

        draw.line([(480,480),(511,475)],fill='#1838a2',width=4)
        crossing = propose(lines,[],image.size,image=image)
        self.assertIn('staff_signature_needs_review',[r['code'] for r in crossing['review_items']])
        self.assertFalse(any('staff_signature_footer' in m['reasons'] for m in crossing['masks']))

    def test_decoded_barcode_masks_but_unknown_candidate_does_not(self):
        p=propose([], [dict(box=[10,20,90,60],source='zxingcpp',decoded=True,valid=True),
                       dict(box=[100,120,400,350],source='opencv',decoded=False,valid=False)],(500,500))
        self.assertEqual(1,len(p['masks']));self.assertEqual('unverified_barcode',p['review_items'][0]['code'])
        self.assertFalse(p['outbound_allowed']);self.assertFalse(p['reviewed'])

    def test_legacy_bbox_and_invalid_decode_never_get_trusted(self):
        p=propose([],[[10,10,50,50],dict(box=[60,10,100,50],source='zxingcpp',decoded=True,valid=False)],(500,500))
        self.assertEqual([],p['masks']);self.assertEqual(2,len(p['review_items']))

    def test_time_column_uses_ruled_bounds_and_stops_before_merged_row(self):
        p=propose(specimen_lines(),[],(600,500),vertical_segments=[[140,90,140,305],[250,90,250,355]])
        m=next(m for m in p['masks'] if 'collection_datetime_column' in m['reasons'])
        self.assertGreater(m['box'][0],140);self.assertLess(m['box'][2],250)
        self.assertEqual(305,m['box'][3])
        self.assertIsNone(p['dates_local'][0]['normalized_date'])
        self.assertTrue(p['dates_local'][0]['requires_review'])
        self.assertIn('07112/72X',[f['raw'] for f in p['dates_local'][0]['raw_fragments']])

    def test_time_column_moves_with_headers_and_slanted_grid(self):
        p=propose(specimen_lines(170),[],(850,600),vertical_segments=[[308,90,315,305],[418,90,425,355]])
        m=next(m for m in p['masks'] if 'collection_datetime_column' in m['reasons'])
        self.assertGreater(m['box'][0],300);self.assertLess(m['box'][2],430)
        self.assertNotEqual(m['polygon'][0][0],m['polygon'][3][0])

    def test_missing_or_single_border_requires_review(self):
        for grid in [[],[[140,90,140,355]]]:
            p=propose(specimen_lines(),[],(600,500),vertical_segments=grid)
            self.assertFalse(any('collection_datetime_column' in m['reasons'] for m in p['masks']))
            self.assertIn('collection_column_geometry_unresolved',[r['code'] for r in p['review_items']])

    def test_collection_header_excludes_title_and_data_cells(self):
        items=specimen_lines()+[line(20,'SAMPLE COLLECTION INFORMATION',[100,50,500,90]),
                               line(21,'11:45',[160,140,230,180])]
        headers=collection_headers(items)
        self.assertEqual(1,len(headers))
        self.assertEqual((1,2),headers[0][2])

    def test_administrative_collection_timestamp_is_not_a_table_column(self):
        items=[line(0,'Giờ lấy mẫu',[20,50,120,80]),line(1,'11:45 14/05/2027',[130,50,350,80])]
        self.assertEqual([],collection_headers(items))
        p=propose(items,[],(600,500))
        self.assertTrue(any('contextual_calendar_date' in m['reasons'] for m in p['masks']))

    def test_wrapped_lab_columns_detect_table_without_an_ocr_unit_heading(self):
        items = [line(0, 'Người nhận mẫu', [30, 115, 175, 141]),
                 line(1, 'Kết quả', [150, 164, 212, 188]),
                 line(2, 'Khoảng', [304, 159, 358, 181]),
                 line(3, 'Tham chiếu', [291, 180, 373, 201]),
                 line(4, 'Quy', [442, 160, 476, 181]),
                 line(5, 'trình', [439, 181, 480, 201]),
                 line(6, 'Albumin', [32, 212, 120, 232])]
        plan = propose(items, [], (500, 650))
        self.assertEqual('detected_lab_table_header', plan['crop_reason'])
        self.assertEqual([0, 143, 500, 650], plan['crop'])
        self.assertFalse(plan['outbound_allowed'])

    def test_wrapped_fragments_from_different_columns_do_not_form_a_header(self):
        items = [line(0, 'Kết quả', [150, 164, 212, 188]),
                 line(1, 'Khoảng', [304, 159, 358, 181]),
                 line(2, 'Tham chiếu', [380, 180, 465, 201]),
                 line(3, 'Quy', [442, 160, 476, 181]),
                 line(4, 'trình', [250, 181, 288, 201])]
        plan = propose(items, [], (500, 650))
        self.assertEqual('no_reliable_result_header_keep_page', plan['crop_reason'])

    def test_loose_next_row_text_box_does_not_leave_date_tail_visible(self):
        items=specimen_lines();items[-1]['box']=[20,290,400,335]
        p=propose(items,[],(600,500),vertical_segments=[[140,90,140,305],[250,90,250,355]])
        image=Image.new('RGB',(600,500),'#426587');out=render(image,p)
        self.assertEqual((255,255,255),out.getpixel((190,302-p['crop'][1])))
        self.assertEqual(image.getpixel((190,325)),out.getpixel((190,325-p['crop'][1])))

    def test_border_crossing_a_merged_row_is_not_used(self):
        p=propose(specimen_lines(),[],(600,500),vertical_segments=[[140,90,140,355],[250,90,250,355]])
        self.assertFalse(any('collection_datetime_column' in m['reasons'] for m in p['masks']))
        self.assertIn('collection_column_crosses_merged_row',[r['code'] for r in p['review_items']])

    def test_duplicate_opencv_region_already_masked_by_decode_is_resolved(self):
        p=propose([], [dict(box=[20,20,120,80],source='zxingcpp',decoded=True,valid=True),
                       dict(box=[18,18,122,82],source='opencv',decoded=False,valid=False)],(500,500))
        self.assertEqual(1,len(p['masks']));self.assertEqual([],p['review_items'])

    def test_other_header_inside_column_rejects_wide_geometry(self):
        p=propose(specimen_lines(),[],(600,500),vertical_segments=[[140,90,140,355],[400,90,400,355]])
        self.assertFalse(any('collection_datetime_column' in m['reasons'] for m in p['masks']))

    def test_raster_masks_leave_sample_amount_and_lower_table_unchanged(self):
        original=Image.new('RGB',(600,500),'#426587')
        p=propose(specimen_lines(),[],original.size,vertical_segments=[[140,90,140,305],[250,90,250,355]])
        out=render(original,p);y0=p['crop'][1]
        self.assertEqual((255,255,255),out.getpixel((190,185-y0)))
        for x,y in [(50,195),(310,185),(310,255),(190,325),(190,400)]:
            self.assertEqual(original.getpixel((x,y)),out.getpixel((x,y-y0)))
        self.assertEqual((66,101,135),original.getpixel((190,185)))

    def test_out_of_bounds_text_is_rejected(self):
        with self.assertRaises(ValueError):propose([line(0,'name',[-1,20,100,50])],[],(200,200))

    def test_export_drops_exif_and_metadata_without_changing_original(self):
        original=Image.new('RGB',(200,200),'navy')
        original.getexif()[0x010e]='Synthetic identifier in EXIF'
        original.info['exif']=original.getexif().tobytes()
        original.info['comment']=b'Synthetic private metadata'
        out=render(original,propose([],[],original.size));buf=io.BytesIO();out.save(buf,format='PNG')
        with Image.open(io.BytesIO(buf.getvalue())) as reopened:
            self.assertFalse(reopened.getexif());self.assertNotIn('comment',reopened.info)
        self.assertEqual('Synthetic identifier in EXIF',original.getexif()[0x010e])

    def test_geometry_reads_shifted_synthetic_table(self):
        image=Image.new('RGB',(800,600),'white');draw=ImageDraw.Draw(image)
        for x in [60,250,420,610,750]:draw.line((x,100,x,480),fill='black',width=3)
        for y in [100,180,310,400,480]:draw.line((60,y,750,y),fill='black',width=3)
        found=vertical_segments(image)
        self.assertTrue(any(abs((s[0]+s[2])/2-250)<8 for s in found))
        self.assertTrue(any(abs((s[0]+s[2])/2-420)<8 for s in found))

    @unittest.skipUnless(importlib.util.find_spec('zxingcpp'),'Optional local privacy dependencies not installed')
    def test_real_synthetic_qr_decoding_evidence(self):
        import zxingcpp
        qr=zxingcpp.create_barcode('PRIVACY-SYNTHETIC-829',zxingcpp.BarcodeFormat.QRCode)
        import numpy as np
        image=Image.fromarray(np.asarray(zxingcpp.write_barcode_to_image(qr,scale=6,add_quiet_zones=True))).convert('RGB')
        codes=inspect_barcodes(image)
        self.assertTrue(any(c['source']=='zxingcpp' and c['decoded'] and c['valid'] for c in codes))
        self.assertTrue(all('text' not in c and 'bytes' not in c for c in codes))


if __name__=='__main__':unittest.main()
