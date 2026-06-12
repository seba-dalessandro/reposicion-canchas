import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Ban, Download, FileSpreadsheet, Save, Search, Trash2 } from 'lucide-react'
import { SectionHeader } from '../../components/SectionHeader'
import { useAuth } from '../auth/useAuth'
import type { AppRole } from '../../types/roles'
import type { SkuStatus } from '../../types/database'
import {
  buildReplenishmentsCsv,
  buildReplenishmentsExcelXml,
  createReplenishment,
  deleteReplenishment,
  downloadTextFile,
  loadReplenishmentLookups,
  loadReplenishments,
  voidReplenishment,
  type CourtOption,
  type ForkliftOption,
  type ProfileOption,
  type ReplenishmentFilters,
  type ReplenishmentRecord,
  type SkuOption,
} from './replenishment-service'

type Tab = 'nuevo' | 'historial' | 'detalle'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'nuevo', label: 'Nuevo registro' },
  { id: 'historial', label: 'Historial' },
  { id: 'detalle', label: 'Detalle' },
]

function canCreate(role: AppRole | undefined) {
  return role !== undefined && role !== 'Solo lectura'
}

function canVoid(role: AppRole | undefined) {
  return role === 'Superadministrador' || role === 'Administrador' || role === 'Supervisor'
}

function canDelete(role: AppRole | undefined) {
  return role === 'Superadministrador' || role === 'Administrador' || role === 'Supervisor'
}

function statusLabel(status: 'active' | 'voided') {
  return status === 'active' ? 'Activo' : 'Anulado'
}

function skuStatusLabel(status: SkuStatus) {
  return status === 'active' ? 'Activo' : 'Anulado'
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function statusClass(status: 'active' | 'voided') {
  return status === 'active'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/30'
    : 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/30'
}

export function ReplenishmentsPage() {
  const { profile, user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('nuevo')
  const [skus, setSkus] = useState<SkuOption[]>([])
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [forklifts, setForklifts] = useState<ForkliftOption[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [rows, setRows] = useState<ReplenishmentRecord[]>([])
  const [selected, setSelected] = useState<ReplenishmentRecord | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [skuQuery, setSkuQuery] = useState('')
  const [filters, setFilters] = useState<ReplenishmentFilters>({
    fechaDesde: todayIsoDate(),
    fechaHasta: todayIsoDate(),
    status: 'all',
  })
  const [form, setForm] = useState({
    fecha_operativa: todayIsoDate(),
    hora_operativa: '',
    forklift_id: '',
    court_id: '',
    sku_id: '',
    cantidad_paletas: '1',
    observacion: '',
  })

  const mayCreate = canCreate(profile?.role)
  const mayVoid = canVoid(profile?.role)
  const mayDelete = canDelete(profile?.role)

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === form.sku_id) ?? null,
    [form.sku_id, skus],
  )

  const filteredSkuOptions = useMemo(() => {
    const value = skuQuery.trim().toLowerCase()
    const activeSkus = skus.filter((sku) => sku.effective_status === 'active')
    const source = value
      ? activeSkus.filter(
          (sku) => sku.sku_code.toLowerCase().includes(value) || sku.description.toLowerCase().includes(value),
        )
      : activeSkus

    return source.slice(0, 60)
  }, [skuQuery, skus])

  async function refreshLookups() {
    const lookups = await loadReplenishmentLookups()
    setSkus(lookups.skus)
    setCourts(lookups.courts)
    setForklifts(lookups.forklifts)
    setProfiles(lookups.profiles)
  }

  async function refreshRows(nextFilters = filters) {
    setIsLoading(true)
    setMessage(null)

    try {
      setRows(await loadReplenishments(nextFilters))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el historial.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        await refreshLookups()
        await refreshRows()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los datos.')
      }
    })
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (!user) return
    if (!mayCreate) {
      setMessage('Solo lectura no puede registrar reposiciones.')
      return
    }

    const cantidadPaletas = Number(form.cantidad_paletas)

    if (!form.fecha_operativa) {
      setMessage('La fecha operativa es obligatoria.')
      return
    }

    if (!form.court_id || !form.sku_id) {
      setMessage('Cancha y SKU son obligatorios.')
      return
    }

    if (!Number.isFinite(cantidadPaletas) || cantidadPaletas <= 0) {
      setMessage('La cantidad de paletas debe ser mayor a 0.')
      return
    }

    if (selectedSku?.effective_status === 'voided') {
      if (!mayVoid) {
        setMessage('El SKU esta anulado y no puede cargarse con rol Usuario operativo.')
        return
      }

      const confirmed = window.confirm(
        `El SKU ${selectedSku.sku_code} esta anulado. Confirma la carga especial de esta reposicion?`,
      )

      if (!confirmed) return
    }

    setIsSaving(true)

    try {
      await createReplenishment(
        {
          fecha_operativa: form.fecha_operativa,
          hora_operativa: form.hora_operativa || null,
          forklift_id: form.forklift_id || null,
          court_id: form.court_id,
          sku_id: form.sku_id,
          cantidad_paletas: cantidadPaletas,
          observacion: form.observacion,
        },
        user.id,
      )
      setMessage('Reposicion registrada correctamente.')
      setForm((current) => ({
        ...current,
        hora_operativa: '',
        sku_id: '',
        cantidad_paletas: '1',
        observacion: '',
      }))
      setSkuQuery('')
      await refreshRows()
      setActiveTab('historial')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar la reposicion.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleVoid(row: ReplenishmentRecord) {
    if (!mayVoid) return
    const reason = window.prompt(`Motivo para anular la reposicion de ${row.skus?.sku_code ?? 'SKU'}`)

    if (!reason?.trim()) {
      setMessage('La anulacion requiere motivo.')
      return
    }

    setMessage(null)

    try {
      await voidReplenishment(row.id, reason)
      setMessage('Reposicion anulada correctamente.')
      await refreshRows()
      if (selected?.id === row.id) {
        const updated = await loadReplenishments({ status: 'all' })
        setSelected(updated.find((item) => item.id === row.id) ?? null)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo anular la reposicion.')
    }
  }

  async function handleDelete(row: ReplenishmentRecord) {
    if (!mayDelete) return

    const confirmed = window.confirm(
      `Eliminar definitivamente la reposicion de ${row.skus?.sku_code ?? 'SKU'} del ${row.fecha_operativa}?`,
    )

    if (!confirmed) return

    setMessage(null)

    try {
      await deleteReplenishment(row.id)
      setMessage('Reposicion eliminada correctamente.')
      await refreshRows()
      if (selected?.id === row.id) {
        setSelected(null)
        setActiveTab('historial')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo eliminar la reposicion.')
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void refreshRows(filters)
  }

  function exportCsv() {
    downloadTextFile('reposiciones.csv', buildReplenishmentsCsv(rows), 'text/csv;charset=utf-8')
  }

  function exportExcel() {
    downloadTextFile(
      'reposiciones.xls',
      buildReplenishmentsExcelXml(rows),
      'application/vnd.ms-excel;charset=utf-8',
    )
  }

  return (
    <div>
      <SectionHeader
        title="Reposiciones"
        description="Registro de paletas completas trasladadas con autoelevador desde almacen hacia zona de transferencia."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`h-10 rounded-md border px-3 text-sm font-medium ${
              activeTab === tab.id
                ? 'border-teal-700 bg-teal-700 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          {message}
        </div>
      ) : null}

      {activeTab === 'nuevo' ? (
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2"
        >
          <label className="text-sm font-medium">
            Fecha operativa
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              type="date"
              value={form.fecha_operativa}
              onChange={(event) => setForm((current) => ({ ...current, fecha_operativa: event.target.value }))}
              required
            />
          </label>

          <label className="text-sm font-medium">
            Hora operativa
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              type="time"
              value={form.hora_operativa}
              onChange={(event) => setForm((current) => ({ ...current, hora_operativa: event.target.value }))}
            />
          </label>

          <label className="text-sm font-medium">
            Autoelevador
            <select
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              value={form.forklift_id}
              onChange={(event) => setForm((current) => ({ ...current, forklift_id: event.target.value }))}
            >
              <option value="">Sin autoelevador</option>
              {forklifts.map((forklift) => (
                <option key={forklift.id} value={forklift.id}>{forklift.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Cancha
            <select
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              value={form.court_id}
              onChange={(event) => setForm((current) => ({ ...current, court_id: event.target.value }))}
              required
            >
              <option value="">Seleccionar cancha</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>{court.name}</option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2">
            <label className="text-sm font-medium">
              SKU buscable
              <div className="mt-2 flex items-center rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  className="h-11 flex-1 bg-transparent px-2 outline-none"
                  placeholder="Buscar por codigo o descripcion"
                  value={skuQuery}
                  onChange={(event) => setSkuQuery(event.target.value)}
                />
              </div>
            </label>
            <div className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
              {filteredSkuOptions.map((sku) => (
                <button
                  key={sku.id}
                  type="button"
                  onClick={() => {
                    setForm((current) => ({ ...current, sku_id: sku.id }))
                    setSkuQuery(`${sku.sku_code} - ${sku.description}`)
                  }}
                  className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 ${
                    form.sku_id === sku.id ? 'bg-teal-50 text-teal-800 dark:bg-teal-400/10 dark:text-teal-100' : ''
                  }`}
                >
                  <span>
                    <strong>{sku.sku_code}</strong>
                    <span className="ml-2 text-slate-600 dark:text-slate-300">{sku.description}</span>
                  </span>
                  <span className={sku.effective_status === 'active' ? 'text-emerald-600' : 'text-red-600'}>
                    {skuStatusLabel(sku.effective_status)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="text-sm font-medium">
            Cantidad paletas
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              min="1"
              step="1"
              type="number"
              value={form.cantidad_paletas}
              onChange={(event) => setForm((current) => ({ ...current, cantidad_paletas: event.target.value }))}
              required
            />
          </label>

          <label className="text-sm font-medium md:col-span-2">
            Observacion
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              value={form.observacion}
              onChange={(event) => setForm((current) => ({ ...current, observacion: event.target.value }))}
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSaving || !mayCreate}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      ) : null}

      {activeTab === 'historial' ? (
        <section className="space-y-4">
          <form
            onSubmit={applyFilters}
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4"
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
            <div className="flex items-end gap-2">
              <button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
                {isLoading ? 'Buscando...' : 'Buscar'}
              </button>
              <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700">
                <Download className="h-4 w-4" />
                CSV
              </button>
              <button type="button" onClick={exportExcel} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700">
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
            </div>
          </form>

          <HistoryTable
            rows={rows}
            mayVoid={mayVoid}
            mayDelete={mayDelete}
            onSelect={(row) => {
              setSelected(row)
              setActiveTab('detalle')
            }}
            onVoid={(row) => void handleVoid(row)}
            onDelete={(row) => void handleDelete(row)}
          />
        </section>
      ) : null}

      {activeTab === 'detalle' ? (
        <DetailPanel
          row={selected}
          mayVoid={mayVoid}
          mayDelete={mayDelete}
          onVoid={(row) => void handleVoid(row)}
          onDelete={(row) => void handleDelete(row)}
        />
      ) : null}
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

function HistoryTable({
  rows,
  mayVoid,
  mayDelete,
  onSelect,
  onVoid,
  onDelete,
}: {
  rows: ReplenishmentRecord[]
  mayVoid: boolean
  mayDelete: boolean
  onSelect: (row: ReplenishmentRecord) => void
  onVoid: (row: ReplenishmentRecord) => void
  onDelete: (row: ReplenishmentRecord) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Fecha operativa</th>
              <th className="px-4 py-3">Hora operativa</th>
              <th className="px-4 py-3">Fecha/hora carga</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Autoelevador</th>
              <th className="px-4 py-3">Cancha</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Descripcion</th>
              <th className="px-4 py-3">Paletas</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Observacion</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">{row.fecha_operativa}</td>
                <td className="px-4 py-3">{row.hora_operativa ?? '-'}</td>
                <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
                <td className="px-4 py-3">{row.profiles?.full_name ?? row.profiles?.email ?? '-'}</td>
                <td className="px-4 py-3">{row.forklifts?.name ?? '-'}</td>
                <td className="px-4 py-3">{row.courts?.name ?? '-'}</td>
                <td className="px-4 py-3 font-medium">{row.skus?.sku_code ?? '-'}</td>
                <td className="px-4 py-3">{row.skus?.description ?? '-'}</td>
                <td className="px-4 py-3">{row.cantidad_paletas}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${statusClass(row.status)}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="px-4 py-3">{row.observacion ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onSelect(row)} className="h-8 rounded-md border border-slate-200 px-2 text-xs dark:border-slate-700">
                      Ver
                    </button>
                    <button
                      type="button"
                      disabled={!mayVoid || row.status === 'voided'}
                      onClick={() => onVoid(row)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Anular
                    </button>
                    <button
                      type="button"
                      disabled={!mayDelete}
                      onClick={() => onDelete(row)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-400/30 dark:text-red-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={12}>
                  No hay reposiciones para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DetailPanel({
  row,
  mayVoid,
  mayDelete,
  onVoid,
  onDelete,
}: {
  row: ReplenishmentRecord | null
  mayVoid: boolean
  mayDelete: boolean
  onVoid: (row: ReplenishmentRecord) => void
  onDelete: (row: ReplenishmentRecord) => void
}) {
  if (!row) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        Selecciona un registro desde el historial.
      </section>
    )
  }

  const fields = [
    ['Fecha operativa', row.fecha_operativa],
    ['Hora operativa', row.hora_operativa ?? '-'],
    ['Fecha/hora carga', formatDateTime(row.created_at)],
    ['Usuario', row.profiles?.full_name ?? row.profiles?.email ?? '-'],
    ['Autoelevador', row.forklifts?.name ?? '-'],
    ['Cancha', row.courts?.name ?? '-'],
    ['SKU', row.skus?.sku_code ?? '-'],
    ['Descripcion', row.skus?.description ?? '-'],
    ['Cantidad paletas', row.cantidad_paletas],
    ['Estado', statusLabel(row.status)],
    ['Observacion', row.observacion ?? '-'],
    ['Motivo anulacion', row.void_reason ?? '-'],
  ] as const

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Detalle de registro</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{row.skus?.sku_code ?? 'SKU'} - {row.fecha_operativa}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!mayVoid || row.status === 'voided'}
            onClick={() => onVoid(row)}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
          >
            <Ban className="h-4 w-4" />
            Anular
          </button>
          <button
            type="button"
            disabled={!mayDelete}
            onClick={() => onDelete(row)}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-400/30 dark:text-red-200"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <dt className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="mt-1 text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
