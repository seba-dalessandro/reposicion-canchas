import { SectionHeader } from '../../components/SectionHeader'
import { roles } from '../../types/roles'

export function UsersPage() {
  return (
    <div>
      <SectionHeader
        title="Usuarios y roles"
        description="El Superadministrador es el rol maximo. Ningun usuario puede asignar permisos iguales o superiores a los propios."
      />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Jerarquia</th>
                <th className="px-4 py-3">Alcance</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, index) => (
                <tr key={role} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 font-medium">{role}</td>
                  <td className="px-4 py-3">{roles.length - index}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {role === 'Superadministrador' ? 'Acceso total obligatorio' : 'Limitado por policies.sql'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
