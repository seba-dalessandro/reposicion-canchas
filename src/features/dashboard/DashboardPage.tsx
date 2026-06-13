import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, CalendarClock, ClipboardList, Forklift, PackageCheck, RefreshCcw, Trophy } from 'lucide-react'
import { SectionHeader } from '../../components/SectionHeader'
import {
  loadReplenishmentLookups,
  loadReplenishments,
  type CourtOption,
  type ForkliftOption,
  type ProfileOption,
  type ReplenishmentFilters,
  type ReplenishmentRecord,
} from '../replenishments/replenishment-service'
import { calculateDashboardMetrics, type ChartDatum } from './dashboard-calculations'

type Kpi = {
  title: string
  value: string
  detail: string
  icon: typeof PackageCheck
}

const chartColors = ['#4DA3C7', '#2E7D63', '#F2C94C', '#607D8B', '#D9534F', '#1F4E5F']

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)
}

export function DashboardPage() {
  const [rows, setRows] = useState<ReplenishmentRecord[]>([])
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [forklifts, setForklifts] = useState<ForkliftOption[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [filters, setFilters] = useState<ReplenishmentFilters>({
    fechaDesde: firstDayOfCurrentMonth(),
    fechaHasta: todayIsoDate(),
    status: 'all',
  })
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const metrics = useMemo(() => calculateDashboardMetrics(rows), [rows])

  const kpis: Kpi[] = [
    {
      title: 'Paletas ingresadas',
      value: formatNumber(metrics.totalPallets),
      detail: 'Suma de cantidad_paletas en registros activos del periodo.',
      icon: PackageCheck,
    },
    {
      title: 'Registros del periodo',
      value: formatNumber(metrics.totalRecords),
      detail: 'Cantidad total de registros visibles con los filtros aplicados.',
      icon: ClipboardList,
    },
    {
      title: 'Cancha con mayor reposicion',
      value: metrics.topCourt?.name ?? 'Sin datos',
      detail: metrics.topCourt ? `${formatNumber(metrics.topCourt.value)} paletas` : 'No hay registros activos.',
      icon: Trophy,
    },
    {
      title: 'SKU mas repuesto',
      value: metrics.topSku?.name.split(' - ')[0] ?? 'Sin datos',
      detail: metrics.topSku ? `${formatNumber(metrics.topSku.value)} paletas` : 'No hay SKUs cargados.',
      icon: Activity,
    },
    {
      title: 'Autoelevador con mayor movimiento',
      value: metrics.topForklift?.name ?? 'Sin datos',
      detail: metrics.topForklift ? `${formatNumber(metrics.topForklift.value)} paletas` : 'Sin movimientos.',
      icon: Forklift,
    },
    {
      title: 'Ultimo registro cargado',
      value: metrics.lastRecord ? formatDateTime(metrics.lastRecord.operation_created_at) : 'Sin datos',
      detail: metrics.lastRecord
        ? `${metrics.lastRecord.sku_code ?? 'SKU'} - ${metrics.lastRecord.court_name ?? 'Sin cancha'}`
        : 'Aun no hay registros.',
      icon: CalendarClock,
    },
  ]

  async function refreshDashboard(nextFilters = filters) {
    setIsLoading(true)
    setMessage(null)

    try {
      const [lookups, nextRows] = await Promise.all([
        loadReplenishmentLookups(),
        loadReplenishments(nextFilters),
      ])
      setCourts(lookups.courts)
      setForklifts(lookups.forklifts)
      setProfiles(lookups.profiles)
      setRows(nextRows)
      setLastUpdatedAt(new Date().toISOString())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el dashboard.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void refreshDashboard()
    })
    // Initial dashboard load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void refreshDashboard(filters)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <SectionHeader
          title="Dashboard operativo"
          description="Seguimiento de paletas repuestas en canchas de picking, con lectura filtrada por periodo, recursos, SKU, usuario y estado."
        />
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Ultima actualizacion: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'}
        </div>
      </div>

      {message ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          {message}
        </div>
      ) : null}

      <form
        onSubmit={handleFilters}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4 xl:grid-cols-8"
      >
        <FilterInput label="Fecha desde" type="date" value={filters.fechaDesde ?? ''} onChange={(value) => setFilters((current) => ({ ...current, fechaDesde: value }))} />
        <FilterInput label="Fecha hasta" type="date" value={filters.fechaHasta ?? ''} onChange={(value) => setFilters((current) => ({ ...current, fechaHasta: value }))} />
        <FilterSelect label="Cancha" value={filters.courtId ?? ''} onChange={(value) => setFilters((current) => ({ ...current, courtId: value }))} options={courts.map((item) => ({ value: item.id, label: item.name }))} />
        <FilterSelect label="Autoelevador" value={filters.forkliftId ?? ''} onChange={(value) => setFilters((current) => ({ ...current, forkliftId: value }))} options={forklifts.map((item) => ({ value: item.id, label: item.name }))} />
        <FilterInput label="SKU" value={filters.skuText ?? ''} onChange={(value) => setFilters((current) => ({ ...current, skuText: value }))} />
        <FilterSelect label="Usuario" value={filters.userId ?? ''} onChange={(value) => setFilters((current) => ({ ...current, userId: value }))} options={profiles.map((item) => ({ value: item.id, label: item.full_name ?? item.email }))} />
        <FilterSelect
          label="Estado"
          value={filters.status ?? 'all'}
          onChange={(value) => setFilters((current) => ({ ...current, status: value as ReplenishmentFilters['status'] }))}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'active', label: 'Activo' },
            { value: 'voided', label: 'Anulado' },
          ]}
        />
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <RefreshCcw className="h-4 w-4" />
            {isLoading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Paletas por cancha" description="Compara la cantidad de paletas activas ingresadas por cada cancha dentro del periodo filtrado.">
          <BarChartView data={metrics.palletsByCourt} />
        </ChartCard>
        <ChartCard title="Paletas por autoelevador" description="Muestra el movimiento por equipo para identificar concentracion de uso o carga operativa.">
          <BarChartView data={metrics.palletsByForklift} color="#2E7D63" />
        </ChartCard>
        <ChartCard title="Paletas por fecha operativa" description="Permite ver la evolucion diaria de paletas repuestas segun la fecha declarada por el usuario.">
          <AreaChartView data={metrics.palletsByDate} />
        </ChartCard>
        <ChartCard title="Top 10 SKUs repuestos" description="Ranking de los SKUs con mayor cantidad de paletas activas en el periodo seleccionado.">
          <BarChartView data={metrics.topSkus} color="#1F4E5F" />
        </ChartCard>
        <ChartCard title="Registros por usuario" description="Cuenta la cantidad de registros cargados por usuario para seguimiento de actividad.">
          <BarChartView data={metrics.recordsByUser} color="#607D8B" />
        </ChartCard>
        <ChartCard title="Paletas por estado del SKU" description="Distribuye las paletas segun el estado efectivo del SKU al momento de consultar los datos.">
          <PieChartView data={metrics.palletsBySkuStatus} />
        </ChartCard>
      </section>

      <OperationalTable rows={rows.slice(0, 20)} />

      <DocumentationSections />
    </div>
  )
}

function FilterInput({
  label,
  type = 'text',
  value,
  onChange,
}: {
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function KpiCard({ title, value, detail, icon: Icon }: Kpi) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700 dark:bg-teal-400/10 dark:text-teal-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-600 dark:text-slate-300">{detail}</p>
    </article>
  )
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 min-h-10 text-sm leading-5 text-slate-600 dark:text-slate-300">{description}</p>
      <div className="mt-4 h-72">{children}</div>
    </article>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      Sin datos para los filtros seleccionados.
    </div>
  )
}

function BarChartView({ data, color = '#4DA3C7' }: { data: ChartDatum[]; color?: string }) {
  if (data.length === 0) return <EmptyChart />
  const maxValue = Math.max(...data.map((item) => item.value))
  const yTicks = buildIntegerTicks(maxValue)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 46 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
        <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} height={70} tick={{ fill: '#94A3B8', fontSize: 11 }} />
        <YAxis allowDecimals={false} ticks={yTicks} tick={{ fill: '#94A3B8', fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#CBD5E1' }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function AreaChartView({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) return <EmptyChart />
  const maxValue = Math.max(...data.map((item) => item.value))
  const yTicks = buildIntegerTicks(maxValue)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
        <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 12 }} />
        <YAxis allowDecimals={false} ticks={yTicks} tick={{ fill: '#94A3B8', fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#CBD5E1' }} />
        <Area type="monotone" dataKey="value" stroke="#4DA3C7" fill="#4DA3C7" fillOpacity={0.22} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function buildIntegerTicks(maxValue: number) {
  const safeMax = Math.max(1, Math.ceil(maxValue))
  const tickCount = Math.min(5, safeMax + 1)
  const step = Math.max(1, Math.ceil(safeMax / Math.max(1, tickCount - 1)))
  const ticks: number[] = []

  for (let value = 0; value <= safeMax; value += step) {
    ticks.push(value)
  }

  if (ticks[ticks.length - 1] !== safeMax) {
    ticks.push(safeMax)
  }

  return ticks
}

function PieChartView({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#CBD5E1' }} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} label>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

function OperationalTable({ rows }: { rows: ReplenishmentRecord[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-base font-semibold">Detalle operativo reciente</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Primeros 20 registros resultantes de los filtros aplicados.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Fecha operativa</th>
              <th className="px-4 py-3">Carga</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Cancha</th>
              <th className="px-4 py-3">Autoelevador</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Paletas</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3">{row.fecha_operativa}</td>
                <td className="px-4 py-3">{formatDateTime(row.operation_created_at)}</td>
                <td className="px-4 py-3">{row.profiles?.full_name ?? row.profiles?.email ?? '-'}</td>
                <td className="px-4 py-3">{row.court_name ?? '-'}</td>
                <td className="px-4 py-3">{row.forklift_name ?? '-'}</td>
                <td className="px-4 py-3">{row.sku_code ?? '-'}</td>
                <td className="px-4 py-3">{row.cantidad_paletas}</td>
                <td className="px-4 py-3">{row.operation_status === 'active' ? 'Activo' : 'Anulado'}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>Sin registros para mostrar.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DocumentationSections() {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <DocCard title="Manual de uso">
        <p>Usa los filtros superiores para acotar el periodo, cancha, autoelevador, SKU, usuario y estado. Los KPIs y graficos se recalculan con el resultado filtrado.</p>
        <p>Los registros anulados se conservan para auditoria. Las paletas de KPIs operativos se calculan sobre registros activos, mientras que el KPI de registros muestra el total filtrado.</p>
      </DocCard>
      <DocCard title="Detalle de formulas">
        <ul className="space-y-2">
          <li>Paletas ingresadas = suma de `cantidad_paletas` con `status = active`.</li>
          <li>Registros del periodo = cantidad de registros filtrados.</li>
          <li>Ranking por cancha, SKU y autoelevador = suma de paletas activas agrupadas por dimension.</li>
          <li>Ultimo registro = mayor `created_at` dentro del conjunto filtrado.</li>
        </ul>
      </DocCard>
      <DocCard title="Diccionario de datos">
        <ul className="space-y-2">
          <li>`fecha_operativa`: fecha informada por el usuario para ubicar la operacion.</li>
          <li>`hora_operativa`: hora opcional informada por el usuario.</li>
          <li>`created_at`: fecha_hora_carga automatica del sistema.</li>
          <li>`cantidad_paletas`: paletas completas trasladadas a zona de transferencia.</li>
          <li>`effective_status`: estado vigente del SKU, derivado del archivo o de override manual.</li>
        </ul>
      </DocCard>
      <DocCard title="Supuestos aplicados">
        <ul className="space-y-2">
          <li>Los indicadores de paletas excluyen registros anulados.</li>
          <li>Los filtros por SKU se aplican por codigo o descripcion.</li>
          <li>La visibilidad de datos finales depende de RLS y rol del usuario autenticado.</li>
          <li>No se calcula promedio de paletas por hora por definicion funcional.</li>
        </ul>
      </DocCard>
      <DocCard title="Checklist antes de publicar">
        <ul className="space-y-2">
          <li>Configurar variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel.</li>
          <li>Aplicar migraciones Supabase y verificar RLS.</li>
          <li>Crear el superadmin `sebadalessandro@gmail.com`.</li>
          <li>Probar login/logout, importacion, carga, filtros, anulacion y exportacion.</li>
          <li>Validar responsive en PC, tablet y celular.</li>
        </ul>
      </DocCard>
      <DocCard title="Fecha de ultima actualizacion">
        <p>Documentacion preparada para publicacion el 11/06/2026. La fecha visible del dashboard se actualiza cada vez que se refrescan los datos.</p>
      </DocCard>
    </section>
  )
}

function DocCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <h2 className="mb-3 text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
      <div className="space-y-3">{children}</div>
    </article>
  )
}
