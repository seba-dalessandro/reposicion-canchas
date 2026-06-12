# Manual de uso

## Acceso

Ingresar con usuario y contrasena desde `/login`. La aplicacion mantiene la sesion con Supabase Auth y permite cerrar sesion desde el encabezado.

## Panel

El dashboard muestra KPIs y graficos de reposiciones. Usar los filtros para acotar periodo, cancha, autoelevador, SKU, usuario y estado. Cada grafico usa datos filtrados.

## Maestros

Importar SKUs desde CSV o XLSX con columnas `Articulo`, `Descripcion articulo` y `Anulado`. Revisar la previsualizacion antes de confirmar. El archivo actualiza descripcion y estado de archivo sin pisar estado manual.

## Reposiciones

Registrar operaciones ya realizadas con fecha operativa obligatoria y hora opcional. Seleccionar autoelevador, cancha, SKU y cantidad de paletas. Los registros no se borran; se anulan con motivo.

## Exportaciones

Desde historial de reposiciones se puede exportar CSV y Excel compatible `.xls`.
