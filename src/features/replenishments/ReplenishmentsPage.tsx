import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, Download, FileSpreadsheet, Plus, Save, Search, Trash2 } from 'lucide-react'
import { SectionHeader } from '../../components/SectionHeader'
import { useAuth } from '../auth/useAuth'
import type { AppRole } from '../../types/roles'
import {
  buildReplenishmentsCsv,
  buildReplenishmentsExcelXml,
  createReplenishmentOperation,
  downloadTextFile,
  loadReplenishmentLookups,
  loadReplenishments,
  voidReplenishmentOperation,
  type CourtOption,
  type DriverOption,
  type ForkliftOption,
  type ProfileOption,
  type ReplenishmentFilters,
  type ReplenishmentRecord,
  type SkuOption,
} from './replenishment-service'

type Tab = 'nuevo' | 'historial' | 'detalle'

type FormLine = {
  id: string
  sku_id: string
  sku_query: string
  cantidad_paletas: string
  observacion: string
}

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

function statusLabel(status: 'active' | 'voided') {
  return status === 'active' ? 'Activo' : 'Anulado'
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5)
}

function createLine(): FormLine {
  return {
    id: crypto.randomUUID(),
    sku_id: '',
    sku_query: '',
    cantidad_paletas: '1',
    observacion: '',
  }
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
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('nuevo')
  const [skus, setSkus] = useState<SkuOption[]>([])
  const [courts, setCourts] = useState<CourtOption[]>([])
  const [forklifts, setForklifts] = useState<ForkliftOption[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [rows, setRows] = useState<ReplenishmentRecord[]>([])
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [filters, setFilters] = useState<ReplenishmentFilters>({
    fechaDesde: todayIsoDate(),
    fechaHasta: todayIsoDate(),
    status: 'all',
  })
  const [form, setForm] = useState({
    fecha_operativa: todayIsoDate(),
    hora_operativa: currentTime(),
    driver_id: '',
    forklift_id: '',
    court_id: '',
  })
  const [lines, setLines] = useState<FormLine[]>([createLine()])

  const mayCreate = canCreate(profile?.role)
  const mayVoid = canVoid(profile?.role)
  const mayViewCreationDate = profile?.role === 'Superadministrador'
  const activeSkus = useMemo(() => skus.filter((sku) => sku.effective_status === 'active'), [skus])
  const selectedRows = useMemo(
    () => rows.filter((row) => row.operation_id === selectedOperationId),
    [rows, selectedOperationId],
  )

  async function refreshLookups() {
    const lookups = await loadReplenishmentLookups()
    setSkus(lookups.skus)
    setCourts(lookups.courts)
    setForklifts(lookups.forklifts)
    setDrivers(lookups.drivers)
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

  useEffect(() => {
    if (!showSuccessToast) return

    const timeoutId = window.setTimeout(() => setShowSuccessToast(false), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [showSuccessToast])

  function updateLine(id: string, patch: Partial<FormLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  function selectSku(lineId: string, sku: SkuOption) {
    updateLine(lineId, {
      sku_id: sku.id,
      sku_query: `${sku.sku_code} - ${sku.description}`,
    })
  }

  function filteredSkusForLine(line: FormLine) {
    const value = line.sku_query.trim().toLowerCase()
    const source = value
      ? activeSkus
          .filter(
            (sku) =>
              sku.sku_code.toLowerCase().includes(value) ||
              sku.description.toLowerCase().includes(value),
          )
          .sort((left, right) => {
            const leftCode = left.sku_code.toLowerCase()
            const rightCode = right.sku_code.toLowerCase()
            const leftExact = leftCode === value
            const rightExact = rightCode === value

            if (leftExact !== rightExact) return leftExact ? -1 : 1

            const leftStarts = leftCode.startsWith(value)
            const rightStarts = rightCode.startsWith(value)

            if (leftStarts !== rightStarts) return leftStarts ? -1 : 1

            return leftCode.localeCompare(rightCode, 'es', { numeric: true })
          })
      : activeSkus

    return source.slice(0, 20)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (!mayCreate) {
      setMessage('Solo lectura no puede registrar reposiciones.')
      return
    }

    if (!form.fecha_operativa) {
      setMessage('La fecha operativa es obligatoria.')
      return
    }

    if (!form.hora_operativa) {
      setMessage('La hora operativa es obligatoria.')
      return
    }

    if (!form.court_id) {
      setMessage('La cancha es obligatoria.')
      return
    }

    if (lines.length === 0) {
      setMessage('Debe cargar al menos un SKU.')
      return
    }

    const parsedLines = lines.map((line, index) => ({
      index: index + 1,
      sku_id: line.sku_id,
      cantidad_paletas: Number(line.cantidad_paletas),
      observacion: line.observacion,
    }))

    const invalidLine = parsedLines.find(
      (line) => !line.sku_id || !Number.isFinite(line.cantidad_paletas) || line.cantidad_paletas <= 0,
    )

    if (invalidLine) {
      setMessage(`Revisa la linea ${invalidLine.index}: SKU y cantidad mayor a 0 son obligatorios.`)
      return
    }

    setIsSaving(true)

    try {
      await createReplenishmentOperation({
        fecha_operativa: form.fecha_operativa,
        hora_operativa: form.hora_operativa,
        driver_id: form.driver_id || null,
        forklift_id: form.forklift_id || null,
        court_id: form.court_id,
        items: parsedLines.map(({ sku_id, cantidad_paletas, observacion }) => ({
          sku_id,
          cantidad_paletas,
          observacion,
        })),
      })

      setShowSuccessToast(true)
      setForm({
        fecha_operativa: todayIsoDate(),
        hora_operativa: currentTime(),
        driver_id: '',
        forklift_id: '',
        court_id: '',
      })
      setLines([createLine()])
      await refreshRows()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar la reposicion.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleVoid(operationId: string, skuCode?: string) {
    if (!mayVoid) return
    const reason = window.prompt(`Motivo para anular la operacion${skuCode ? ` de ${skuCode}` : ''}`)

    if (!reason?.trim()) {
      setMessage('La anulacion requiere motivo.')
      return
    }

    setMessage(null)

    try {
      await voidReplenishmentOperation(operationId, reason)
      setMessage('Operacion anulada correctamente.')
      await refreshRows()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo anular la operacion.')
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void refreshRows(filters)
  }

  function exportCsv() {
    downloadTextFile(
      'reposiciones.csv',
      buildReplenishmentsCsv(rows, mayViewCreationDate),
      'text/csv;charset=utf-8',
    )
  }

  function exportExcel() {
    downloadTextFile(
      'reposiciones.xls',
      buildReplenishmentsExcelXml(rows, mayViewCreationDate),
      'application/vnd.ms-excel;charset=utf-8',
    )
  }

  return (
    <div>
      {showSuccessToast ? (
        <div
          role="status"
          className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg dark:border-emerald-400/30 dark:bg-emerald-950 dark:text-emerald-100"
        >
          <CheckCircle2 className="h-5 w-5" />
          Carga exitosa
        </div>
      ) : null}

      <SectionHeader
        title="Reposiciones"
        description="Registro de operaciones de reabastecimiento con cabecera unica y multiples SKUs."
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
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold">Datos generales de la operacion</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                  required
                />
              </label>

              <label className="text-sm font-medium">
                Chofer de AE / usuario operativo
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
                  value={form.driver_id}
                  onChange={(event) => setForm((current) => ({ ...current, driver_id: event.target.value }))}
                >
                  <option value="">Sin chofer asignado</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                  Usuario que carga: {profile?.full_name ?? profile?.email ?? '-'}
                </span>
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
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold">Detalle de SKU</h2>
              <button
                type="button"
                onClick={() => setLines((current) => [...current, createLine()])}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Agregar SKU
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {lines.map((line, index) => (
                <div key={line.id} className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 lg:grid-cols-[minmax(260px,1fr)_150px_minmax(220px,1fr)_90px]">
                  <div>
                    <label className="text-sm font-medium">
                      SKU buscable
                      <div className="mt-2 flex items-center rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input
                          className="h-10 flex-1 bg-transparent px-2 text-sm outline-none"
                          placeholder="Buscar por codigo o descripcion"
                          value={line.sku_query}
                          onChange={(event) => updateLine(line.id, { sku_query: event.target.value, sku_id: '' })}
                        />
                      </div>
                    </label>
                    <div className="mt-2 max-h-44 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
                      {filteredSkusForLine(line).map((sku) => (
                        <button
                          key={sku.id}
                          type="button"
                          onClick={() => selectSku(line.id, sku)}
                          className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 ${
                            line.sku_id === sku.id ? 'bg-teal-50 text-teal-800 dark:bg-teal-400/10 dark:text-teal-100' : ''
                          }`}
                        >
                          <strong>{sku.sku_code}</strong>
                          <span className="text-slate-600 dark:text-slate-300">{sku.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="text-sm font-medium">
                    Cantidad paletas
                    <input
                      className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
                      min="1"
                      step="1"
                      type="number"
                      value={line.cantidad_paletas}
                      onChange={(event) => updateLine(line.id, { cantidad_paletas: event.target.value })}
                      required
                    />
                  </label>

                  <label className="text-sm font-medium">
                    Observacion
                    <input
                      className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
                      value={line.observacion}
                      onChange={(event) => updateLine(line.id, { observacion: event.target.value })}
                    />
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-200 px-2 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-400/30 dark:text-red-200"
                      aria-label={`Eliminar linea ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <button
                type="submit"
                disabled={isSaving || !mayCreate}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Guardando...' : 'Guardar reposicion'}
              </button>
            </div>
          </section>
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
            mayViewCreationDate={mayViewCreationDate}
            onSelect={(operationId) => {
              setSelectedOperationId(operationId)
              setActiveTab('detalle')
            }}
            onVoid={(operationId, skuCode) => void handleVoid(operationId, skuCode)}
          />
        </section>
      ) : null}

      {activeTab === 'detalle' ? (
        <DetailPanel
          rows={selectedRows}
          mayVoid={mayVoid}
          mayViewCreationDate={mayViewCreationDate}
          onVoid={(operationId, skuCode) => void handleVoid(operationId, skuCode)}
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
  mayViewCreationDate,
  onSelect,
  onVoid,
}: {
  rows: ReplenishmentRecord[]
  mayVoid: boolean
  mayViewCreationDate: boolean
  onSelect: (operationId: string) => void
  onVoid: (operationId: string, skuCode?: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Fecha operativa</th>
              <th className="px-4 py-3">Hora operativa</th>
              {mayViewCreationDate ? <th className="px-4 py-3">Fecha creacion</th> : null}
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Chofer</th>
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
              <tr key={row.item_id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">{row.fecha_operativa}</td>
                <td className="px-4 py-3">{row.hora_operativa}</td>
                {mayViewCreationDate ? (
                  <td className="px-4 py-3">{formatDateTime(row.operation_created_at)}</td>
                ) : null}
                <td className="px-4 py-3">{row.profiles?.full_name ?? row.profiles?.email ?? '-'}</td>
                <td className="px-4 py-3">{row.driver_name ?? '-'}</td>
                <td className="px-4 py-3">{row.forklift_name ?? '-'}</td>
                <td className="px-4 py-3">{row.court_name}</td>
                <td className="px-4 py-3 font-medium">{row.sku_code}</td>
                <td className="px-4 py-3">{row.sku_description}</td>
                <td className="px-4 py-3">{row.cantidad_paletas}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${statusClass(row.operation_status)}`}>
                    {statusLabel(row.operation_status)}
                  </span>
                </td>
                <td className="px-4 py-3">{row.observacion ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onSelect(row.operation_id)} className="h-8 rounded-md border border-slate-200 px-2 text-xs dark:border-slate-700">
                      Ver
                    </button>
                    <button
                      type="button"
                      disabled={!mayVoid || row.operation_status === 'voided'}
                      onClick={() => onVoid(row.operation_id, row.sku_code)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Anular
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={mayViewCreationDate ? 13 : 12}>
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
  rows,
  mayVoid,
  mayViewCreationDate,
  onVoid,
}: {
  rows: ReplenishmentRecord[]
  mayVoid: boolean
  mayViewCreationDate: boolean
  onVoid: (operationId: string, skuCode?: string) => void
}) {
  const firstRow = rows[0]

  if (!firstRow) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        Selecciona una operacion desde el historial.
      </section>
    )
  }

  const fields = [
    ['Fecha operativa', firstRow.fecha_operativa],
    ['Hora operativa', firstRow.hora_operativa],
    ...(mayViewCreationDate
      ? ([['Fecha creacion', formatDateTime(firstRow.operation_created_at)]] as const)
      : []),
    ['Usuario', firstRow.profiles?.full_name ?? firstRow.profiles?.email ?? '-'],
    ['Chofer', firstRow.driver_name ?? '-'],
    ['Autoelevador', firstRow.forklift_name ?? '-'],
    ['Cancha', firstRow.court_name],
    ['Estado', statusLabel(firstRow.operation_status)],
    ['Motivo anulacion', firstRow.void_reason ?? '-'],
  ] as const

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Detalle de operacion</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{firstRow.operation_id}</p>
          </div>
          <button
            type="button"
            disabled={!mayVoid || firstRow.operation_status === 'voided'}
            onClick={() => onVoid(firstRow.operation_id)}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
          >
            <Ban className="h-4 w-4" />
            Anular operacion
          </button>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <dt className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="mt-1 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Descripcion</th>
                <th className="px-4 py-3">Paletas</th>
                <th className="px-4 py-3">Observacion</th>
                {mayViewCreationDate ? <th className="px-4 py-3">Item creado</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.item_id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 font-medium">{row.sku_code}</td>
                  <td className="px-4 py-3">{row.sku_description}</td>
                  <td className="px-4 py-3">{row.cantidad_paletas}</td>
                  <td className="px-4 py-3">{row.observacion ?? '-'}</td>
                  {mayViewCreationDate ? (
                    <td className="px-4 py-3">{formatDateTime(row.item_created_at)}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
