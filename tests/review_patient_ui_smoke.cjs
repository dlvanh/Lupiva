// Exercise production field rendering/selection/retries without browser dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../registry_review/review.html'), 'utf8');
class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.options=[]; this.value=''; this.hidden=false; this.disabled=false; this.checked=false; this.style={}; this.dataset={}; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children=items; this.options=[]; this.value=''; }
  add(option) { this.options.push(option); if(this.options.length===1)this.value=option.value; }
  setAttribute(key,value) { this[key]=value; }
  querySelectorAll(selector) { return this.children.flatMap(child=>[...(child.className?.split(' ').includes(selector.slice(1))?[child]:[]),...child.querySelectorAll(selector)]); }
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size);
const elements=Object.fromEntries(ids.map(id=>[id,new Element('static')]));
const candidates=[
  {selection_id:'O1',kind:'observation',field_id:'IMM11',component:'result',value:{numeric_value:'0.6500',unit_raw:'g/L'},review_status:'pending'},
  {selection_id:'O2',kind:'observation',field_id:'PFT01',component:'post_measured',value:{result_type:'missing',result_raw:'---',missing_reason:'source_placeholder'},review_status:'pending'},
  {selection_id:'M1',kind:'metadata',metadata_key:'patient_id',value:{value:'SYNTHETIC'},review_status:'pending'},
  {selection_id:'M2',kind:'metadata',metadata_key:'additional_lab_result',value:{key:'additional_lab_result',value:{name:'HCT',results:{result:'0.355'},unit_raw:'L/L'}},review_status:'pending'},
  {selection_id:'S1',kind:'specimen',value:{sample_type:'blood',checkbox_state:'unchecked',amount:{numeric_value:null},collection_datetime:{date:null,time:null}},review_status:'pending'},
].map(c=>({...c,document_id:'D1',current_revision:true,evidence:[]}));
const fields=[
  {field_id:'IMM11',label:'C3',section:'Miễn dịch',components:[{component_id:'result',candidate_ids:['O1'],status:'pending',parser_implemented:true}]},
  {field_id:'ADM01',label:'Study ID',section:'Thông tin nền',components:[{component_id:'result',candidate_ids:[],status:'not_processed',parser_implemented:false}]},
  {field_id:'PFT01',label:'VC',section:'Hô hấp',components:[{component_id:'pre_measured',candidate_ids:[],status:'not_processed',parser_implemented:true},{component_id:'post_measured',candidate_ids:['O2'],status:'source_placeholder',parser_implemented:true}]},
];
const supplemental_fields=[{field_id:'SUP-HCT',label:'HCT',section:'Xét nghiệm máu',crf_membership:'non_crf',components:[{component_id:'result',candidate_ids:['M2'],status:'pending'}]}];
let workspace={fields,supplemental_fields,candidates,review_snapshot_sha256:'sha',counts:{fields:3,components:4,fields_with_candidates:2,observations:2,metadata:2,specimens:1,non_crf_fields:1,non_crf_results:1},review_batches:[]};
let patientResponse=async()=>({cases:[{registry_code:'SYNTHETIC'}],documents:[{document_id:'D1',source_document_id:'IN-TEST'}],observations:[],metadata:[],specimens:[],metadata_conflicts:{},workspace});
let batchResponse=async payload=>({batch:{counts:{observation:payload.selection_ids.length,metadata:0,specimen:0}}});
const requests=[];
const context=vm.createContext({
  document:{getElementById:id=>elements[id]||findId(elements.crfScoreInputs,id),createElement:tag=>new Element(tag)},
  Option:class{constructor(label,value){this.label=label;this.value=value;}},URLSearchParams,crypto,console,
  fetch:async(url,options)=>{
    const payload=options?.body?JSON.parse(options.body):null;requests.push({url,payload});let data;
    if(url==='/api/intakes')data={jobs:[]};
    else if(url==='/api/summary')data={packages:[],cases:[{case_id:'C1',registry_code:'SYNTHETIC'},{case_id:'C2',registry_code:'OTHER'}],encounters:[]};
    else if(url==='/api/exports/options')data={field_count:261,component_count:377};
    else if(url.startsWith('/api/patient?'))data=await patientResponse();
    else if(url==='/api/patient-review')data=await batchResponse(payload);
    else throw Error('Unexpected URL '+url);
    return {ok:!data.error,json:async()=>data};
  }
});
function findId(root,id){
  if(root?.id===id)return root;
  for(const child of root?.children||[]){const found=findId(child,id);if(found)return found;}
}
const script=html.match(/<script nonce="\{\{NONCE\}\}">([\s\S]*?)<\/script>/)[1].replace('{{CSRF_TOKEN}}','"test-token"');
vm.runInContext(script,context);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const call=expression=>vm.runInContext(expression,context);
(async()=>{
  await flush();elements.exportCase.value='C1';await call('loadPatient()');
  assert.equal(elements.patientFieldRows.children.length,4,'Every component including empty ones must render');
  assert.equal(elements.patientSupplementalRows.children.length,1,'Non-CRF lab results render in their own data table');
  assert.equal(elements.patientExtraRows.children.length,2,'Supplemental lab results must not duplicate in source metadata');
  assert.equal(elements.patientNonCrfFields.hidden,false);
  assert.match(elements.patientCounts.textContent,/1 ảnh · 5 giá trị cần xem lại/);
  elements.patientFilter.value='empty';elements.patientFilter.onchange();
  assert.equal(elements.patientFieldRows.children.length,2);
  elements.selectPatientVisible.onclick();
  assert.equal(call('patientSelected.size'),0,'Empty fields cannot be selected');
  elements.patientFilter.value='all';elements.patientFilter.onchange();
  elements.selectPatientVisible.onclick();
  assert.equal(call('patientSelected.size'),5,'One click selects CRF, non-CRF, metadata and specimens in the filter');
  assert.equal(elements.savePatientBatch.disabled,true);
  elements.actor.value='Synthetic operator';elements.role.value='source_reviewer';elements.patientBatchReason.value='Synthetic UI review';
  await elements.savePatientBatch.onclick();
  assert.equal(requests.filter(r=>r.url==='/api/patient-review').length,0,'Confirmation is required before any POST');
  elements.patientBatchConfirm.checked=true;elements.patientBatchConfirm.onchange();
  assert.equal(elements.savePatientBatch.disabled,false);
  batchResponse=async()=>({error:'Synthetic connection failure'});
  await elements.savePatientBatch.onclick();
  let batches=requests.filter(r=>r.url==='/api/patient-review');
  assert.deepEqual(batches[0].payload.selection_ids,['M1','M2','O1','O2','S1']);
  assert.equal(batches[0].payload.expected_snapshot_sha256,'sha');
  assert.match(elements.status.textContent,/Synthetic connection failure/);
  await elements.savePatientBatch.onclick();
  batches=requests.filter(r=>r.url==='/api/patient-review');
  assert.equal(batches[1].payload.request_id,batches[0].payload.request_id,'Network retries preserve idempotency key');
  batchResponse=async()=>({batch:{counts:{observation:2,metadata:2,specimen:1}}});
  await elements.savePatientBatch.onclick();
  assert.equal(call('patientSelected.size'),0);
  assert.equal(elements.patientBatchConfirm.checked,false);
  assert.equal(elements.savePatientBatch.disabled,true);
  assert.match(elements.status.textContent,/5 giá trị/);

  elements.patientScope.value='non_crf';elements.patientScope.onchange();
  assert.equal(elements.patientFieldRows.children.length,0);
  assert.equal(elements.patientCrfFields.hidden,true);
  assert.equal(elements.patientSupplementalRows.children.length,1);
  assert.equal(elements.patientExtra.hidden,true);
  elements.selectPatientVisible.onclick();assert.equal(call('JSON.stringify([...patientSelected])'),'["M2"]');
  elements.patientScope.value='crf';elements.patientScope.onchange();
  assert.equal(elements.patientNonCrfFields.hidden,true);
  assert.equal(call('patientSelected.size'),1,'Scope switches preserve explicit selection');
  elements.clearPatientSelection.onclick();
  elements.patientScope.value='all';elements.patientScope.onchange();
  elements.patientSearch.value='HCT';elements.patientSearch.oninput();
  assert.equal(elements.patientSupplementalRows.children.length,1);
  assert.equal(elements.patientFieldRows.children.length,0);
  elements.selectPatientVisible.onclick();assert.equal(call('patientSelected.size'),1);
  elements.clearPatientSelection.onclick();

  // Search recognizes Vietnamese without accents and scopes select-all.
  elements.patientSearch.value='mien dich';elements.patientSearch.oninput();
  assert.equal(elements.patientFieldRows.children.length,1);
  elements.selectPatientVisible.onclick();assert.equal(call('patientSelected.size'),1);
  elements.patientSearch.value='no match';elements.patientSearch.oninput();
  assert.equal(elements.patientFieldRows.children.length,0);
  assert.equal(call('patientSelected.size'),1,'Changing filter must not silently change selection');
  elements.clearPatientSelection.onclick();assert.equal(call('patientSelected.size'),0);

  // Confidence filters operate on individual candidates; no automatic POST.
  for(const c of candidates)c.confidence={score:90,tier:'high',placeholder:false,reasons:[],human_verified:false};
  candidates[1].confidence.placeholder=true;candidates[2].confidence.tier='low';candidates[4].confidence.tier='medium';
  workspace.confidence_summary={attention:2,low:1,medium:1,routine:2,placeholders:1};
  workspace.confidence_feedback={reviewed:0};workspace.confidence_alerts=[];
  elements.patientSearch.value='';await call('loadPatient()');
  assert.match(elements.confidenceCounts.textContent,/2 giá trị ưu tiên/);
  const postCount=requests.filter(r=>r.url==='/api/patient-review').length;
  elements.patientConfidence.value='attention';elements.patientConfidence.onchange();
  assert.equal(elements.patientFieldRows.children.length,0);
  assert.equal(elements.patientExtraRows.children.length,2);
  elements.selectPatientVisible.onclick();assert.equal(call('JSON.stringify([...patientSelected].sort())'),'["M1","S1"]');
  elements.patientBatchConfirm.checked=true;
  elements.patientConfidence.value='high';elements.patientConfidence.onchange();
  assert.equal(elements.patientBatchConfirm.checked,false,'Switching confidence groups resets confirmation');
  assert.equal(elements.patientFieldRows.children.length,1,'Source placeholders are excluded from routine candidates');
  assert.equal(elements.patientSupplementalRows.children.length,1);
  assert.equal(elements.patientExtraRows.children.length,0);
  assert.match(elements.patientSelectionCount.textContent,/2 giá trị đã chọn nằm ngoài bộ lọc/);
  assert.equal(requests.filter(r=>r.url==='/api/patient-review').length,postCount,'Confidence is never an approval');
  elements.clearPatientSelection.onclick();
  elements.patientConfidence.value='placeholder';elements.patientConfidence.onchange();
  assert.equal(elements.patientFieldRows.children.length,1);
  assert.equal(elements.patientSupplementalRows.children.length,0);

  // New OCR is the default view; old decisions/corrections stay accessible without a POST.
  candidates[0].prior_ocr={package_id:'new',revision:1};
  workspace.prior_ocr={candidates:1,pending_corrections:1};
  elements.patientFilter.value='data';await call('loadPatient()');
  assert.equal(elements.patientPriorOcr.hidden,false);
  assert.equal(elements.showPriorOcr.checked,false);
  assert.match(elements.patientPriorOcrNotice.textContent,/1 đề xuất sửa cũ/);
  assert.equal(elements.patientFieldRows.children.length,1,'Prior OCR rows are hidden by default');
  elements.showPriorOcr.checked=true;elements.showPriorOcr.onchange();
  assert.equal(elements.patientFieldRows.children.length,2,'Original data is still available on request');
  call(`patientSelected.add('O1')`);elements.patientBatchConfirm.checked=true;
  elements.showPriorOcr.checked=false;elements.showPriorOcr.onchange();
  assert.equal(call('patientSelected.size'),1,'Changing OCR view preserves explicit selection');
  assert.equal(elements.patientBatchConfirm.checked,false);
  assert.equal(requests.filter(r=>r.url==='/api/patient-review').length,postCount,'Changing OCR view never approves or withdraws anything');
  delete candidates[0].prior_ocr;delete workspace.prior_ocr;await call('loadPatient()');

  call(`crfView={review:null,sources:{},fields:[
    {slot:'ADM02/result',section:'Hành chính',label:'Age',component:'result',choices:[],options:[{id:'AGE',value:'36 years',sources:[]}]},
    {slot:'SDA01/result',section:'Đánh giá',label:'Seizure',component:'result',choices:[],options:[]},
    {slot:'SDA24/result',section:'Đánh giá',label:'Leukopenia',component:'result',choices:[{code:'yes',label:'Có'}],options:[],proposal:{id:'SUG',value:'yes',reason:'Synthetic evidence',sources:[]}}
  ]};crfSelections=new Map([['ADM02/result','AGE']]);renderCrf()`);
  assert.equal(elements.crfFields.children.length,2);
  const clinical=elements.crfFields.children[1];
  assert.equal(clinical.children.length,2,'Unsupported blank fields start hidden');
  const proposal=clinical.children[1].children[1];
  assert.equal(proposal.children[0].value,'Có');
  assert.equal(proposal.children[1].children[0].checked,false,'Suggestions require an explicit selection');
  assert.match(proposal.children[2].textContent,/Đề xuất LLM/);
  elements.crfAllFields.checked=true;elements.crfAllFields.onchange();
  assert.equal(elements.crfFields.children[1].children[1].children[1].children[0].value,'');
  assert.equal(call('crfSelections.size'),1,'Showing fields does not select proposals or blanks');
  const highlighted=call(`crfView.sources.ROW={label:'C3',value:'0.87 g/L',url:'/asset?test',row_location:{coordinate_space:'outgoing_image_1000',box:[40,110,900,170],image_size:[1000,800]}};crfEvidence({sources:['ROW']})`);
  const source=highlighted.children[1];
  assert.equal(source.children.length,2,'CRF previews load when the user opens the evidence');
  highlighted.open=true;highlighted.ontoggle();
  const frame=source.children[2].children[0].children[0];
  const [picture,mark]=frame.children;
  picture.naturalWidth=1000;picture.naturalHeight=800;picture.onload();
  assert.equal(mark.hidden,false);
  assert.equal(mark.style.top,'11%');
  assert.equal(mark.style.height,'6%');
  picture.naturalHeight=801;picture.onload();
  assert.equal(mark.hidden,true,'A preview with different geometry cannot show the stored overlay');

  call(`crfView={review:null,sources:{},fields:[{slot:'CV01/result',section:'Cardiovascular',label:'Cardiovascular abnormality?',
    component:'result',choices:[{code:'yes',label:'YES'},{code:'no',label:'NO'},{code:'unknown',label:'Unknown'}],
    options:[],manual_options:['yes','no','unknown'].map(value=>({id:value,value,sources:[]}))}],
    layout:[{index:62,rows:[['yes','no','unknown'].map(value=>({text:'☐ '+value,span:1,row_span:1,
     checkbox_slot:'CV01/result',checkbox_values:[value]}))]}]};crfSelections.clear();renderCrf()`);
  const checkboxRow=()=>elements.crfFields.children[0].children[0].children[0].children[0];
  const checkbox=index=>checkboxRow().children[index].children[1].children[0];
  checkbox(2).checked=true;checkbox(2).onchange();
  assert.equal(call("crfSelections.get('CV01/result')"),'unknown');
  checkbox(0).checked=true;checkbox(0).onchange();
  assert.equal(checkbox(2).checked,false,'The template row allows one choice');
  assert.equal(call("crfSelections.get('CV01/result')"),'yes');
  checkbox(1).checked=true;checkbox(1).onchange();
  assert.equal(checkbox(0).checked,false);
  assert.equal(call("crfSelections.get('CV01/result')"),'no');

  call(`crfView.score_form={eular:[{field_id:'EAC19',label:'Low C3 OR low C4',weight:3}],
    sledai:[{field_id:'SDA20',label:'Low Complement',weight:2}]};
    renderCrfScoreInputs();
    crfScorePreview={suggestions:{EAC19:{value:'yes',reason:'C3 thấp',sources:['ROW']},
      SDA20:{value:'yes',reason:'C3 thấp',sources:['ROW'],requires_confirmation:true,confirmation:'Kiểm tra hồ sơ.'}},values:{},
      summaries:{eular:{total:null,classification:'undetermined'},sledai:{total:null,missing:24}}};
    renderCrf()`);
  assert.equal(elements.applyCrfScoreSuggestions.hidden,false);
  assert.equal(call("$('score-EAC19').value"),'','Lab evidence initially appears as a suggestion');
  elements.applyCrfScoreSuggestions.onclick();
  assert.equal(call("$('score-EAC19').value"),'yes');
  assert.equal(call("$('score-SDA20').value"),'','Bulk selection skips criteria requiring confirmation');
  const confirm = call("$('score-evidence-SDA20').children.at(-1)");
  assert.equal(confirm.textContent,'Xác nhận và chọn Có');
  confirm.onclick();
  assert.equal(call("$('score-SDA20').value"),'yes');
  assert.equal(elements.approveCrf.disabled,true,'Changed criteria require a fresh score preview');
  assert.match(elements.crfScoreStatus.textContent,/Tính điểm nháp/);

  // Late responses cannot repopulate the previous patient's fields or selections.
  let release;patientResponse=()=>new Promise(resolve=>{release=resolve;});
  const pending=call('loadPatient()');elements.exportCase.value='C2';
  call('patientGeneration++');release({workspace});await pending;
  assert.equal(elements.patientData.hidden,true);
  assert.equal(call('patientSelected.size'),0);
  const extraText=call(`patientCandidateText({kind:'metadata',metadata_key:'additional_lab_result',value:{value:{name:'IC',results:{pre_measured:'1.13',pre_percent_predicted:'106.04'},unit_raw:'L'}}})`);
  assert.match(extraText,/Pre: 1.13/);assert.match(extraText,/106.04%/);assert.doesNotMatch(extraText,/\[object Object\]/);
  assert.equal(call(`patientCandidateText({kind:'metadata',metadata_key:'source_diagnosis',value:{value:'Possible ILD'}})`),'Chẩn đoán ghi trên phiếu: Possible ILD');
  // Source columns and legend meaning are distinct; legacy records also render two columns.
  const panelValue={panel:'myositis',component:'intensity',numeric_value:'17',class_raw:'0',class_symbol:'o',qualitative_value:'negative',class_interpretation_origin:'source_legend'};
  const panelJson=JSON.stringify(panelValue);
  assert.equal(call(`resultText(${panelJson})`),'Intensity: 17 · Class: o');
  assert.equal(call(`myositisInterpretationText(${panelJson})`),'Theo chú giải trên phiếu: Negative');
  assert.equal(call(`resultText({panel:'myositis',component:'intensity',numeric_value:'0',class_raw:'o',qualitative_value:'negative'})`),'Intensity: 0 · Class: o');
  assert.equal(call(`myositisInterpretationText({panel:'myositis',component:'intensity',numeric_value:'17',class_raw:'?'})`),null);
  assert.equal(call(`myositisInterpretationText(null)`),null);
  assert.equal(call(`resultText({panel:'myositis',component:'result',numeric_value:'17',qualitative_value:'negative'})`),'17 · negative','A printed numeric/text Result must retain its meaning');
  assert.equal(call(`patientCandidateText({kind:'metadata',metadata_key:'additional_lab_result',value:{value:{name:'New antigen',panel:'myositis',results:{intensity:'18'},class_raw:'0',class_symbol:'o',interpretation:'negative'}}})`),'New antigen · Intensity: 18 · Class: o');
  console.log('Patient catalog, multi-select, confirmation, retry and stale-response checks passed (no browser/layout assertion).');
})().catch(error=>{console.error(error);process.exitCode=1;});
