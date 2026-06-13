# Manual de uso

## Acceso

Ingresar con usuario y contrasena desde `/login`. La aplicacion mantiene la sesion con Supabase Auth y permite cerrar sesion desde el encabezado.

## Panel

El dashboard muestra KPIs y graficos de reposiciones. Usar los filtros para acotar periodo, cancha, autoelevador, SKU, usuario y estado. Cada grafico usa datos filtrados.

## Maestros

Importar SKUs desde CSV o XLSX con columnas `Articulo`, `Descripcion articulo` y `Anulado`. Revisar la previsualizacion antes de confirmar. El archivo actualiza descripcion y estado de archivo sin pisar estado manual.

## Reposiciones

Registrar operaciones ya realizadas con una cabecera unica y multiples SKUs.

Datos generales:

- Fecha operativa obligatoria.
- Hora operativa obligatoria.
- Chofer seleccionado desde opciones administrables.
- Usuario que carga tomado de la sesion.
- Autoelevador opcional.
- Cancha obligatoria.

Detalle:

- Usar `+ Agregar SKU` para sumar lineas.
- Buscar SKU por codigo o descripcion.
- Informar cantidad de paletas mayor a 0.
- Agregar observacion opcional por linea.
- Quitar lineas antes de guardar si fueron cargadas por error.

Al guardar, la app crea una cabecera en `replenishment_operations` y los items en `replenishment_items` mediante la RPC transaccional `create_replenishment_operation`. Los registros no se borran desde la interfaz; se anula la operacion con motivo.

Los choferes se administran desde `Maestros -> Opciones`, junto con Canchas y Autoelevadores.

## Exportaciones

Desde historial de reposiciones se puede exportar CSV y Excel compatible `.xls`. El historial y las exportaciones leen desde `v_replenishments_report`.
