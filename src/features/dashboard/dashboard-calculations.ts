import type { ReplenishmentRecord } from '../replenishments/replenishment-service'

export type ChartDatum = {
  name: string
  value: number
}

export type DashboardMetrics = {
  totalPallets: number
  totalRecords: number
  topCourt: ChartDatum | null
  topSku: ChartDatum | null
  topForklift: ChartDatum | null
  lastRecord: ReplenishmentRecord | null
  palletsByCourt: ChartDatum[]
  palletsByForklift: ChartDatum[]
  palletsByDate: ChartDatum[]
  topSkus: ChartDatum[]
  recordsByUser: ChartDatum[]
  palletsBySkuStatus: ChartDatum[]
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value)
}

function toSortedData(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

function topOf(data: ChartDatum[]) {
  return data.length > 0 ? data[0] : null
}

export function calculateDashboardMetrics(rows: ReplenishmentRecord[]): DashboardMetrics {
  const activeRows = rows.filter((row) => row.operation_status === 'active')
  const palletsByCourt = new Map<string, number>()
  const palletsByForklift = new Map<string, number>()
  const palletsByDate = new Map<string, number>()
  const palletsBySku = new Map<string, number>()
  const recordsByUser = new Map<string, number>()
  const palletsBySkuStatus = new Map<string, number>()

  activeRows.forEach((row) => {
    const pallets = Math.trunc(Number(row.cantidad_paletas))
    addToMap(palletsByCourt, row.court_name ?? 'Sin cancha', pallets)
    addToMap(palletsByForklift, row.forklift_name ?? 'Sin autoelevador', pallets)
    addToMap(palletsByDate, row.fecha_operativa, pallets)
    addToMap(palletsBySku, `${row.sku_code ?? 'SKU'} - ${row.sku_description ?? 'Sin descripcion'}`, pallets)
    addToMap(palletsBySkuStatus, row.sku_status === 'voided' ? 'SKU anulado' : 'SKU activo', pallets)
  })

  rows.forEach((row) => {
    addToMap(recordsByUser, row.profiles?.full_name ?? row.profiles?.email ?? 'Sin usuario', 1)
  })

  const palletsByCourtData = toSortedData(palletsByCourt)
  const palletsByForkliftData = toSortedData(palletsByForklift)
  const topSkus = toSortedData(palletsBySku).slice(0, 10)
  const recordsByUserData = toSortedData(recordsByUser)
  const palletsBySkuStatusData = toSortedData(palletsBySkuStatus)
  const palletsByDateData = Array.from(palletsByDate.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    totalPallets: activeRows.reduce((total, row) => total + Math.trunc(Number(row.cantidad_paletas)), 0),
    totalRecords: rows.length,
    topCourt: topOf(palletsByCourtData),
    topSku: topOf(topSkus),
    topForklift: topOf(palletsByForkliftData),
    lastRecord:
      rows
        .slice()
        .sort((a, b) => new Date(b.operation_created_at).getTime() - new Date(a.operation_created_at).getTime())[0] ?? null,
    palletsByCourt: palletsByCourtData,
    palletsByForklift: palletsByForkliftData,
    palletsByDate: palletsByDateData,
    topSkus,
    recordsByUser: recordsByUserData,
    palletsBySkuStatus: palletsBySkuStatusData,
  }
}
