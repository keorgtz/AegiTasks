# Evidencia de validación

Fecha: 23 de septiembre de 2026. Entorno local: Windows, .NET SDK 10.0.400, Node 24.15.0, Chromium de Playwright.

## Ejecutado correctamente

| Verificación | Resultado |
| --- | --- |
| `dotnet build` | Sin errores ni advertencias |
| `dotnet build -c Release` | Sin errores ni advertencias |
| `dotnet ef migrations has-pending-model-changes --project server/AegiTasks.Api` | Modelo y migración PostgreSQL coinciden |
| `npm --prefix client run typecheck` | Correcto |
| `npm --prefix client run lint` | Sin diagnósticos |
| `npm --prefix client run build` | Build de producción y service worker generados |
| `npm --prefix client run test:e2e` | **31 verificaciones aprobadas** |
| `npm --prefix client audit --omit=dev` | Cero vulnerabilidades reportadas |
| `dotnet list server/AegiTasks.Api package --vulnerable --include-transitive` | Sin paquetes vulnerables reportados |
| Parseo de YAML con Prettier | Compose y workflow válidos sintácticamente |
| `sh -n scripts/setup-env.sh` en Ubuntu/WSL | Sintaxis correcta |

La auditoría de dependencias corresponde a la fecha indicada; no garantiza ausencia de vulnerabilidades futuras.

## Pruebas funcionales

Las 31 verificaciones ejecutan la API real sobre SQLite temporal, el cliente compilado de producción y Chromium. Incluyen:

- Autenticación y rechazo de acceso anónimo; cabecera requerida para mutaciones.
- Restricción de administración a administradores; protección de la propia cuenta administrativa.
- Proyectos con estados iniciales y estados adicionales personalizados.
- Reportes de miembros con planificación opcional y valores ausentes persistidos como `null`.
- Rechazo de carpetas y estados de otro proyecto y de valores de planificación inválidos.
- Protección al eliminar carpetas en uso.
- Rechazo de versiones antiguas al editar, preservando cambios de terceros.
- Persistencia y descarga autenticada de evidencias; rechazo de archivos falsamente declarados como imágenes.
- Comentarios e historial de cambios de estado.
- Archivo/restauración, filtros, búsqueda, métricas y paginación sin duplicados.
- Tema claro/oscuro y persistencia de la preferencia al recargar.
- Creación y comentarios desde la interfaz; borrador al cerrar/reabrir el formulario.
- Tablero con estados personalizados y navegación móvil a equipo/ajustes.
- Ausencia de desbordamiento horizontal a 320, 390, 768 y 1024 px.
- Error de envío sin conexión, conservación del texto y guardado después de reconectar.
- Manifest instalable, iconos PNG disponibles y service worker registrado.
- Recarga sin conexión con interfaz disponible y explicación del error de servidor.
- Ausencia de excepciones JavaScript no controladas.
- Invalidación de sesiones al desactivar cuentas y cambiar contraseñas.

El script genera `artifacts/test-results.json` y capturas locales. Se revisaron visualmente el escritorio en claro/oscuro y el teléfono en claro/oscuro, además del formulario sin conexión. Es evidencia de navegador emulado; no sustituye la prueba en un teléfono físico.

## Pendiente en infraestructura real

Este equipo no tiene Docker disponible, tampoco en su distribución Ubuntu de WSL. Por eso **no se ejecutaron**:

- `docker compose config --quiet`, construcción de imágenes y arranque del stack completo.
- Aplicación de la migración sobre una instancia PostgreSQL real (sí se generó y comprobó contra el modelo).
- Nginx Proxy Manager, DNS, HTTPS y Cloudflare Tunnel para el subdominio real.
- Instalación manual desde Safari/iOS o Android físico.
- Restauración de un respaldo Docker en otro servidor.

El workflow de GitHub queda preparado, pero no se ha ejecutado en GitHub: el usuario creará y subirá el repositorio posteriormente. Los pasos para comprobar el despliegue y la restauración están en README y OPERATIONS.

## Criterios y alcance UX

La tarea principal de soporte necesita título y proyecto. El resto se presenta como opcional. La navegación lateral se recompone como navegación inferior en móvil; los formularios pasan a una columna. Los modales nativos ofrecen foco contenido y cierre con Escape, los controles tienen nombres accesibles y los estados incluyen texto además de color. El CSS respeta movimiento reducido. No se declara una auditoría completa WCAG, de lector de pantalla o de carga concurrente.

La marca, superficies, radios, degradados y colores provienen de AegiFitness. Los colores de texto compacto usan variantes semánticas legibles y AegiTasks aporta iconografía relacionada con pendientes. No se copiaron cuentas, datos personales ni configuración secreta de AegiFitness.
