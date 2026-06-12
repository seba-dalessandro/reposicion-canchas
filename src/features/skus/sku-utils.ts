import type { SkuImportClassification, SkuStatus } from '../../types/database'
import type { AppRole } from '../../types/roles'

export const skuStatusLabels: Record<SkuStatus, string> = {
  active: 'Activo',
  voided: 'Anulado',
}

export const classificationLabels: Record<SkuImportClassification, string> = {
  nuevo: 'Nuevo',
  existente: 'Existente',
  modificado: 'Modificado',
  duplicado_archivo: 'Duplicado archivo',
  error: 'Error',
}

export function canImportSkus(role: AppRole | undefined) {
  return role === 'Superadministrador' || role === 'Administrador'
}

export function canChangeSkuManualStatus(
  role: AppRole | undefined,
  canChangeSkuManualStatusFlag: boolean | undefined,
) {
  return (
    role === 'Superadministrador' ||
    role === 'Administrador' ||
    (role === 'Supervisor' && canChangeSkuManualStatusFlag === true)
  )
}

export function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}
