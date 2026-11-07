$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$schemaRoot = Join-Path $taskRoot 'schemas'
$derivedRoot = Join-Path $taskRoot 'examples/derived'
New-Item -ItemType Directory -Force -Path $schemaRoot,$derivedRoot | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Save-Json($path, $value) {
    [System.IO.File]::WriteAllText($path, ($value | ConvertTo-Json -Depth 35), $utf8)
}
$fields = @()
$section = ''
$sectionSource = ''
foreach ($line in Get-Content -LiteralPath (Join-Path $taskRoot 'CRF-DATA-ANALYSIS.md') -Encoding UTF8) {
    if ($line -match '^### 4\.\d+\s+(.+)$') { $section = $matches[1]; $sectionSource = '' }
    if ($line -match '^Nguồn:\s*(.+)$') { $sectionSource = $matches[1] }
    if ($line -notmatch '^\| ([A-Z]{2,4}\d{2}) \|') { continue }
    $parts = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
    $id = $parts[0]
    $family = $id -replace '\d+$',''
    $label = $parts[1]
    if ($family -eq 'EAC') { $label = $parts[2] }
    $fieldType = if ($family -in @('ANA','MYO')) { 'PANEL_RESULT' } elseif ($family -eq 'PFT') { 'MEASUREMENT' } elseif ($family -in @('EAC','SDA')) { 'ASSESSMENT_RECORDED' } else { $parts[2] }
    $fields += [ordered]@{
        field_id=$id; section=$section; family=$family; label=$label; field_type=$fieldType
        catalog_columns=$parts; word_source_context=$sectionSource
        preserve_repeated_slots=($family -eq 'PFT')
        input_evidence_required=$true
        allowed_statuses=@('found','not_found','unreadable','conflict','ambiguous_mapping','not_applicable','requires_clinical_assessment','not_computed')
    }
}
if ($fields.Count -ne 261) { throw "Expected 261 catalog entries, found $($fields.Count)." }
if (($fields.field_id | Sort-Object -Unique).Count -ne 261) { throw 'Duplicate field identifiers.' }
$doc = Get-Item -LiteralPath (Join-Path $taskRoot '260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx')
$contract = [ordered]@{
    contract_version='crf-docx-v1'; created_on='2026-11-05'
    authority='User confirmed DOCX was filtered for lupus. It alone controls target fields and layout. Output photos are references only; do not restore excluded non-lupus sections.'
    template_filename=$doc.Name; template_sha256=(Get-FileHash -LiteralPath $doc.FullName -Algorithm SHA256).Hash
    catalog_entry_count=261
    count_note='Catalog entries include compound fields and assessment items. They are not a count of independent Word cells. Repeated PFT rows and panel subfields must be preserved.'
    missing_value_policy='Emit every field with value/status; absence is never negative. Do not fabricate values or silently calculate clinical assessments.'
    field_catalog=$fields
}
Save-Json (Join-Path $schemaRoot 'crf-template-fields.json') $contract

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($doc.FullName)
try {
    $reader = New-Object System.IO.StreamReader($archive.GetEntry('word/document.xml').Open())
    try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $blocks = @(); $blockNumber = 0; $tableNumber = 0
    foreach ($node in $xml.SelectSingleNode('//w:body', $ns).ChildNodes) {
        $blockNumber++
        if ($node.LocalName -eq 'tbl') {
            $tableNumber++; $rows = @(); $rowNumber = 0
            foreach ($tr in $node.SelectNodes('./w:tr', $ns)) {
                $rowNumber++; $cells = @(); $cellNumber = 0
                foreach ($tc in $tr.SelectNodes('./w:tc', $ns)) {
                    $cellNumber++
                    $paragraphs = @($tc.SelectNodes('./w:p', $ns) | ForEach-Object {
                        ($_.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.InnerText }) -join ''
                    })
                    $symbols = @($tc.SelectNodes('.//w:sym', $ns) | ForEach-Object {
                        [ordered]@{font=$_.GetAttribute('font',$ns.LookupNamespace('w'));char=$_.GetAttribute('char',$ns.LookupNamespace('w'))}
                    })
                    $cells += [ordered]@{cell=$cellNumber;anchor="B${blockNumber}.R${rowNumber}.C${cellNumber}";paragraphs=$paragraphs;symbols=$symbols}
                }
                $rows += [ordered]@{row=$rowNumber;cells=$cells}
            }
            $blocks += [ordered]@{block=$blockNumber;kind='table';table=$tableNumber;rows=$rows}
        } elseif ($node.LocalName -eq 'p') {
            $blocks += [ordered]@{block=$blockNumber;kind='paragraph';text=(($node.SelectNodes('.//w:t',$ns) | ForEach-Object {$_.InnerText}) -join '')}
        }
    }
    Save-Json (Join-Path $schemaRoot 'crf-word-structure.json') ([ordered]@{
        contract_version='crf-docx-v1';template_sha256=$contract.template_sha256
        table_count=$tableNumber;notes='Source inventory, not a completed cell binding. Keep original DOCX for merged-cell layout and formatting.';blocks=$blocks
    })
    if ($tableNumber -ne 20) { throw "Expected 20 Word tables, found $tableNumber." }
} finally { $archive.Dispose() }

$publicManifest = @()
foreach ($group in @('inputs','outputs')) {
    $index = 0
    foreach ($sourceFile in (Get-ChildItem -LiteralPath (Join-Path $taskRoot ('examples/'+$group)) -File | Sort-Object Name)) {
        $index++
        $prefix = if ($group -eq 'inputs') { 'IN' } else { 'OUT' }
        $publicManifest += [ordered]@{id=('{0}{1:00}' -f $prefix,$index);role=$(if ($group -eq 'inputs') {'source_input'} else {'reference_output_only'});path=('examples/'+$group+'/'+$sourceFile.Name);sha256=(Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash}
    }
}
Save-Json (Join-Path $derivedRoot 'example-files.json') $publicManifest

$resultFields = [ordered]@{}
foreach ($field in $fields) {
    $status = 'not_found'; $reason = 'Chưa thấy dữ liệu tương ứng trong bộ ảnh inputs đã kiểm tra; không dùng ảnh outputs để điền ngược.'
    if ($field.family -in @('EAC','SDA')) {
        $status = 'requires_clinical_assessment'; $reason = 'Không có lựa chọn/đánh giá điểm trực tiếp từ inputs; không dùng số điểm in sẵn trong mẫu làm điểm bệnh nhân.'
    }
    if ($field.field_id -eq 'ADM07') { $status='not_computed'; $reason='Không thấy BMI được ghi trong inputs; đợt minh họa không tự tính.' }
    $resultFields[$field.field_id] = [ordered]@{label=$field.label;status=$status;values=@();selected_value=$null;reason=$reason;evidence=@()}
}
Save-Json (Join-Path $derivedRoot 'crf-empty.json') ([ordered]@{
    contract_version='crf-docx-v1';case_id='EXAMPLE-001';template_sha256=$contract.template_sha256
    creation_method='Visual reading of local input images by assistant; not an automated OCR engine result, not an independently verified benchmark.'
    review_status='draft_needs_review';input_role='examples/inputs only';reference_outputs_used_as_evidence=$false
    input_files=@($publicManifest | Where-Object {$_.role -eq 'source_input'})
    fields=$resultFields;unmapped_source_items=@();warnings=@('Word đã được người dùng lọc cho lupus và là chuẩn duy nhất. Không thêm lại phần ngoài Word từ ảnh output.');summary=$null
})
'Created full 261-entry catalog, 20-table Word inventory, file manifest, and complete field skeleton.'
