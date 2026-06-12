import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type ReplenishmentStatus = 'active' | 'voided'
export type SkuOption = Database['public']['Tables']['skus']['Row']
export type CourtOption = Database['public']['Tables']['courts']['Row']
export type ForkliftOption = Database['public']['Tables']['forklifts']['Row']
export type ProfileOption = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'email' | 'full_name'>

export type ReplenishmentRecord = Database['public']['Tables']['replenishments']['Row'] & {
  skus: Pick<SkuOption, 'sku_code' | 'description' | 'effective_status'> | null
  courts: Pick<CourtOption, 'name'> | null
  forklifts: Pick<ForkliftOption, 'name'> | null
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

export type CreateReplenishmentInput = {
  fecha_operativa: string
  hora_operativa?: string | null
  forklift_id?: string | null
  court_id: string
  sku_id: string
  cantidad_paletas: number
  observacion?: string | null
}

const replenishmentSelect = `
  *,
  skus:sku_id (sku_code, description, effective_status),
  courts:court_id (name),
  forklifts:forklift_id (name),
  profiles:created_by (id, email, full_name)
`

export async function loadReplenishmentLookups() {
  const [skusResult, courtsResult, forkliftsResult, profilesResult] = await Promise.all([
    supabase.from('skus').select('*').order('sku_code', { ascending: true }).limit(1000),
    supabase.from('courts').select('*').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('forklifts').select('*').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('profiles').select('id, email, full_name').eq('is_active', true).order('email', { ascending: true }),
  ])

  if (skusResult.error) throw skusResult.error
  if (courtsResult.error) throw courtsResult.error
  if (forkliftsResult.error) throw forkliftsResult.error
  if (profilesResult.error) throw profilesResult.error

  return {
    skus: skusResult.data ?? [],
    courts: courtsResult.data ?? [],
    forklifts: forkliftsResult.data ?? [],
    profiles: profilesResult.data ?? [],
  }
}

export async function loadReplenishments(filters: ReplenishmentFilters) {
  let query = supabase
    .from('replenishments')
    .select(replenishmentSelect)
    .order('fecha_operativa', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters.fechaDesde) query = query.gte('fecha_operativa', filters.fechaDesde)
  if (filters.fechaHasta) query = query.lte('fecha_operativa', filters.fechaHasta)
  if (filters.courtId) query = query.eq('court_id', filters.courtId)
  if (filters.forkliftId) query = query.eq('forklift_id', filters.forkliftId)
  if (filters.userId) query = query.eq('created_by', filters.userId)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)

  const { data, error } = await query

  if (error) throw error

  const rows = (data ?? []) as unknown as ReplenishmentRecord[]
  const skuText = filters.skuText?.trim().toLowerCase()

  if (!skuText) return rows

  return rows.filter((row) => {
    const sku = row.skus
    return (
      sku?.sku_code.toLowerCase().includes(skuText) ||
      sku?.description.toLowerCase().includes(skuText)
    )
  })
}

export async function createReplenishment(input: CreateReplenishmentInput, userId: string) {
  const { error } = await supabase.from('replenishments').insert({
    ...input,
    created_by: userId,
    status: 'active',
    hora_operativa: input.hora_operativa || null,
    observacion: input.observacion?.trim() || null,
  })

  if (error) throw error
}

export async function voidReplenishment(id: string, reason: string) {
  const { error } = await supabase
    .from('replenishments')
    .update({
      status: 'voided',
      void_reason: reason.trim(),
    })
    .eq('id', id)

  if (error) throw error
}

function csvValue(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function buildReplenishmentsCsv(rows: ReplenishmentRecord[]) {
  const headers = [
    'fecha_operativa',
    'hora_operativa',
    'fecha_hora_carga',
    'usuario',
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
      row.fecha_operativa,
      row.hora_operativa,
      row.created_at,
      row.profiles?.full_name ?? row.profiles?.email ?? '',
      row.forklifts?.name ?? '',
      row.courts?.name ?? '',
      row.skus?.sku_code ?? '',
      row.skus?.description ?? '',
      row.cantidad_paletas,
      row.status,
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

export function buildReplenishmentsExcelXml(rows: ReplenishmentRecord[]) {
  const csv = buildReplenishmentsCsv(rows)
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
