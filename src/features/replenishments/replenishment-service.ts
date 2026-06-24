import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../types/database'

export type ReplenishmentStatus = 'active' | 'voided'
export type SkuOption = Database['public']['Tables']['skus']['Row']
export type CourtOption = Database['public']['Tables']['courts']['Row']
export type ForkliftOption = Database['public']['Tables']['forklifts']['Row']
export type DriverOption = Database['public']['Tables']['drivers']['Row']
export type ProfileOption = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'email' | 'full_name'>
export type ReplenishmentOperation = Database['public']['Tables']['replenishment_operations']['Row']
export type ReplenishmentItem = Database['public']['Tables']['replenishment_items']['Row']
export type ReplenishmentReportRow = Database['public']['Views']['v_replenishments_report']['Row']

export type ReplenishmentRecord = ReplenishmentReportRow & {
  profiles: ProfileOption | null
}

export type ReplenishmentFilters = {
  fechaDesde?: string
  fechaHasta?: string
  courtId?: string
  forkliftId?: string
  skuText?: string
  userId?: string
  status?: ReplenishmentStatus | 'all'
}

export type CreateReplenishmentItemInput = {
  sku_id: string
  cantidad_paletas: number
  observacion?: string | null
}

export type CreateReplenishmentOperationInput = {
  fecha_operativa: string
  hora_operativa: string
  driver_id?: string | null
  forklift_id?: string | null
  court_id: string
  items: CreateReplenishmentItemInput[]
}

async function loadActiveSkus() {
  const pageSize = 1000
  const skus: SkuOption[] = []
  let page = 0

  while (true) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('skus')
      .select('*')
      .eq('effective_status', 'active')
      .order('sku_code', { ascending: true })
      .range(from, to)

    if (error) throw error

    skus.push(...(data ?? []))

    if (!data || data.length < pageSize) break
    page += 1
  }

  return skus
}

export async function loadReplenishmentLookups() {
  const [skusResult, courtsResult, forkliftsResult, driversResult, profilesResult] = await Promise.all([
    loadActiveSkus(),
    supabase.from('courts').select('*').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('forklifts').select('*').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('drivers').select('*').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('profiles').select('id, email, full_name').eq('is_active', true).order('email', { ascending: true }),
  ])

  if (courtsResult.error) throw courtsResult.error
  if (forkliftsResult.error) throw forkliftsResult.error
  if (driversResult.error) throw driversResult.error
  if (profilesResult.error) throw profilesResult.error

  return {
    skus: skusResult,
    courts: courtsResult.data ?? [],
    forklifts: forkliftsResult.data ?? [],
    drivers: driversResult.data ?? [],
    profiles: profilesResult.data ?? [],
  }
}

function withProfiles(rows: ReplenishmentReportRow[], profiles: ProfileOption[]) {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))

  return rows.map((row) => ({
    ...row,
    profiles: row.created_by ? profilesById.get(row.created_by) ?? null : null,
  }))
}

export async function loadReplenishments(filters: ReplenishmentFilters) {
  let query = supabase
    .from('v_replenishments_report')
    .select('*')
    .order('fecha_operativa', { ascending: false })
    .order('operation_created_at', { ascending: false })
    .limit(1000)

  if (filters.fechaDesde) query = query.gte('fecha_operativa', filters.fechaDesde)
  if (filters.fechaHasta) query = query.lte('fecha_operativa', filters.fechaHasta)
  if (filters.courtId) query = query.eq('court_id', filters.courtId)
  if (filters.forkliftId) query = query.eq('forklift_id', filters.forkliftId)
  if (filters.userId) query = query.eq('created_by', filters.userId)
  if (filters.status && filters.status !== 'all') query = query.eq('operation_status', filters.status)

  const [rowsResult, profilesResult] = await Promise.all([
    query,
    supabase.from('profiles').select('id, email, full_name').eq('is_active', true),
  ])

  if (rowsResult.error) throw rowsResult.error
  if (profilesResult.error) throw profilesResult.error

  const rows = withProfiles(rowsResult.data ?? [], profilesResult.data ?? [])
  const skuText = filters.skuText?.trim().toLowerCase()

  if (!skuText) return rows

  return rows.filter(
    (row) =>
      row.sku_code.toLowerCase().includes(skuText) ||
      row.sku_description.toLowerCase().includes(skuText),
  )
}

export async function createReplenishmentOperation(input: CreateReplenishmentOperationInput) {
  const items = input.items.map((item) => ({
    sku_id: item.sku_id,
    cantidad_paletas: item.cantidad_paletas,
    observacion: item.observacion?.trim() || null,
  })) satisfies Json[]

  const { error } = await supabase.rpc('create_replenishment_operation', {
    fecha_operativa: input.fecha_operativa,
    hora_operativa: input.hora_operativa,
    forklift_id: input.forklift_id || null,
    court_id: input.court_id,
    driver_id: input.driver_id || null,
    items,
  })

  if (error) throw error
}

export async function voidReplenishmentOperation(operationId: string, reason: string) {
  const { error } = await supabase
    .from('replenishment_operations')
    .update({
      status: 'voided',
      void_reason: reason.trim(),
    })
    .eq('id', operationId)

  if (error) throw error
}

function csvValue(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function buildReplenishmentsCsv(rows: ReplenishmentRecord[], includeCreationDate = true) {
  const headers = [
    'operation_id',
    'item_id',
    'fecha_operativa',
    'hora_operativa',
    ...(includeCreationDate ? ['fecha_hora_carga'] : []),
    'usuario',
    'chofer',
    'autoelevador',
    'cancha',
    'sku',
    'descripcion',
    'cantidad_paletas',
    'estado',
    'observacion',
  ]

  const body = rows.map((row) =>
    [
      row.operation_id,
      row.item_id,
      row.fecha_operativa,
      row.hora_operativa,
      ...(includeCreationDate ? [row.operation_created_at] : []),
      row.profiles?.full_name ?? row.profiles?.email ?? '',
      row.driver_name ?? '',
      row.forklift_name ?? '',
      row.court_name,
      row.sku_code,
      row.sku_description,
      row.cantidad_paletas,
      row.operation_status,
      row.observacion ?? '',
    ].map(csvValue).join(','),
  )

  return [headers.map(csvValue).join(','), ...body].join('\n')
}

function xmlValue(value: unknown) {
  return (value == null ? '' : String(value))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildReplenishmentsExcelXml(rows: ReplenishmentRecord[], includeCreationDate = true) {
  const csv = buildReplenishmentsCsv(rows, includeCreationDate)
  const tableRows = csv.split('\n').map((line) => {
    const values = line.match(/("([^"]|"")*"|[^,]+)/g) ?? []
    const cells = values
      .map((value) => value.replace(/^"|"$/g, '').replace(/""/g, '"'))
      .map((value) => `<Cell><Data ss:Type="String">${xmlValue(value)}</Data></Cell>`)
      .join('')
    return `<Row>${cells}</Row>`
  })

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Reposiciones">
  <Table>${tableRows.join('')}</Table>
 </Worksheet>
</Workbook>`
}

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
