// Dependency-free controller checks; this does not claim browser/layout validation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../registry_review/review.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'DOM IDs must be unique');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.options = []; this.value = ''; this.hidden = false; this.disabled = false; this.style = {}; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; this.options = []; this.value = ''; }
  add(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; }
  setAttribute(key, value) { this[key] = value; }
}
const elements = Object.fromEntries(ids.map(id => [id, new Element('static')]));
const preview = {
  preview_id: 'preview-1', case: {registry_code: 'DEMO'}, synthetic: true,
  redcap: {enabled: true, counts: {encounters: 2, observations: 4, metadata: 0, specimens: 0},
    accepted_fields: 2, catalog_fields: 261, missing_measurement_dates: 4, placeholders: 0},
  word: {enabled: false, disabled_reason: 'Choose visit'},
  excluded: {count: 1, reasons: {no_current_uncontested_case_acceptance: 1}}, unassigned_global_count: 2
};
let previewResponse = async () => preview;
let createResponse = async () => ({report: {}, files: [{name: 'redcap-import.csv', url: '/safe-download'}]});
const requests = [];
const context = vm.createContext({
  document: {getElementById: id => elements[id], createElement: tag => new Element(tag)},
  Option: class { constructor(label, value) { this.label = label; this.value = value; } },
  URLSearchParams, console,
  fetch: async (url, options) => {
    const payload = options?.body ? JSON.parse(options.body) : null;
    requests.push({url, payload});
    let data;
    if (url === '/api/intakes') data = {jobs: []};
    else if (url === '/api/summary') data = {packages: [], cases: [{case_id: 'C1', registry_code: 'DEMO'}, {case_id: 'C2', registry_code: 'OTHER'}], encounters: [{case_id: 'C1', encounter_id: 'V1', label: 'Visit'}]};
    else if (url === '/api/exports/options') data = {synthetic: true, field_count: 261, component_count: 377, project_namespace: 'test', word_bound_fields: 63, output_directory: 'local'};
    else if (url === '/api/exports/preview') data = await previewResponse();
    else if (url === '/api/exports/create') data = await createResponse();
    else if (url.startsWith('/api/patient?')) data = {cases: [{registry_code: 'DEMO'}], documents: [], observations: [], metadata: [], specimens: [], field_states: {}, labels: {}, metadata_conflicts: {}};
    else throw Error('Unexpected endpoint ' + url);
    return {ok: !data.error, json: async () => data};
  }
});
const script = html.match(/<script nonce="\{\{NONCE\}\}">([\s\S]*?)<\/script>/)[1].replace('{{CSRF_TOKEN}}', '"test-token"');
vm.runInContext(script, context); // Also parses the complete production script.
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  await flush();
  // Export functions remain compatible; they are no longer on the main page.
  await vm.runInContext('refreshExportConfig()',context);
  assert.equal(elements.createRedcap.disabled, true);
  elements.exportCase.value = 'C1'; elements.exportCase.onchange();
  await elements.previewExport.onclick();
  assert.equal(elements.createRedcap.disabled, false);
  assert.equal(elements.createWord.disabled, true);
  assert.equal(elements.exportReport.hidden, false);
  await elements.createRedcap.onclick();
  assert.equal(elements.exportDownloads.children.length, 1);
  assert.deepEqual(requests.at(-1).payload, {preview_id: 'preview-1', format: 'redcap'});
  assert.match(elements.exportConfig.textContent, /261/);

  // A response for the previous selection must never enable the new selection.
  let release;
  previewResponse = () => new Promise(resolve => { release = resolve; });
  const pending = elements.previewExport.onclick();
  assert.equal(elements.previewExport.disabled, true);
  elements.exportCase.value = 'C2'; elements.exportCase.onchange();
  release(preview); await pending;
  assert.equal(elements.createRedcap.disabled, true);
  assert.equal(elements.exportReport.hidden, true);
  assert.equal(elements.exportDownloads.children.length, 0);

  previewResponse = async () => preview;
  await elements.previewExport.onclick();
  createResponse = async () => ({error: 'Preview changed; reload'});
  await elements.createRedcap.onclick();
  assert.equal(elements.createRedcap.disabled, true);
  assert.match(elements.status.textContent, /Preview changed/);
  assert.equal(elements.exportDownloads.children.length, 0);
  console.log('Review export controller smoke checks passed (no browser/layout assertion).');
})().catch(error => { console.error(error); process.exitCode = 1; });
