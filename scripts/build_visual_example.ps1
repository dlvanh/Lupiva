$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$derivedRoot = Join-Path $taskRoot 'examples/derived'
$contract = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $taskRoot 'schemas/crf-template-fields.json') | ConvertFrom-Json
$sample = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $derivedRoot 'crf-empty.json') | ConvertFrom-Json
$bundle = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $derivedRoot 'visual-reading-overrides.json') | ConvertFrom-Json
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $derivedRoot 'example-files.json') | ConvertFrom-Json
foreach ($override in $bundle.overrides.PSObject.Properties) {
    $target = $sample.fields.PSObject.Properties[$override.Name]
    if ($null -eq $target) { throw "Unknown field: $($override.Name)" }
    foreach ($property in $override.Value.PSObject.Properties) {
        $target.Value | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value -Force
    }
}
$sample.unmapped_source_items = @($bundle.extras)
$sample.warnings = @($sample.warnings) + @($bundle.notes) + @('Nhóm ảnh thành ca theo thư mục mẫu chưa thay thế xác nhận định danh; IN12 không thấy định danh. Chưa đo confidence OCR hoặc tọa độ bbox.')
$statusCounts = [ordered]@{}
$fields = @($sample.fields.PSObject.Properties)
foreach ($group in ($fields | Group-Object { $_.Value.status } | Sort-Object Name)) { $statusCounts[$group.Name] = $group.Count }
$sample.summary = [ordered]@{catalog_entries=$fields.Count;status_counts=$statusCounts;all_catalog_entries_present=$true;automatic_ocr_executed=$false;word_cell_binding_complete=$false;independently_verified=$false}
if ($fields.Count -ne 261) { throw 'Incomplete catalog coverage.' }
foreach ($definition in $contract.field_catalog) {
    $field = $sample.fields.PSObject.Properties[$definition.field_id].Value
    if ($null -eq $field -or $field.status -notin $definition.allowed_statuses) { throw "Invalid field/status: $($definition.field_id)" }
    if ($field.status -eq 'found' -and (@($field.values).Count -eq 0 -or @($field.evidence).Count -eq 0)) { throw "Missing value/evidence: $($definition.field_id)" }
    if ($field.status -ne 'found' -and $null -ne $field.selected_value) { throw "Unresolved field has selected value: $($definition.field_id)" }
    foreach ($evidence in @($field.evidence)) {
        $source = @($manifest | Where-Object { $_.id -eq $evidence.source_id -and $_.path -eq $evidence.file -and $_.role -eq 'source_input' })
        if ($source.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $taskRoot $evidence.file))) { throw "Invalid source: $($definition.field_id)" }
    }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $derivedRoot 'crf-example-001.json'), ($sample | ConvertTo-Json -Depth 40), $utf8)
function Cell($value) { ([string]$value).Replace('|','/').Replace("`r",' ').Replace("`n",' ') }
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Bản đọc thử input theo toàn bộ danh mục CRF')
$lines.Add('')
$lines.Add('Bản nháp đọc trực quan từ ảnh, chưa chạy engine OCR tự động và chưa được đối chiếu độc lập. 261 mục là danh mục khái niệm/tiêu chí, không phải số ô Word. Ảnh outputs không dùng làm nguồn giá trị. Việc gom ảnh thành một ca theo thư mục mẫu chưa thay thế xác nhận định danh bệnh nhân.')
$lines.Add('')
$lines.Add('Mọi mục đều được liệt kê. Có giá trị trong nguồn mới điền; thiếu thông tin không có nghĩa là âm tính. Các giá trị trong nhóm ambiguous_mapping chỉ là ứng viên, chưa được chọn để điền vào ô Word.')
$lines.Add('')
foreach ($key in $statusCounts.Keys) { $lines.Add(('- {0}: {1} mục.' -f $key,$statusCounts[$key])) }
$lines.Add('')
$section = ''
foreach ($definition in $contract.field_catalog) {
    if ($section -ne $definition.section) {
        $section = $definition.section
        $lines.Add(''); $lines.Add('## '+$section); $lines.Add('')
        $lines.Add('| Mã | Trường Word | Giá trị / ứng viên đọc được | Trạng thái | Nguồn |')
        $lines.Add('| --- | --- | --- | --- | --- |')
    }
    $field = $sample.fields.PSObject.Properties[$definition.field_id].Value
    $valueText = (@($field.values) | ForEach-Object { $_.raw }) -join '; '
    if ([string]::IsNullOrWhiteSpace($valueText)) { $valueText = $field.reason }
    $evidenceText = (@($field.evidence) | ForEach-Object { '[{0}](../../{1})' -f $_.source_id,$_.file }) -join '; '
    $lines.Add(('| {0} | {1} | {2} | {3} | {4} |' -f $definition.field_id,(Cell $definition.label),(Cell $valueText),$field.status,$evidenceText))
}
$lines.Add(''); $lines.Add('## Dữ liệu nguồn chưa có ô tương ứng'); $lines.Add('')
foreach ($extra in $bundle.extras) { $lines.Add(('- {0} / {1}: {2}. {3}' -f $extra.source_id,$extra.source_label,$extra.raw,$extra.reason)) }
$lines.Add(''); $lines.Add('## Điểm cần đối chiếu'); $lines.Add('')
foreach ($note in $sample.warnings) { $lines.Add('- '+$note) }
foreach ($field in $fields | Where-Object { $_.Value.status -eq 'ambiguous_mapping' }) { $lines.Add(('- {0}: {1}' -f $field.Name,$field.Value.reason)) }
[System.IO.File]::WriteAllText((Join-Path $derivedRoot 'CRF-EXAMPLE-001.md'), ($lines -join "`r`n"), $utf8)
$sample.summary | ConvertTo-Json -Depth 5
