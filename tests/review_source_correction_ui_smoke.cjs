// Production controller, synthetic DOM and records; no browser/layout claim.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../registry_review/review.html'),'utf8');
class Element {
 constructor(tag){this.tag=tag;this.tagName=tag.toUpperCase();this.children=[];this.options=[];this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.style={};}
 append(...values){this.children.push(...values);}
 replaceChildren(...values){this.children=values;this.options=[];this.value='';}
 add(option){this.options.push(option);if(this.options.length===1)this.value=option.value;}
 setAttribute(key,value){this[key]=value;}
}
const elements=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element('static')]));
const requests=[];let failNext=false;
const ctx=vm.createContext({document:{getElementById:id=>elements[id],createElement:tag=>new Element(tag)},
 Option:class{constructor(label,value){this.label=label;this.value=value;}},URLSearchParams,crypto,console,
 fetch:async(url,options)=>{const payload=JSON.parse(options.body);requests.push({url,payload});if(failNext){failNext=false;throw Error('Synthetic network interruption');}return {ok:true,json:async()=>({status:'recorded'})};}});
const startup="run(async()=>{await refreshSummary();await loadPatient();await refreshIntakes();message('')});";
const script=html.match(/<script nonce="\{\{NONCE\}\}">([\s\S]*?)<\/script>/)[1].replace('{{CSRF_TOKEN}}','"test-token"').replace(startup,'');
vm.runInContext(script,ctx);
const call=code=>vm.runInContext(code,ctx);
const walk=root=>[root,...root.children.flatMap(walk)];
const item={sample_id:'future-sample',source_candidate_sha256:'source-hash',source_data:{collection_datetime:{date:null,date_raw:'bad OCR',time:null,time_raw:null},amount:{raw:'4 mL'},checkbox_state:'checked'},correction_fields:['collection_date','collection_time','amount','checkbox_state'],correction_history:[],source_review:null,source_review_history:[],evidence:[{evidence_id:'future-evidence',source_data:{table_id:'FUTURE-CROP'},crop_url:'/synthetic-crop'}]};
ctx.item=item;elements.actor.value='Synthetic editor';elements.role.value='source_reviewer';
call("current={package_id:'future-package',revision:3,package_sha256:'package-hash',source_available:true};loadPackage=async()=>{};");
(async()=>{
 let root=call("sourceCorrectionPanel('specimen',item)"),nodes=walk(root);
 const save=nodes.find(n=>n.tag==='button'),reason=nodes.find(n=>n.tag==='textarea');
 const date=nodes.find(n=>n['aria-label']==='Ngày thu mẫu (DD/MM/YYYY)');
 await save.onclick();assert.equal(requests.length,0,'Unchanged values cannot become a correction');
 date.value='14/03/2033';await save.onclick();assert.equal(requests.length,0,'Reason is mandatory');
 reason.value='Read synthetic future document';failNext=true;await save.onclick();await save.onclick();
 assert.equal(requests.length,2);assert.equal(requests[0].url,'/api/source-correction');
 assert.equal(requests[0].payload.request_id,requests[1].payload.request_id,'Network retry keeps one request ID');
 assert.deepEqual(requests[1].payload.changes,{collection_date:'14/03/2033'});
 assert.deepEqual(requests[1].payload.evidence_ids,['future-evidence']);
 assert.equal(requests[1].payload.expected_correction_id,null);
 assert.equal(item.source_data.collection_datetime.date,null,'Draft cannot overwrite source data in the controller');
 const pending={correction_id:'future-proposal',reviewer:{name:'Synthetic editor'},reason:'Read synthetic source',evidence_ids:['future-evidence'],before:item.source_data,after:{collection_datetime:{date:'2033-03-14'}}};
 item.correction_history=[pending];item.pending_correction=pending;
 root=call("sourceCorrectionPanel('specimen',item)");nodes=walk(root);
 const approve=nodes.find(n=>n.tag==='button'&&n.textContent==='Duyệt bản sửa này');
 const confirm=nodes.find(n=>n.type==='checkbox');
 assert.equal(root.open,true);assert.equal(approve.disabled,true);
 await approve.onclick();assert.equal(requests.length,2,'Approval requires explicit source comparison');
 confirm.checked=true;confirm.onchange();assert.equal(approve.disabled,false);
 failNext=true;await approve.onclick();await approve.onclick();
 assert.equal(requests[2].url,'/api/source-review');
 assert.equal(requests[2].payload.request_id,requests[3].payload.request_id);
 assert.equal(requests[3].payload.decisions[0].correction_id,'future-proposal');
 assert.equal(requests[3].payload.decisions[0].expected_review_id,null);
 const withdraw=nodes.find(n=>n.tag==='button'&&n.textContent==='Bỏ đề xuất này, giữ giá trị hiện hành');
 await withdraw.onclick();assert.equal(requests.length,4,'Withdrawing a proposal requires a reason');
 nodes.find(n=>n.tag==='textarea').value='The proposed date was not supported';
 failNext=true;await withdraw.onclick();await withdraw.onclick();
 assert.equal(requests[4].payload.action,'withdraw');
 assert.equal(requests[4].payload.request_id,requests[5].payload.request_id);
 assert.deepEqual(requests[5].payload.changes,{});
 assert.equal(item.source_data.collection_datetime.date,null);
 call('current.source_available=false');confirm.onchange();assert.equal(approve.disabled,true);
 const assessment=call("missingReasonText({reason:'clinical_assessment_required',parser_implemented:false})");
 assert.match(assessment,/đánh giá lâm sàng/);assert.doesNotMatch(assessment,/Chưa triển khai/);
 const lab={candidate_id:'synthetic-hct',source_candidate_sha256:'lab-hash',source_data:{key:'additional_lab_result',value_raw:'0.350',value:{name:'HCT',results:{result:'0.350'},unit_raw:'L/L'}},correction_fields:['result:result','unit_raw'],correction_history:[],source_review:null,source_review_history:[],evidence:item.evidence};
 ctx.lab=lab;call('current.source_available=true');
 root=call("sourceCorrectionPanel('metadata',lab)");nodes=walk(root);
 const labResult=nodes.find(n=>n['aria-label']==='Kết quả · Kết quả'),unit=nodes.find(n=>n['aria-label']==='Đơn vị');
 assert.equal(labResult.value,'0.350');assert.equal(unit.value,'L/L');
 labResult.value='0.355';unit.value='%';nodes.find(n=>n.tag==='textarea').value='Synthetic HCT correction';
 await nodes.find(n=>n.tag==='button'&&n.textContent==='Lưu đề xuất sửa').onclick();
 assert.deepEqual(requests.at(-1).payload.changes,{'result:result':'0.355',unit_raw:'%'});
 assert.equal(lab.source_data.value.results.result,'0.350');
 ctx.afterLab={...lab.source_data,value:{...lab.source_data.value,unit_raw:'%'}};
 assert.match(call("sourceValueText('metadata',afterLab)"),/%/,'Unit corrections must be visible in before/after comparison');
 console.log('Source correction editor, confirmation, evidence, retry and missing-reason controller checks passed (no browser/layout assertion).');
})().catch(error=>{console.error(error);process.exitCode=1;});
