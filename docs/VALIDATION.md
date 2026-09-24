# Evidencia de validación

Fecha: 23 de septiembre de 2026. Entorno local: Windows, .NET SDK 10.0.400, Node 24.15.0, Chromium de Playwright.

## Ejecutado correctamente

| Verificación                                                                    | Resultado                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `dotnet build`                                                                  | Sin errores ni advertencias                                                            |
| `dotnet build -c Release`                                                       | Sin errores ni advertencias                                                            |
| `dotnet ef migrations has-pending-model-changes --project server/AegiTasks.Api` | Modelo y migración PostgreSQL coinciden                                                |
| `npm --prefix client run typecheck`                                             | Correcto                                                                               |
| `npm --prefix client run lint`                                                  | Sin diagnósticos                                                                       |
| `npm --prefix client run build`                                                 | Build de producción y service worker generados                                         |
| `npm --prefix client run test:e2e`                                              | **53 verificaciones aprobadas sobre SQLite**                                           |
| `node client/scripts/postgres-tests.mjs`                                        | **53 verificaciones aprobadas** y migración con datos anteriores sobre PostgreSQL 18.4 |
| `npm --prefix client audit --omit=dev`                                          | Cero vulnerabilidades reportadas                                                       |
| `dotnet list server/AegiTasks.Api package --vulnerable --include-transitive`    | Sin paquetes vulnerables reportados                                                    |
| Parseo de YAML con Prettier                                                     | Compose y workflow válidos sintácticamente                                             |
| `sh -n scripts/setup-env.sh` en Ubuntu/WSL                                      | Sintaxis correcta                                                                      |

La auditoría de dependencias corresponde a la fecha indicada; no garantiza ausencia de vulnerabilidades futuras.

## Pruebas funcionales

La suite de 53 verificaciones ejecuta la API real, el cliente compilado de producción y Chromium. Se prueba sobre SQLite temporal y PostgreSQL 18.4 local; la imagen Docker prevista continúa siendo PostgreSQL 17 y requiere su validación en infraestructura. Incluyen:

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
- Espacio Personal automático y privado: ni Admin puede abrir el de otra cuenta; detalles, adjuntos, notas y exportaciones respetan el espacio.
- Invitaciones que caducan, se regeneran y se revocan; expulsión de miembros con bloqueo inmediato de su sesión existente.
- Roles personalizados con acceso operativo por defecto, revocación por página, API y rutas directas; usuarios/roles siempre reservados a Admin.
- Carpetas de notas anidadas, rechazo de ciclos y referencias a carpetas o proyectos ajenos; notas compartidas con conflicto de versión y conversión idempotente a pendiente.
- Creación de workspaces, roles y subcarpetas desde el navegador. Importación Markdown, tablas, citas, resaltado de código, colores y filtrado de HTML activo.
- Exportación Markdown y HTML comprobando contenido; ZIP con jerarquía y sin notas de otros espacios; impresión PDF renderizada y revisada visualmente.
- Protección de un borrador de nota al cancelar una navegación. Una nota importada y guardada deja de marcarse como modificada.
- Focus privado, duraciones válidas, una sola sesión activa, aislamiento por usuario, conflictos entre versiones, pausa y objetivos persistentes.
- Intervalo real de un minuto: avanza a pausa larga según configuración y cuenta exactamente un ciclo completado.
- Aurora, Waves y Terminal, pantalla inmersiva, movimiento reducido y tamaños 320/390/768/1024; notas y Focus con capturas móviles y de escritorio.

El script genera `artifacts/test-results.json` y capturas locales. También se conservan `sqlite-test-results.json`, `postgres-test-results.json` y `postgres-migration-results.json` tras la validación local de ambos proveedores. Se revisaron visualmente el escritorio en claro/oscuro y el teléfono en claro/oscuro, además del formulario sin conexión. Es evidencia de navegador emulado; no sustituye la prueba en un teléfono físico.

## Migración y notas de validación

La prueba de migración crea una base con el esquema anterior, usuarios Admin/Member, proyecto, etiqueta personalizada, pendiente, comentario y relación de etiqueta. Aplica la migración de Spaces y comprueba que conserva esos datos, crea el workspace compartido y dos espacios Personal, migra Member a User e inicializa permisos. Una segunda base vacía se levanta mediante la API y sus migraciones automáticas para ejecutar la suite completa.

El build Vite conserva una advertencia de tamaño en el módulo de notas (~524 KB sin comprimir, ~164 KB gzip), cargado bajo demanda; el módulo principal es ~308 KB sin comprimir. El resaltado de código y el procesamiento Markdown explican la mayor parte del módulo. La herramienta EF instalada localmente es 10.0.8 y avisa que el runtime es 10.0.10; la generación y comprobación del modelo finalizaron correctamente.

En ejecuciones intermedias aparecieron cortes `ECONNRESET` en peticiones del cliente de pruebas a Vite, antes de llegar a la API. Las pruebas HTTP se dirigen directamente a la API (5213); las pruebas de navegador siguen pasando por el proxy Vite (4174). No se añadieron reintentos automáticos de mutaciones. No se atribuye este fallo al servidor de producción, cuyo proxy es Nginx.

## Pendiente en infraestructura real

Este equipo no tiene Docker disponible, tampoco en su distribución Ubuntu de WSL. Por eso **no se ejecutaron**:

- `docker compose config --quiet`, construcción de imágenes y arranque del stack completo.
- Ejecución de la imagen exacta PostgreSQL 17 del Compose: sí se probaron instalación nueva y migración sobre PostgreSQL 18.4 nativo.
- Nginx Proxy Manager, DNS, HTTPS y Cloudflare Tunnel para el subdominio real.
- Instalación manual desde Safari/iOS o Android físico.
- Restauración de un respaldo Docker en otro servidor.

El workflow de GitHub queda preparado, pero no se ha ejecutado en GitHub: el usuario creará y subirá el repositorio posteriormente. Los pasos para comprobar el despliegue y la restauración están en README y OPERATIONS.

## Criterios y alcance UX

La tarea principal de soporte necesita título y proyecto. El resto se presenta como opcional. La navegación lateral se recompone como navegación inferior en móvil; los formularios pasan a una columna. Los modales nativos ofrecen foco contenido y cierre con Escape, los controles tienen nombres accesibles y los estados incluyen texto además de color. El CSS respeta movimiento reducido. No se declara una auditoría completa WCAG, de lector de pantalla o de carga concurrente.

La marca, superficies, radios, degradados y colores provienen de AegiFitness. Los colores de texto compacto usan variantes semánticas legibles y AegiTasks aporta iconografía relacionada con pendientes. No se copiaron cuentas, datos personales ni configuración secreta de AegiFitness.
