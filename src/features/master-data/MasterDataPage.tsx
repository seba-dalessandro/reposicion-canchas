import { type ChangeEvent, type DragEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { SectionHeader } from '../../components/SectionHeader'
import { supabase } from '../../lib/supabase'
import type { Database, SkuImportClassification, SkuStatus } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import { buildSkuImportPreview, confirmSkuImport, type SkuImportPreview } from '../skus/sku-import-service'
import {
  canChangeSkuManualStatus,
  canImportSkus,
  classificationLabels,
  formatDateTime,
  skuStatusLabels,
} from '../skus/sku-utils'

type Sku = Database['public']['Tables']['skus']['Row']
type SkuImport = Database['public']['Tables']['sku_imports']['Row']
type SkuImportDetail = Database['public']['Tables']['sku_import_details']['Row']
type Court = Database['public']['Tables']['courts']['Row']
type Forklift = Database['public']['Tables']['forklifts']['Row']
type Driver = Database['public']['Tables']['drivers']['Row']
type PresetKind = 'courts' | 'forklifts' | 'drivers'
type PresetRecord = Court | Forklift | Driver
type Tab = 'maestro' | 'importar' | 'opciones' | 'historial' | 'detalle'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'maestro', label: 'Maestro de SKUs' },
  { id: 'importar', label: 'Importar SKUs' },
  { id: 'opciones', label: 'Opciones' },
  { id: 'historial', label: 'Historial' },
  { id: 'detalle', label: 'Detalle' },
]

const statusBadgeClasses: Record<SkuStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/30',
  voided: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/30',
}

const classificationClasses: Record<SkuImportClassification, string> = {
  nuevo: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-400/30',
  existente: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
  modificado: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/30',
  duplicado_archivo: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-400/10 dark:text-orange-200 dark:ring-orange-400/30',
  error: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/30',
}

function StatusBadge({ status }: { status: SkuStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${statusBadgeClasses[status]}`}>
      {skuStatusLabels[status]}
    </span>
  )
}

function ClassificationBadge({ value }: { value: SkuImportClassification }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${classificationClasses[value]}`}>
      {classificationLabels[value]}
    </span>
  )
}

export function MasterDataPage() {
  const { profile, user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('maestro')
  const [skus, setSkus] = useState<Sku[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [forklifts, setForklifts] = useState<Forklift[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [imports, setImports] = useState<SkuImport[]>([])
  const [details, setDetails] = useState<SkuImportDetail[]>([])
  const [selectedImport, setSelectedImport] = useState<SkuImport | null>(null)
  const [preview, setPreview] = useState<SkuImportPreview | null>(null)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const canImport = canImportSkus(profile?.role)
  const canChangeManual = canChangeSkuManualStatus(profile?.role, profile?.can_change_sku_manual_status)
  const canManageOptions = profile?.role === 'Superadministrador' || profile?.role === 'Administrador'

  const filteredSkus = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return skus
    return skus.filter(
      (sku) => sku.sku_code.toLowerCase().includes(value) || sku.description.toLowerCase().includes(value),
    )
  }, [query, skus])

  async function loadSkus() {
    const { data, error } = await supabase
      .from('skus')
      .select('*')
      .order('sku_code', { ascending: true })
      .limit(500)

    if (error) throw error
    setSkus(data ?? [])
  }

  async function loadImports() {
    const { data, error } = await supabase
      .from('sku_imports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    setImports(data ?? [])
  }

  async function loadPresetOptions() {
    const [courtsResult, forkliftsResult, driversResult] = await Promise.all([
      supabase.from('courts').select('*').order('name', { ascending: true }),
      supabase.from('forklifts').select('*').order('name', { ascending: true }),
      supabase.from('drivers').select('*').order('name', { ascending: true }),
    ])

    if (courtsResult.error) throw courtsResult.error
    if (forkliftsResult.error) throw forkliftsResult.error
    if (driversResult.error) throw driversResult.error

    setCourts(courtsResult.data ?? [])
    setForklifts(forkliftsResult.data ?? [])
    setDrivers(driversResult.data ?? [])
  }

  async function loadDetails(importRecord: SkuImport) {
    setSelectedImport(importRecord)
    setActiveTab('detalle')
    const { data, error } = await supabase
      .from('sku_import_details')
      .select('*')
      .eq('import_id', importRecord.id)
      .order('row_number', { ascending: true })

    if (error) throw error
    setDetails(data ?? [])
  }

  async function refreshAll() {
    setIsLoading(true)
    setMessage(null)

    try {
      await Promise.all([loadSkus(), loadImports(), loadPresetOptions()])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los datos.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void refreshAll()
    })
    // The initial load should run once; subsequent reloads are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFile(file: File | null) {
    if (!file) return
    setIsImporting(true)
    setMessage(null)

    try {
      setPreview(await buildSkuImportPreview(file))
      setActiveTab('importar')
    } catch (error) {
      setPreview(null)
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo.')
    } finally {
      setIsImporting(false)
    }
  }

  function handleInputFile(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0] ?? null)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    void handleFile(event.dataTransfer.files.item(0))
  }

  async function handleConfirmImport() {
    if (!preview || !user || !canImport) return
    setIsImporting(true)
    setMessage(null)

    try {
      const importId = await confirmSkuImport(preview, user.id)
      setMessage('Importacion procesada correctamente.')
      setPreview(null)
      await refreshAll()
      const importRecord = imports.find((item) => item.id === importId)
      if (importRecord) await loadDetails(importRecord)
      setActiveTab('historial')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo confirmar la importacion.')
    } finally {
      setIsImporting(false)
    }
  }

  async function updateManualStatus(sku: Sku, status: SkuStatus | null) {
    if (!canChangeManual) return

    const reason =
      status === null
        ? 'Vuelta al estado del archivo'
        : window.prompt(`Motivo para ${status === 'active' ? 'activar' : 'anular'} manualmente ${sku.sku_code}`)

    if (status !== null && !reason?.trim()) {
      setMessage('El motivo del cambio manual es obligatorio.')
      return
    }

    setMessage(null)
    const { error } = await supabase
      .from('skus')
      .update({
        status_manual: status,
        manual_status_reason: status === null ? null : reason?.trim(),
      })
      .eq('id', sku.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadSkus()
  }

  async function createPreset(kind: PresetKind) {
    if (!canManageOptions) return

    const label = kind === 'courts' ? 'cancha' : kind === 'forklifts' ? 'autoelevador' : 'chofer'
    const name = window.prompt(`Nombre del nuevo ${label}`)

    if (!name?.trim()) {
      setMessage('El nombre es obligatorio.')
      return
    }

    setMessage(null)

    const { error } = await supabase.from(kind).insert({ name: name.trim(), is_active: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`${label[0].toUpperCase()}${label.slice(1)} creado correctamente.`)
    await loadPresetOptions()
  }

  async function renamePreset(kind: PresetKind, row: PresetRecord) {
    if (!canManageOptions) return

    const name = window.prompt('Nuevo nombre', row.name)

    if (!name?.trim()) {
      setMessage('El nombre es obligatorio.')
      return
    }

    setMessage(null)

    const { error } = await supabase.from(kind).update({ name: name.trim() }).eq('id', row.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Opcion actualizada correctamente.')
    await loadPresetOptions()
  }

  async function togglePreset(kind: PresetKind, row: PresetRecord) {
    if (!canManageOptions) return

    setMessage(null)

    const { error } = await supabase.from(kind).update({ is_active: !row.is_active }).eq('id', row.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(row.is_active ? 'Opcion desactivada correctamente.' : 'Opcion activada correctamente.')
    await loadPresetOptions()
  }

  async function deletePreset(kind: PresetKind, row: PresetRecord) {
    if (!canManageOptions) return

    const confirmed = window.confirm(`Eliminar definitivamente "${row.name}"?`)
    if (!confirmed) return

    setMessage(null)

    const { error } = await supabase.from(kind).delete().eq('id', row.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Opcion eliminada correctamente.')
    await loadPresetOptions()
  }

  return (
    <div>
      <SectionHeader
        title="Maestro de SKUs"
        description="Importacion de archivo maestro, estado efectivo por regla archivo/manual y auditoria por lote."
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

      {activeTab === 'maestro' ? (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <input
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 sm:max-w-md"
              placeholder="Buscar por articulo o descripcion"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              {isLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Articulo</th>
                  <th className="px-4 py-3">Descripcion</th>
                  <th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3">Manual</th>
                  <th className="px-4 py-3">Efectivo</th>
                  <th className="px-4 py-3">Fuente</th>
                  <th className="px-4 py-3">Ultima importacion</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSkus.map((sku) => (
                  <tr key={sku.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium">{sku.sku_code}</td>
                    <td className="px-4 py-3">{sku.description}</td>
                    <td className="px-4 py-3"><StatusBadge status={sku.status_file} /></td>
                    <td className="px-4 py-3">{sku.status_manual ? <StatusBadge status={sku.status_manual} /> : '-'}</td>
                    <td className="px-4 py-3"><StatusBadge status={sku.effective_status} /></td>
                    <td className="px-4 py-3">{sku.status_source === 'manual' ? 'Manual' : 'Archivo'}</td>
                    <td className="px-4 py-3">{formatDateTime(sku.last_file_import_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!canChangeManual}
                          onClick={() => void updateManualStatus(sku, 'active')}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Activar
                        </button>
                        <button
                          type="button"
                          disabled={!canChangeManual}
                          onClick={() => void updateManualStatus(sku, 'voided')}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Anular
                        </button>
                        <button
                          type="button"
                          disabled={!canChangeManual || sku.status_manual === null}
                          onClick={() => void updateManualStatus(sku, null)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Archivo
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSkus.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                      No hay SKUs para mostrar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === 'importar' ? (
        <section className="space-y-5">
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center ${
              canImport
                ? 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100'
                : 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <FileSpreadsheet className="h-10 w-10" />
            <strong className="mt-3 block text-base">Soltar Excel o CSV</strong>
            <span className="mt-1 text-sm">CSV o XLSX con encabezados: Articulo, Descripcion articulo, Anulado</span>
            <input
              className="sr-only"
              type="file"
              accept=".csv,.xlsx"
              disabled={!canImport || isImporting}
              onChange={handleInputFile}
            />
          </label>

          {!canImport ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
              Solo Superadministrador y Administrador pueden importar SKUs.
            </div>
          ) : null}

          {preview ? (
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Previsualizacion</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{preview.fileName}</p>
                </div>
                <button
                  type="button"
                  disabled={
                    isImporting ||
                    preview.missingHeaders.length > 0 ||
                    preview.totalRows === preview.summary.error + preview.summary.duplicado_archivo
                  }
                  onClick={() => void handleConfirmImport()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <Upload className="h-4 w-4" />
                  {isImporting ? 'Procesando...' : 'Confirmar importacion'}
                </button>
              </div>

              {preview.missingHeaders.length > 0 ? (
                <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
                  Columnas faltantes: {preview.missingHeaders.join(', ')}
                </div>
              ) : null}

              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(preview.summary).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                      {classificationLabels[key as SkuImportClassification]}
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <PreviewTable rows={preview.rows} />
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'opciones' ? (
        <section className="grid gap-5 xl:grid-cols-3">
          {!canManageOptions ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200 xl:col-span-3">
              Solo Superadministrador y Administrador pueden modificar Canchas, Autoelevadores y Choferes.
            </div>
          ) : null}
          <PresetOptionsTable
            title="Canchas"
            singularLabel="cancha"
            rows={courts}
            canManage={canManageOptions}
            onCreate={() => void createPreset('courts')}
            onRename={(row) => void renamePreset('courts', row)}
            onToggle={(row) => void togglePreset('courts', row)}
            onDelete={(row) => void deletePreset('courts', row)}
          />
          <PresetOptionsTable
            title="Autoelevadores"
            singularLabel="autoelevador"
            rows={forklifts}
            canManage={canManageOptions}
            onCreate={() => void createPreset('forklifts')}
            onRename={(row) => void renamePreset('forklifts', row)}
            onToggle={(row) => void togglePreset('forklifts', row)}
            onDelete={(row) => void deletePreset('forklifts', row)}
          />
          <PresetOptionsTable
            title="Choferes"
            singularLabel="chofer"
            rows={drivers}
            canManage={canManageOptions}
            onCreate={() => void createPreset('drivers')}
            onRename={(row) => void renamePreset('drivers', row)}
            onToggle={(row) => void togglePreset('drivers', row)}
            onDelete={(row) => void deletePreset('drivers', row)}
          />
        </section>
      ) : null}

      {activeTab === 'historial' ? (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" /> Historial de importaciones</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Filas</th>
                  <th className="px-4 py-3">Nuevo</th>
                  <th className="px-4 py-3">Modificado</th>
                  <th className="px-4 py-3">Errores</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Accion</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium">{item.file_name}</td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">{item.total_rows}</td>
                    <td className="px-4 py-3">{item.summary_new}</td>
                    <td className="px-4 py-3">{item.summary_modified}</td>
                    <td className="px-4 py-3">{item.summary_error + item.summary_duplicado_archivo}</td>
                    <td className="px-4 py-3">{formatDateTime(item.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void loadDetails(item)}
                        className="h-8 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === 'detalle' ? (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="text-lg font-semibold">Detalle de importacion</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedImport ? `${selectedImport.file_name} - ${formatDateTime(selectedImport.created_at)}` : 'Selecciona una importacion.'}
            </p>
          </div>
          <ImportDetailTable rows={details} />
        </section>
      ) : null}
    </div>
  )
}

function PreviewTable({ rows }: { rows: SkuImportPreview['rows'] }) {
  return (
    <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Fila</th>
            <th className="px-4 py-3">Articulo</th>
            <th className="px-4 py-3">Descripcion</th>
            <th className="px-4 py-3">Anulado</th>
            <th className="px-4 py-3">Clasificacion</th>
            <th className="px-4 py-3">Observacion</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((row) => (
            <tr key={`${row.rowNumber}-${row.sku_code}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="px-4 py-3">{row.rowNumber}</td>
              <td className="px-4 py-3 font-medium">{row.sku_code}</td>
              <td className="px-4 py-3">{row.description}</td>
              <td className="px-4 py-3">{row.status_file ? <StatusBadge status={row.status_file} /> : '-'}</td>
              <td className="px-4 py-3"><ClassificationBadge value={row.classification} /></td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                {row.error ?? (row.classification === 'modificado' ? 'Cambia descripcion o estado de archivo' : '-')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 ? (
        <div className="flex items-center gap-2 p-4 text-sm text-amber-700 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Se muestran las primeras 200 filas de {rows.length}.
        </div>
      ) : null}
    </div>
  )
}

function PresetOptionsTable({
  title,
  singularLabel,
  rows,
  canManage,
  onCreate,
  onRename,
  onToggle,
  onDelete,
}: {
  title: string
  singularLabel: string
  rows: PresetRecord[]
  canManage: boolean
  onCreate: () => void
  onRename: (row: PresetRecord) => void
  onToggle: (row: PresetRecord) => void
  onDelete: (row: PresetRecord) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Opciones disponibles en filtros y formularios.</p>
        </div>
        <button
          type="button"
          disabled={!canManage}
          onClick={onCreate}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Actualizado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${
                      row.is_active
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/30'
                        : 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/30'
                    }`}
                  >
                    {row.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">{formatDateTime(row.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => onRename(row)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => onToggle(row)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                    >
                      {row.is_active ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {row.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      disabled={!canManage}
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
                <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                  No hay {singularLabel}s para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ImportDetailTable({ rows }: { rows: SkuImportDetail[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Fila</th>
            <th className="px-4 py-3">Articulo</th>
            <th className="px-4 py-3">Descripcion</th>
            <th className="px-4 py-3">Archivo</th>
            <th className="px-4 py-3">Manual</th>
            <th className="px-4 py-3">Efectivo</th>
            <th className="px-4 py-3">Clasificacion</th>
            <th className="px-4 py-3">Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="px-4 py-3">{row.row_number}</td>
              <td className="px-4 py-3 font-medium">{row.sku_code}</td>
              <td className="px-4 py-3">{row.description}</td>
              <td className="px-4 py-3">{row.status_file ? <StatusBadge status={row.status_file} /> : '-'}</td>
              <td className="px-4 py-3">{row.status_manual ? <StatusBadge status={row.status_manual} /> : '-'}</td>
              <td className="px-4 py-3">{row.effective_status ? <StatusBadge status={row.effective_status} /> : '-'}</td>
              <td className="px-4 py-3"><ClassificationBadge value={row.classification} /></td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.error_message ?? '-'}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                No hay detalle para mostrar.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
