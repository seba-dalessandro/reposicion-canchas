import { readSheet } from 'read-excel-file/browser'
import { supabase } from '../../lib/supabase'
import type { Database, SkuImportClassification, SkuStatus } from '../../types/database'

type SkuRow = Database['public']['Tables']['skus']['Row']

export type ParsedSkuRow = {
  rowNumber: number
  sku_code: string
  description: string
  status_file: SkuStatus | null
  rawStatus: string
  error?: string
}

export type PreviewSkuRow = ParsedSkuRow & {
  classification: SkuImportClassification
  existing?: SkuRow
  error?: string
}

export type ImportSummary = Record<SkuImportClassification, number>

export type SkuImportPreview = {
  fileName: string
  totalRows: number
  rows: PreviewSkuRow[]
  summary: ImportSummary
  missingHeaders: string[]
}

const requiredHeaders = ['Articulo', 'Descripcion articulo', 'Anulado'] as const

function emptySummary(): ImportSummary {
  return {
    nuevo: 0,
    existente: 0,
    modificado: 0,
    duplicado_archivo: 0,
    error: 0,
  }
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase()
}

function cellToString(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return String(value.result ?? '')
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { text?: string }) => part.text ?? '').join('')
    }
  }
  return String(value)
}

function parseStatusFile(value: string): { status: SkuStatus | null; error?: string } {
  const normalized = value.trim().toLowerCase()

  if (['', 'no', 'n', 'false', '0', 'activo', 'activa'].includes(normalized)) {
    return { status: 'active' }
  }

  if (['si', 'sí', 's', 'true', '1', 'anulado', 'anulada'].includes(normalized)) {
    return { status: 'voided' }
  }

  return { status: null, error: `Valor de Anulado no reconocido: ${value}` }
}

function detectCsvDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const commaCount = (firstLine.match(/,/g) ?? []).length
  const semicolonCount = (firstLine.match(/;/g) ?? []).length
  return semicolonCount > commaCount ? ';' : ','
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let row: string[] = []
  let inQuotes = false
  const delimiter = detectCsvDelimiter(text)

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      row.push(current)
      current = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(current)
      rows.push(row)
      row = []
      current = ''
      continue
    }

    current += char
  }

  if (current || row.length > 0) {
    row.push(current)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

async function readFileRows(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'csv') {
    return parseCsv(await file.text())
  }

  if (extension === 'xlsx') {
    const rows = await readSheet(file)
    return rows
      .map((row: unknown[]) => row.map(cellToString))
      .filter((cells: string[]) => cells.some((cell) => cell.trim() !== ''))
  }

  throw new Error('El archivo debe ser CSV o XLSX.')
}

function mapRows(rows: string[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, header, index) => {
    acc[normalizeHeader(header)] = index
    return acc
  }, {})
}

function classifyRow(row: ParsedSkuRow, existing: SkuRow | undefined): PreviewSkuRow {
  if (row.error) {
    return { ...row, classification: 'error' }
  }

  if (!existing) {
    return { ...row, classification: 'nuevo' }
  }

  const changed =
    existing.description.trim() !== row.description.trim() || existing.status_file !== row.status_file

  return {
    ...row,
    existing,
    classification: changed ? 'modificado' : 'existente',
  }
}

export async function buildSkuImportPreview(file: File): Promise<SkuImportPreview> {
  const rows = await readFileRows(file)
  const headers = rows[0] ?? []
  const headerMap = mapRows(headers)
  const missingHeaders = requiredHeaders.filter((header) => headerMap[normalizeHeader(header)] == null)

  if (missingHeaders.length > 0) {
    return {
      fileName: file.name,
      totalRows: 0,
      rows: [],
      summary: emptySummary(),
      missingHeaders,
    }
  }

  const seenCodes = new Set<string>()
  const parsedRows: PreviewSkuRow[] = rows.slice(1).map((cells, index) => {
    const rowNumber = index + 2
    const skuCode = (cells[headerMap[normalizeHeader('Articulo')]] ?? '').trim().toUpperCase()
    const description = (cells[headerMap[normalizeHeader('Descripcion articulo')]] ?? '').trim()
    const rawStatus = (cells[headerMap[normalizeHeader('Anulado')]] ?? '').trim()
    const statusResult = parseStatusFile(rawStatus)
    const errors = [
      skuCode ? null : 'Articulo es obligatorio',
      description ? null : 'Descripcion articulo es obligatoria',
      statusResult.error ?? null,
    ].filter(Boolean)

    const base: ParsedSkuRow = {
      rowNumber,
      sku_code: skuCode,
      description,
      status_file: statusResult.status,
      rawStatus,
      error: errors.join('. ') || undefined,
    }

    if (!base.error && seenCodes.has(skuCode)) {
      return { ...base, classification: 'duplicado_archivo' }
    }

    if (!base.error) seenCodes.add(skuCode)

    return { ...base, classification: base.error ? 'error' : 'existente' }
  })

  const codes = parsedRows
    .filter((row) => row.classification !== 'duplicado_archivo' && !row.error)
    .map((row) => row.sku_code)

  const existingByCode = new Map<string, SkuRow>()

  for (let index = 0; index < codes.length; index += 500) {
    const chunk = codes.slice(index, index + 500)
    const { data, error } = await supabase.from('skus').select('*').in('sku_code', chunk)

    if (error) throw error

    data?.forEach((sku) => existingByCode.set(sku.sku_code, sku))
  }

  const previewRows = parsedRows.map((row) => {
    if (row.classification === 'duplicado_archivo' || row.classification === 'error') return row
    return classifyRow(row, existingByCode.get(row.sku_code))
  })

  const summary = previewRows.reduce<ImportSummary>((acc, row) => {
    acc[row.classification] += 1
    return acc
  }, emptySummary())

  return {
    fileName: file.name,
    totalRows: previewRows.length,
    rows: previewRows,
    summary,
    missingHeaders,
  }
}

export async function confirmSkuImport(preview: SkuImportPreview, userId: string) {
  const validRows = preview.rows.filter(
    (row) => row.classification !== 'error' && row.classification !== 'duplicado_archivo',
  )
  const now = new Date().toISOString()

  const { data: importRecord, error: importError } = await supabase
    .from('sku_imports')
    .insert({
      file_name: preview.fileName,
      status: 'pending',
      total_rows: preview.totalRows,
      valid_rows: validRows.length,
      invalid_rows: preview.summary.error + preview.summary.duplicado_archivo,
      summary_new: preview.summary.nuevo,
      summary_existing: preview.summary.existente,
      summary_modified: preview.summary.modificado,
      summary_duplicado_archivo: preview.summary.duplicado_archivo,
      summary_error: preview.summary.error,
      created_by: userId,
    })
    .select('*')
    .single()

  if (importError) throw importError

  try {
    if (validRows.length > 0) {
      const { error: upsertError } = await supabase.from('skus').upsert(
        validRows.map((row) => ({
          sku_code: row.sku_code,
          description: row.description,
          status_file: row.status_file ?? 'active',
          last_file_import_at: now,
        })),
        { onConflict: 'sku_code' },
      )

      if (upsertError) throw upsertError
    }

    const codes = preview.rows.map((row) => row.sku_code).filter(Boolean)
    const { data: skus, error: skuError } = await supabase.from('skus').select('*').in('sku_code', codes)

    if (skuError) throw skuError

    const skuByCode = new Map((skus ?? []).map((sku) => [sku.sku_code, sku]))

    const { error: detailError } = await supabase.from('sku_import_details').insert(
      preview.rows.map((row) => {
        const currentSku = skuByCode.get(row.sku_code)

        return {
          import_id: importRecord.id,
          row_number: row.rowNumber,
          sku_code: row.sku_code || '(vacio)',
          description: row.description || null,
          status_file: row.status_file,
          classification: row.classification,
          previous_description: row.existing?.description ?? null,
          previous_status_file: row.existing?.status_file ?? null,
          status_manual: currentSku?.status_manual ?? row.existing?.status_manual ?? null,
          effective_status: currentSku?.effective_status ?? null,
          status_source: currentSku?.status_source ?? null,
          error_message: row.error ?? null,
          sku_id: currentSku?.id ?? row.existing?.id ?? null,
        }
      }),
    )

    if (detailError) throw detailError

    const { error: closeError } = await supabase
      .from('sku_imports')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', importRecord.id)

    if (closeError) throw closeError

    return importRecord.id
  } catch (error) {
    await supabase.from('sku_imports').update({ status: 'failed' }).eq('id', importRecord.id)
    throw error
  }
}
