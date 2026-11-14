// Production navigation/rendering with deliberately reversed responses.
// Synthetic DOM and sources; this is not browser visual QA.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../registry_review/review.html'),'utf8');
class Element{
 constructor(tag){this.tag=tag;this.tagName=tag.toUpperCase();this.children=[];this.options=[];this.value='';this.style={};this.dataset={};}
 append(...items){this.children.push(...items)}prepend(...items){this.children.unshift(...items)}
 replaceChildren(...items){this.children=items;this.options=[];this.value=''}
 add(option){this.options.push(option);if(this.options.length===1)this.value=option.value}
 setAttribute(k,v){this[k]=v}
}
const elements=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element('static')]));
const walk=root=>[root,...root.children.flatMap(walk)];
const pkg={package_id:'future-package',revision:1,source_available:true,
 documents:['A','B'].map(id=>({document_id:'D'+id,source_document_id:'SYNTHETIC-'+id,source_url:'/source-'+id+'.png',assignment:{identity_status:'confirmed',assignment_id:'link-'+id,case_id:'C1',confirmed_by:{name:'Synthetic'}}})),
 observations:['A','B'].map(id=>({observation_id:'O'+id,document_id:'D'+id,field_id:'IMM11',label:'C3 '+id,component:'result',
  source_data:{result_raw:id},editable_value:{result_type:'numeric',numeric_value:'0.65',unit_raw:'g/L'},history:[],replacement_options:[],source_review_status:'pending',
  evidence:[1,2].map(i=>({source_data:{table_id:id+i},crop_url:'/crop-'+id+i+'.png',raw_url:'/raw-'+id+i+'.txt'}))})),
 metadata_candidates:[],specimen_candidates:[]};
pkg.observations[1].evidence[1].source_data.region={llm_row_location:{
 coordinate_space:'outgoing_image_1000',box:[50,110,950,170],image_size:[700,500]}};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const packageRequests=[],rawRequests=[],decisions=[];let holdPackages=true,holdRaw=false;
const context=vm.createContext({document:{getElementById:id=>elements[id]||[elements.candidate,elements.metadata,elements.specimens].flatMap(walk).find(n=>n.id===id),createElement:tag=>new Element(tag),querySelectorAll:()=>[]},
 Option:class{constructor(label,value){this.label=label;this.value=value}},URLSearchParams,console,
 fetch:async(url,options)=>{
  if(url.startsWith('/api/package?')){if(holdPackages){const request=deferred();packageRequests.push(request);await request.promise}return {ok:true,json:async()=>structuredClone(pkg)}}
  if(url.startsWith('/raw-')){const request=deferred();rawRequests.push({url,...request});return {ok:true,text:async()=>holdRaw?request.promise:url}}
  if(url==='/api/review'){const decision=JSON.parse(options.body);decisions.push(decision);if(decision.action==='correct')Object.assign(pkg.observations.find(o=>o.observation_id===decision.observation_id).editable_value,decision.changes);return {ok:true,json:async()=>({status:'recorded'})}}
  throw Error('Unexpected URL '+url);
 }});
const startup="run(async()=>{await refreshSummary();await loadPatient();await refreshIntakes();message('')});";
vm.runInContext(html.match(/<script nonce="\{\{NONCE\}\}">([\s\S]*?)<\/script>/)[1].replace('{{CSRF_TOKEN}}','"test-token"').replace(startup,''),context);
const call=code=>vm.runInContext(code,context),flush=()=>new Promise(r=>setImmediate(r));
// Patient/catalog loading and approval panels are covered separately; keep the
// actual package loader, document/observation selection and image/raw renderer.
call("summary={cases:[],encounters:[]};let patientLoadCalls=0;loadPatient=async()=>{patientLoadCalls++};const actualMetadata=renderMetadata,actualSpecimens=renderSpecimens;renderSourceSummary=()=>{};renderMetadata=()=>{};renderSpecimens=()=>{};sourcePanel=()=>node('div');");
elements.package.add({value:JSON.stringify(['future-package',1])});
context.targetA={package_id:pkg.package_id,revision:1,document_id:'DA',candidate_id:'OA',kind:'observation'};
context.targetB={package_id:pkg.package_id,revision:1,document_id:'DB',candidate_id:'OB',kind:'observation'};
function selectedSource(){return walk(elements.candidate).find(n=>n.tag==='a'&&n.textContent==='Mở toàn bộ ảnh nguồn')?.href}
function currentCrop(){return walk(elements.candidate).find(n=>n.tag==='img')?.src}
(async()=>{
 const older=call('openSourceEditor(targetA)');await flush();
 const newer=call('openSourceEditor(targetB)');await flush();assert.equal(packageRequests.length,2);
 packageRequests[1].resolve();await newer;await flush();
 assert.equal(call('selectedId'),'OB');assert.equal(selectedSource(),'/source-B.png');assert.equal(currentCrop(),'/crop-B1.png');
 packageRequests[0].resolve();await older;await flush();
 assert.equal(call('selectedId'),'OB','A delayed previous click must not replace the latest requested value or image');
 assert.equal(elements.document.value,'DB');assert.equal(selectedSource(),'/source-B.png');assert.equal(currentCrop(),'/crop-B1.png');

 holdPackages=false;holdRaw=true;rawRequests.length=0;
 await call('openSourceEditor(targetB)');await flush();
 const firstRaw=rawRequests.at(-1);
  assert.equal(walk(elements.candidate).some(n=>n.className==='source-row-mark'),false);
 const evidence=walk(elements.candidate).find(n=>n.tag==='select'&&n.options[0]?.value==='0');
 evidence.value='1';evidence.onchange();await flush();
 assert.equal(currentCrop(),'/crop-B2.png');
  const crop=walk(elements.candidate).find(n=>n.tag==='img');
  const mark=walk(elements.candidate).find(n=>n.className==='source-row-mark');
  Object.assign(crop,{naturalWidth:701,naturalHeight:500});crop.onload();
  assert.equal(mark.hidden,true,'A highlight must be hidden on mismatched image dimensions');
  crop.naturalWidth=700;crop.onload();
  assert.equal(mark.hidden,false);
  assert.deepEqual(mark.style,{left:'5%',top:'11%',width:'90%',height:'6%'});
 rawRequests.at(-1).resolve('SECOND CURRENT RAW');await flush();
 firstRaw.resolve('FIRST STALE RAW');await flush();
 const raw=walk(elements.candidate).find(n=>n.tag==='pre');
 assert.equal(raw.textContent,'SECOND CURRENT RAW','OCR text must stay paired with the currently selected crop');

 holdRaw=false;holdPackages=true;
 const pending=call('openSourceEditor(targetA)');await flush();
 assert.equal(currentCrop(),undefined,'Previous image is cleared while the next source loads');
 assert.equal(elements.document.disabled,true);
 packageRequests.at(-1).resolve();await pending;await flush();
 assert.equal(call('selectedId'),'OA');assert.equal(selectedSource(),'/source-A.png');assert.equal(currentCrop(),'/crop-A1.png');
 assert.equal(elements.document.disabled,false);

 // Viewing a source must preserve the bulk choices on the patient screen.
 holdPackages=false;call("patientSelected.add('chosen-before-view')");
 const before=call('patientLoadCalls');await call('openSourceEditor(targetB)');await flush();
 assert.equal(call('patientSelected.size'),1);assert.equal(call('patientLoadCalls'),before);
 assert.equal(elements.reviewEditor.hidden,false);assert.equal(elements.editorBackdrop.hidden,false);
 elements.actor.value='Synthetic reviewer';elements.role.value='source_reviewer';
 call("$('value-numeric_value').value='0.93';$('reviewReason').value='Read synthetic source'");
 await assert.rejects(call("saveReview('accept')"),/chỉnh sửa/);
 assert.equal(decisions.length,0,'Changing a value cannot silently use the unchanged-value approval action');
 await call("saveReview('correct')");await flush();
 assert.equal(decisions.length,1);assert.equal(decisions[0].observation_id,'OB');
 assert.deepEqual(decisions[0].changes,{numeric_value:'0.93'});assert.equal(decisions[0].expected_assignment_id,'link-B');
 assert.equal(call("$('value-numeric_value').value"),'0.93');assert.equal(elements.reviewEditor.hidden,false);

 // The drawer shows only the selected metadata/sample from the document.
 const ev={source_data:{table_id:'META'},crop_url:'/crop-B1.png',raw_url:'/raw-B1.txt'};
 pkg.metadata_candidates=['M1','M2'].map(id=>({candidate_id:id,document_id:'DB',key:id,source_data:{value:id,value_raw:id},evidence:[ev]}));
 pkg.specimen_candidates=['S1','S2'].map(id=>({sample_id:id,document_id:'DB',source_data:{sample_type:id,collection_datetime:{date:null},amount:{raw:'4 mL'},checkbox_state:'checked'},evidence:[ev]}));
 call('renderMetadata=actualMetadata;renderSpecimens=actualSpecimens');
 context.targetMetadata={...context.targetB,kind:'metadata',candidate_id:'M2'};
 await call('openSourceEditor(targetMetadata)');await flush();
 assert.equal(elements.candidate.hidden,true);assert.equal(elements.specimens.hidden,true);assert.equal(elements.metadata.hidden,false);
 const metadataText=walk(elements.metadata).map(n=>n.textContent||'').join(' ');assert.match(metadataText,/M2/);assert.doesNotMatch(metadataText,/M1/);
 context.targetSpecimen={...context.targetB,kind:'specimen',candidate_id:'S2'};
 await call('openSourceEditor(targetSpecimen)');await flush();
 assert.equal(elements.metadata.hidden,true);assert.equal(elements.specimens.hidden,false);
 const sampleText=walk(elements.specimens).map(n=>n.textContent||'').join(' ');assert.match(sampleText,/S2/);assert.doesNotMatch(sampleText,/S1/);
 elements.closeEditor.onclick();assert.equal(elements.reviewEditor.hidden,true);assert.equal(elements.editorBackdrop.hidden,true);
 holdPackages=true;const cancelled=call('openSourceEditor(targetA)');await flush();elements.closeEditor.onclick();
 packageRequests.at(-1).resolve();await cancelled;assert.equal(elements.reviewEditor.hidden,true);assert.equal(call('editorTarget'),null);
 console.log('Source navigation, crop/raw pairing, focused editor, close/cancel, preserved selection and correction routing checks passed (no browser/layout assertion).');
})().catch(error=>{console.error(error);process.exitCode=1});
