# Checklist de publicacion

## Supabase

- [ ] Aplicar migraciones SQL.
- [ ] Crear usuario `sebadalessandro@gmail.com`.
- [ ] Verificar perfil con rol `Superadministrador`.
- [ ] Confirmar RLS habilitado en tablas publicas.
- [ ] Probar acceso por rol: Superadministrador, Administrador, Supervisor, Usuario operativo, Solo lectura.

## Aplicacion

- [ ] Configurar `.env.local` en desarrollo.
- [ ] Configurar variables en Vercel.
- [ ] Probar login/logout.
- [ ] Probar importacion de SKUs CSV.
- [ ] Probar importacion de SKUs XLSX.
- [ ] Probar carga de reposicion.
- [ ] Probar validaciones obligatorias.
- [ ] Probar SKU anulado con Usuario operativo.
- [ ] Probar SKU anulado con Supervisor o superior.
- [ ] Probar anulacion con motivo.
- [ ] Probar filtros de historial.
- [ ] Probar dashboard con filtros.
- [ ] Probar exportacion CSV.
- [ ] Probar exportacion Excel.
- [ ] Probar responsive PC, tablet y celular.
- [ ] Probar modo oscuro y modo claro.

## Calidad

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm audit --omit=dev`
- [ ] Verificar que no haya claves secretas en el repositorio.
- [ ] Verificar que `.env.local` no este versionado.

## Vercel

- [ ] Crear proyecto.
- [ ] Framework preset: Vite.
- [ ] Build command: `npm run build`.
- [ ] Output directory: `dist`.
- [ ] Variables configuradas.
- [ ] Deploy preview validado.
- [ ] Produccion promovida.
