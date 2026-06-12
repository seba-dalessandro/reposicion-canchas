export const roles = [
  'Superadministrador',
  'Administrador',
  'Supervisor',
  'Usuario operativo',
  'Solo lectura',
] as const

export type AppRole = (typeof roles)[number]

export const roleRank: Record<AppRole, number> = {
  'Solo lectura': 10,
  'Usuario operativo': 20,
  Supervisor: 30,
  Administrador: 40,
  Superadministrador: 50,
}

export function canManageRole(actorRole: AppRole, targetRole: AppRole) {
  return actorRole === 'Superadministrador' || roleRank[actorRole] > roleRank[targetRole]
}
