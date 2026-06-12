# Reposicion de canchas

Aplicacion web empresarial para registrar, auditar y analizar reposiciones de canchas de picking. La operacion consiste en trasladar paletas completas con autoelevador desde almacen y dejarlas en zona de transferencia.

## Objetivo

Centralizar el registro operativo de reposiciones, mantener un maestro de SKUs gobernado por archivo y permisos manuales, proteger datos con Supabase RLS y entregar un dashboard responsive para seguimiento diario, supervision y gestion.

## Tecnologias usadas

- React + TypeScript + Vite.
- Tailwind CSS.
- Recharts para graficos.
- Supabase Auth, Database y RLS.
- Vercel ready.

## Estructura de carpetas

- `src/app`: providers globales.
- `src/components`: componentes reutilizables.
- `src/features/auth`: login, sesion y contexto de autenticacion.
- `src/features/dashboard`: dashboard operativo, KPIs, graficos y calculos.
- `src/features/replenishments`: registro, historial, anulacion y exportacion.
- `src/features/skus`: maestro e importacion de SKUs.
- `src/features/master-data`: pantalla de maestro de SKUs.
- `src/features/theme`: modo oscuro/claro persistente.
- `src/layouts`: layout privado.
- `src/lib`: cliente Supabase, env y utilidades.
- `src/routes`: rutas protegidas.
- `src/types`: tipos compartidos.
- `supabase/migrations`: migraciones SQL.
- `supabase/policies.sql`: politicas RLS revisables.
- `supabase/seed.sql`: seeds iniciales.
- `docs`: documentacion de publicacion.

## Instalacion

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Variables de entorno

Completar `.env.local`:

```bash
VITE_APP_NAME="Reposicion de canchas"
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key"
```

No usar claves `service_role` ni secretas en variables `VITE_`, porque se exponen al navegador.

## Comandos disponibles

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Supabase

Aplicar migraciones en orden:

```bash
supabase db push
```

O ejecutar en SQL Editor:

1. `supabase/migrations/20260611120000_initial_schema.sql`
2. `supabase/migrations/20260611120100_policies.sql`
3. `supabase/migrations/20260611120200_seed.sql`
4. `supabase/migrations/20260611130000_sku_master_import.sql`
5. `supabase/migrations/20260611140000_replenishments_operational.sql`
6. `supabase/migrations/20260611150000_security_performance_hardening.sql`

Crear en Supabase Auth el usuario superadmin obligatorio:

- Email: `admin@example.com`
- Rol: `Superadministrador`
- Acceso: total

El trigger `app_private.handle_new_auth_user` crea su perfil como `Superadministrador`; `seed.sql` tambien fuerza ese rol si el usuario ya existe.

## Roles y permisos

- Superadministrador: acceso total. Ningun usuario puede tener permisos superiores.
- Administrador: administra datos operativos, opciones de Canchas/Autoelevadores, importacion de SKUs y usuarios menores.
- Supervisor: consulta reportes, carga reposiciones, anula/elimina reposiciones y puede cambiar estado manual de SKUs si `profiles.can_change_sku_manual_status = true`.
- Usuario operativo: carga reposiciones y consulta sus propios registros.
- Solo lectura: solo consulta.

## Seguridad aplicada

- RLS habilitado en todas las tablas publicas.
- Grants explicitos para `authenticated`, necesario en proyectos nuevos de Supabase por el cambio de Data API.
- Permisos basados en `public.profiles`; no se usa `user_metadata` para autorizacion.
- Funciones `security definer` dentro de `app_private`, schema no expuesto a API.
- Superadmin `admin@example.com` protegido por constraint y trigger.
- La anulacion requiere motivo y esta limitada a Supervisor, Administrador y Superadministrador.
- La eliminacion definitiva de reposiciones esta limitada a Supervisor, Administrador y Superadministrador.
- La administracion de opciones preestablecidas de Canchas y Autoelevadores esta limitada a Administrador y Superadministrador.
- Usuario operativo no puede cargar SKUs anulados.
- Supervisor o superior puede cargar SKU anulado solo tras confirmacion especial en UI.
- Importacion de SKUs no pisa `status_manual`.
- Cambios manuales de SKU requieren motivo.

## Manual de uso

### Login y sesion

Ingresar desde `/login` con Supabase Auth. El layout privado protege todas las rutas internas y permite cerrar sesion desde el encabezado.

### Maestro de SKUs

La pantalla `Maestros` permite buscar SKUs, importar archivo maestro, revisar preview, confirmar importacion, consultar historial y ver detalle.

Archivo admitido: CSV o XLSX.

Encabezados requeridos:

- `Articulo`
- `Descripcion articulo`
- `Anulado`

Mapeo:

- `Articulo` -> `sku_code`
- `Descripcion articulo` -> `description`
- `Anulado` -> `status_file`

Valores aceptados para `Anulado`:

- Activo: vacio, `no`, `n`, `false`, `0`, `activo`.
- Anulado: `si`, `s`, `true`, `1`, `anulado`.

### Reposiciones

La pantalla `Reposiciones` permite:

- Crear nuevo registro.
- Consultar historial con filtros.
- Ver detalle.
- Anular con motivo.
- Exportar CSV.
- Exportar Excel compatible `.xls`.

Campos de registro:

- `fecha_operativa`: obligatoria, informada por usuario.
- `hora_operativa`: opcional.
- `autoelevador`.
- `cancha`: obligatoria.
- `SKU`: buscable por codigo y descripcion.
- `cantidad_paletas`: obligatoria y mayor a 0.
- `observacion`: opcional.

`created_at` representa `fecha_hora_carga` automatica del sistema. `created_by` representa `usuario_id` automatico.

### Dashboard operativo

La pantalla `Panel` muestra KPIs y graficos filtrables. Los filtros disponibles son:

- Fecha desde.
- Fecha hasta.
- Cancha.
- Autoelevador.
- SKU.
- Usuario.
- Estado.

El dashboard es responsive para PC, tablet y celular. El modo oscuro es el predeterminado y el modo claro esta disponible desde el boton de tema.

## Formulas del dashboard

- Paletas ingresadas en el periodo = suma de `cantidad_paletas` de registros activos filtrados.
- Registros del periodo = cantidad total de registros filtrados, activos y anulados.
- Cancha con mayor reposicion = cancha con mayor suma de paletas activas.
- SKU mas repuesto = SKU con mayor suma de paletas activas.
- Autoelevador con mayor movimiento = autoelevador con mayor suma de paletas activas.
- Ultimo registro cargado = registro filtrado con mayor `created_at`.
- Paletas por cancha = suma de paletas activas agrupada por cancha.
- Paletas por autoelevador = suma de paletas activas agrupada por autoelevador.
- Paletas por fecha operativa = suma de paletas activas agrupada por `fecha_operativa`.
- Top 10 SKUs repuestos = diez SKUs con mayor suma de paletas activas.
- Registros por usuario = cantidad de registros filtrados agrupados por usuario.
- Paletas por estado del SKU = suma de paletas activas agrupada por `skus.effective_status`.

No se incluye promedio de paletas por hora por definicion funcional.

## Diccionario de datos

### `profiles`

- `id`: usuario Supabase Auth.
- `email`: correo del usuario.
- `full_name`: nombre visible.
- `role`: rol operativo.
- `can_change_sku_manual_status`: permiso especial de Supervisor para estado manual de SKU.
- `is_active`: habilitacion del usuario.

### `skus`

- `sku_code`: codigo de articulo.
- `description`: descripcion del articulo.
- `status_file`: estado proveniente del archivo maestro.
- `status_manual`: estado manual opcional.
- `effective_status`: estado efectivo usado por la operacion.
- `status_source`: `file` o `manual`.
- `last_file_import_at`: ultima importacion que actualizo el SKU.
- `manual_status_reason`: motivo del cambio manual.

### `sku_imports`

- `file_name`: nombre del archivo importado.
- `status`: estado de procesamiento.
- `total_rows`: filas leidas.
- `valid_rows`: filas importables.
- `invalid_rows`: filas con error o duplicadas.
- `summary_*`: resumen por clasificacion.

### `sku_import_details`

- `row_number`: fila original del archivo.
- `sku_code`: SKU leido.
- `classification`: `nuevo`, `existente`, `modificado`, `duplicado_archivo`, `error`.
- `previous_*`: valores previos en base.
- `error_message`: validacion detectada.

### `replenishments`

- `fecha_operativa`: fecha informada por usuario.
- `hora_operativa`: hora opcional informada por usuario.
- `created_at`: fecha/hora de carga automatica.
- `created_by`: usuario que cargo.
- `forklift_id`: autoelevador.
- `court_id`: cancha.
- `sku_id`: SKU.
- `cantidad_paletas`: paletas completas trasladadas.
- `observacion`: comentario opcional.
- `status`: `active` o `voided`.
- `void_reason`: motivo de anulacion.
- `voided_by`: usuario que anulo.
- `voided_at`: fecha/hora de anulacion.

## Supuestos aplicados

- Las paletas de KPIs y graficos operativos excluyen registros anulados.
- El KPI de registros cuenta todo lo visible segun filtros, incluyendo anulados.
- El estado del SKU se consulta desde `effective_status`.
- La importacion del maestro de SKUs es la fuente principal de `status_file`.
- Un estado manual tiene prioridad sobre el archivo hasta volver a estado de archivo.
- La visibilidad final depende de RLS y del rol autenticado.

## Pruebas minimas

- Login/logout.
- Roles y permisos.
- Carga de reposicion.
- Validaciones de fecha y cantidad.
- Bloqueo de SKU anulado para Usuario operativo.
- Confirmacion especial de SKU anulado para Supervisor o superior.
- Importacion de SKUs.
- Filtros de historial y dashboard.
- Dashboard responsive.
- Exportacion CSV y Excel.
- Anulacion con motivo.
- Revision de seguridad RLS y ausencia de claves secretas en frontend.

Comandos de verificacion local:

```bash
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

## Checklist de publicacion

- Variables configuradas en Vercel.
- Migraciones Supabase aplicadas.
- Usuario `admin@example.com` creado y verificado como Superadministrador.
- RLS probado con roles reales.
- Login/logout probado.
- Importacion de SKUs probada con CSV y XLSX.
- Reposicion probada con SKU activo y anulado.
- Anulacion probada con motivo obligatorio.
- Dashboard probado con filtros.
- Responsive probado en PC, tablet y celular.
- Exportaciones probadas.
- `npm run build` correcto.
- `npm audit --omit=dev` sin vulnerabilidades.

## Deploy en Vercel

1. Crear proyecto en Vercel desde el repositorio.
2. Framework preset: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Configurar variables:
   - `VITE_APP_NAME`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Ejecutar deploy preview.
7. Validar login, rutas privadas y dashboard.
8. Promover a produccion.

`vercel.json` ya incluye rewrites para React Router.

## Proximas mejoras sugeridas

- Paginacion server-side para historiales grandes.
- Vistas SQL `security_invoker` para agregados del dashboard.
- Tests automatizados con Playwright.
- Auditoria ampliada para cambios de usuarios.
- Importacion asincronica para archivos de SKUs muy grandes.
- Exportacion XLSX nativa para reposiciones.
- Alertas por SKU anulado cargado por excepcion.
