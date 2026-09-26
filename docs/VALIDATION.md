# Evidencia de validación

Actualización funcional: 25 de septiembre de 2026. Entorno local: Windows, .NET SDK 10.0.400, Node 24.15.0, Chromium de Playwright. La auditoría de dependencias frontend se repitió el 25 de septiembre. La auditoría .NET y las comprobaciones de YAML y shell documentadas abajo corresponden al 23 de septiembre.

## Ejecutado correctamente

| Verificación                                                                    | Resultado                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `dotnet build`                                                                  | Sin errores ni advertencias                                                            |
| `dotnet build -c Release`                                                       | Sin errores ni advertencias                                                            |
| `dotnet ef migrations has-pending-model-changes --project server/AegiTasks.Api` | Modelo y migración PostgreSQL coinciden                                                |
| `npm --prefix client run typecheck`                                             | Correcto                                                                               |
| `npm --prefix client run lint`                                                  | Sin diagnósticos                                                                       |
| `npm --prefix client run build`                                                 | Build de producción y service worker generados                                         |
| `npm --prefix client run test:e2e`                                              | **82 verificaciones aprobadas sobre SQLite**                                           |
| `npm --prefix client run test:pwa`                                              | **12 verificaciones aprobadas**; migración opcional del worker anterior documentada en la validación previa |
| `node client/scripts/postgres-tests.mjs`                                        | **79 verificaciones aprobadas** y migración con datos anteriores sobre PostgreSQL 18.4 (validación previa del editor de notas) |
| `npm --prefix client audit --omit=dev`                                          | Cero vulnerabilidades reportadas                                                       |
| `dotnet list server/AegiTasks.Api package --vulnerable --include-transitive`    | Sin paquetes vulnerables reportados                                                    |
| Parseo de YAML con Prettier                                                     | Compose y workflow válidos sintácticamente                                             |
| `sh -n scripts/setup-env.sh` en Ubuntu/WSL                                      | Sintaxis correcta                                                                      |

La auditoría de dependencias corresponde a la fecha indicada; no garantiza ausencia de vulnerabilidades futuras.

## Pruebas funcionales

### Detalle del pendiente en pestañas (25 de septiembre)

Esta iteración modifica solo el cliente. Se repitieron typecheck, lint, build de producción y la suite SQLite completa, ahora con 82 verificaciones. Los resultados de PostgreSQL y PWA de la tabla corresponden a la validación previa del editor de notas; no se repitieron para este cambio de presentación.

Tres grupos nuevos comprueban las pestañas Detalle general, Evidencias y Conversación y actividad. El diálogo abre en Detalle general, solo un panel queda visible/accesible y las flechas/Home/End cambian de pestaña. Las ediciones y comentarios sin publicar se conservan entre secciones; cancelar el cierre protege ambos borradores. La carga de una imagen real y la publicación de comentarios se prueban desde sus pestañas, sin perder los campos generales.

Las tres vistas se comprueban a 1440×1080, 390×844, 320×600 y 844×390, en claro y oscuro. El diálogo cabe en la ventana sin desbordamiento horizontal y las pestañas tienen al menos 44 px de alto, permanecen visibles al desplazar el contenido y reinician el desplazamiento al cambiar de sección. Se revisaron las capturas `artifacts/task-tabs-1440-Evidencias-light.png`, `task-tabs-320-Conversación-light.png` y `task-tabs-390-Detalle-dark.png`. Validación en Chromium, sin dispositivos físicos.

### Editor de notas como página y Mermaid (25 de septiembre)

Siete grupos verifican el editor de ventana completa sin sidebar, cabecera global ni modal. En escritorio, el canvas comienza en el borde izquierdo y ocupa más de 800 px de alto en una ventana de 1440×1000. Colapsar las herramientas recupera altura sin cambiar el texto; guardar y el selector de vista permanecen accesibles. La vista inicial sigue siendo dividida desde 1024 px y solo edición por debajo. Se comprueban guardado, enlace directo, recarga, ocho tipografías, exportación y conservación del borrador al cancelar la navegación.

Las 39 plantillas se insertan mediante el selector real, agrupado en siete categorías. Todas se representan en claro y oscuro con geometría SVG y etiquetas de texto medibles, sin scripts, imágenes ni `foreignObject`. Se mantienen las comprobaciones de recursos locales, sintaxis incorrecta y configuración embebida. El HTML exportado de la nota de referencia contiene siete SVG y fuentes embebidas; se vuelve a abrir para comprobarlo. La impresión genera tres páginas en `notes-mermaid.pdf`, sin navegación ni controles.

Se verifican 320, 390 y 844 px, además de un contexto Chromium con entrada táctil y ventanas de 390×844, 320×600, 844×390 y 390×360. Los botones de cabecera conservan áreas de al menos 44×44 px y no se superponen. La página no desborda; el panel de opciones cabe en la ventana corta, Escape lo cierra y Ctrl+S guarda desde el título aun con herramientas ocultas. La altura de 360 px simula poco espacio disponible; no constituye una prueba con un teclado virtual físico.

Se revisaron `artifacts/notes-page-desktop.png`, `notes-page-320-dark.png`, `notes-touch-320-600.png`, `notes-touch-390-360.png`, `notes-mermaid-catalog.png` y la captura de herramientas colapsadas. Son pruebas de Chromium local, no validación en teléfonos físicos. Se corrigió también un selector ambiguo de la prueba de envío sin conexión: ahora busca el error dentro del diálogo de alta, ya que el aviso global puede aparecer simultáneamente.

### Focus sin desplazamiento y controles en diálogos (25 de septiembre)

El timer ocupa el espacio disponible en vista normal y ampliada. Se verifican diez tamaños entre 320×480 y 1440×900, incluidos 568×320, 667×375 y 844×390 en horizontal: ni la página ni el escenario desbordan, los controles permanecen dentro del escenario sin superponerse y el reloj conserva su forma circular. Las capturas `artifacts/focus-fit-*.png` registran ambas vistas; se revisaron visualmente los tamaños más pequeños y el escritorio.

Pendientes, objetivos/historial, audio y preferencias se abren desde la barra superior. La suite existente comprueba selección de 52 tareas, completar desde el resumen, actualización remota y persistencia al recargar. La nueva comprobación cubre quince objetivos, apertura/cierre de diálogos sin modificar el vencimiento del timer y persistencia de un objetivo completado. Las pruebas de audio verifican que un archivo local continúa reproduciéndose al cerrar y volver a abrir su diálogo. Los diálogos permiten desplazamiento interno para contenido largo; la pantalla principal no lo necesita. No hay cambios en el esquema de datos.

### Ambientes visuales y espectro circular (25 de septiembre)

Se agregaron Luciérnagas, Brisa auroral, Constelaciones, Lluvia de código y Geometría sonora, además de los tres ambientes existentes. Color y formas se guardan por usuario. La API valida los valores y conserva los nuevos campos cuando un cliente anterior no los envía.

Cuatro verificaciones integradas cubren los nuevos perfiles, persistencia, los ocho ambientes, tamaños 320/390/1366 px, temas claro/oscuro, vista ampliada, preferencia de movimiento reducido, desactivación de animaciones y suspensión del dibujo en pestañas ocultas. Se revisaron las capturas `artifacts/focus-new-*.png`, `focus-geometry-*.png` y `focus-spectrum-active.png`.

Las pruebas de audio usan un grafo Web Audio real con análisis FFT: tonos generados se suministran como MediaStream para simular la adquisición desde el selector o micrófono; también se reproducen archivos WAV locales reales. Se comprueban permisos rechazados, fuente sin pista de audio, desconexión, cancelación con permiso todavía pendiente, liberación al cambiar de ambiente o salir de Focus, reemplazo de archivos sin reutilizar incorrectamente el nodo de audio, espectro estático en silencio, ausencia de subidas y alternativas cuando no existe captura. El selector del sistema y los dispositivos físicos están simulados: no se afirma validación manual de audio interno en Windows, Android ni iOS.

La actualización SQLite se ejecutó dos veces sobre una copia con el esquema anterior: conservó 3 usuarios, 60 pendientes, 2 notas, 2 sesiones y 2 perfiles de Focus, incluidas sus duraciones, tema, animaciones y sonido. Evidencia: `artifacts/focus-sqlite-upgrade-results.json`. La prueba PostgreSQL aplica `FocusVisuals` sobre un perfil anterior y verifica que conserva su tema y duración, incorporando el color y la forma iniciales.

Una ejecución intermedia se interrumpió porque el preview local dejó de aceptar conexiones antes de las pruebas nuevas (`ERR_CONNECTION_RESET` / `ERR_CONNECTION_REFUSED`); se conservaron `artifacts/visuals-preview-failure.log` y su captura. No se añadieron reintentos de escrituras ni se cambió la configuración de producción para ocultarlo.

Resultado final: 71 verificaciones aprobadas en SQLite y PostgreSQL 18.4, build de cliente/API y lint correctos. Modelo y migraciones coinciden. La captura real de audio del sistema y los permisos en equipos físicos siguen pendientes de aceptación en esos dispositivos; el análisis de audio y la liberación de recursos sí se probaron en Chromium.

### Diálogo de pendientes en Focus

El selector integrado se reemplazó por un diálogo sin checkboxes ni límite de selección, con búsqueda, filtro por proyecto, páginas de 50 resultados, revisión de seleccionados, confirmación y cancelación. El resumen del timer muestra título, proyecto, descripción, estado y progreso; «Completar» aplica el estado resuelto del proyecto. Los cambios externos de estado continúan actualizando el resumen.

La suite comprueba selección y persistencia de 52 pendientes entre páginas y recargas, inicio con 51 pendientes abiertos, conservación de tareas completadas y del vencimiento del timer al modificar la selección, deduplicación, cancelación y rechazo de cambios ajenos, inválidos o con una versión obsoleta. Un diálogo abierto conserva su versión original aunque llegue una actualización de otra pestaña, para no sobrescribirla.

Se comprueba foco inicial en el buscador, acciones accesibles por scroll, ausencia de desbordamiento horizontal y Escape en dos pasos: cerrar el diálogo y después salir de la vista ampliada. Capturas en `artifacts/focus-dialog-1366.png`, `focus-dialog-390.png`, `focus-dialog-320.png`, sus variantes `focus-dialog-actions-*` y `focus-dialog-summary.png`. No requiere migración de base de datos.

Las 67 verificaciones pasaron en SQLite y PostgreSQL 18.4. El primer intento de PostgreSQL se interrumpió por `ERR_NO_BUFFER_SPACE` de Chromium al consultar autenticación, antes de los casos nuevos. Se conservaron el registro y la captura en `artifacts/focus-dialog-postgres-failure.*`; una ejecución completa posterior con datos aislados pasó, sin añadir reintentos de escrituras. Evidencia final: `artifacts/sqlite-test-results.json` y `artifacts/postgres-test-results.json`.

### Responsables y vista ampliada de Focus

Se añadieron cuatro verificaciones integradas a la suite:

- Filtros de responsable aplicados antes de paginar, con 52 pendientes elegibles entre dos páginas, identidad distinta para Admin/User y métricas coherentes con el filtro.
- Focus rechaza desde la API pendientes completados, archivados, de proyectos archivados o asignados a otra persona. Mantiene las comprobaciones existentes de espacio y permisos.
- Bandejas reales de Admin y User muestran sus pendientes y los no asignados; permiten filtrar otra persona y recuperan el valor inicial al volver a entrar o recargar. Vista móvil sin desbordamiento.
- Selección de Focus conservada entre búsquedas, botones separados al menos 16 px, vista ampliada limitada al viewport en 1366, 390 y 320 px. `document.fullscreenElement` permanece vacío. Elegir pendientes abre ahora el diálogo sobre la vista ampliada y enfoca el buscador; cambiar de pestaña o salir con Esc mantiene el timer activo.

Se revisaron las capturas `artifacts/assignment-focus-expanded-1366.png`, `assignment-focus-expanded-390.png`, `assignment-focus-expanded-320.png` y `assignment-inbox-mobile.png`. La validación corrigió un conflicto de capas que permitía al encabezado interceptar el botón de salida. No hay cambios de esquema ni nuevas migraciones.

Las 66 verificaciones pasaron en SQLite y PostgreSQL 18.4. En un intento intermedio de PostgreSQL, el puerto del preview Vite dejó de aceptar conexiones (`ERR_CONNECTION_RESET` y `ERR_CONNECTION_REFUSED`), mientras la API directa seguía respondiendo. Se conservó `artifacts/assignment-postgres-failure.log`, se añadió registro de salida de procesos de prueba y la ejecución completa posterior pasó; no se añadieron reintentos de escrituras ni cambios al proxy de producción.

### Actualización automática entre despliegues

Se ejecutó la suite PWA con dos builds reales distintos servidos sucesivamente desde el mismo origen. Chromium conservó sus service workers, cookies y almacenamiento durante el cambio. Se verificaron múltiples pestañas, viewport móvil, editor abierto, valores de un formulario React, recarga offline, reconexión, retorno al primer plano (evento de visibilidad emulado), recuperación tras fallar la descarga del worker, actualización con workers bloqueados y ausencia de recargas repetidas o excepciones JavaScript. El reloj de página se adelanta para disparar la comprobación periódica; las descargas y activaciones de workers son reales.

También se comprobó la transición desde un build anterior a este cambio mediante `AEGITASKS_LEGACY_DIST`: el worker con actualización manual fue reemplazado y una recarga normal abrió la nueva versión sin borrar caché. Esta prueba registra el worker anterior directamente porque la versión antigua solo lo registraba después del login; no afirma recarga automática de pestañas que todavía ejecutan el coordinador antiguo.

Evidencia: `artifacts/pwa-test-results.json`, con ambos identificadores de build y **13 comprobaciones** en la ejecución que incluye la migración. La suite principal de 62 comprobaciones volvió a pasar con estos cambios. Build/TypeScript y lint correctos. Se incorporó `test:pwa` al workflow de GitHub Actions. El servidor de esta prueba simula la publicación de archivos y respuestas anónimas de API; no sustituye la validación de cabeceras y caché en Docker, NPM, Cloudflare ni Safari/iOS del entorno real.

### Cambios del 24 de septiembre

- Sidebar con secciones exclusivas y catálogos extensos paginados: sin desbordamiento vertical a alturas 900, 768 y 600; el control de crear proyecto permanece dentro del sidebar. El logo abre el diálogo de instalación.
- Etiquetas de proyecto persistentes, deduplicación y límite de diez etiquetas de 30 caracteres; estados de pendientes independientes y personalizables.
- Selección real de pendientes en Focus, resolver/reabrir, estado revisado, persistencia después de recargar y actualización en la vista de otro miembro conectado.
- Timestamps UTC explícitos al materializar desde SQLite: un timer de un minuto sigue mostrando un minuto después de recargar en `America/Mexico_City`.
- Borrado desde la interfaz, cancelación de confirmaciones, versiones obsoletas rechazadas, limpieza de enlaces de Focus y conservación de notas al eliminar proyectos o pendientes. Los adjuntos eliminados dejan de estar disponibles.
- Permisos de página aplicados también al borrado en cascada; una cuenta sin acceso a pendientes no puede eliminarlos a través del proyecto.
- SSE con dos sesiones autenticadas, separación de Spaces, rechazo de suscripción al espacio Personal ajeno, cierre de una conexión al revocar membresía y conservación de borradores abiertos.
- Ninguna consulta de datos durante 31,5 segundos de inactividad con el stream conectado. Los comentarios de mantenimiento SSE no disparan lecturas de vistas.
- Migración PostgreSQL con datos anteriores: se conservan los estados personalizados. Además se verificó dos veces el arranque sobre una copia de una base SQLite anterior: conservó 5 proyectos, 60 pendientes, 2 notas, 16 estados y 65 actividades, añadiendo solo la columna de etiquetas.

Evidencia visual adicional: `artifacts/workflow-sidebar-600.png`, `artifacts/workflow-focus-light.png` y `artifacts/workflow-focus-dark.png`. El Nginx de producción incluye streaming sin buffering; Docker, Nginx Proxy Manager y Cloudflare Tunnel deben validarse en el servidor real.

La suite actual de 82 verificaciones ejecuta la API real, el cliente compilado de producción y Chromium sobre SQLite temporal. La ejecución previa de 79 verificaciones también pasó sobre PostgreSQL 18.4 local; la imagen Docker prevista continúa siendo PostgreSQL 17 y requiere su validación en infraestructura. Incluyen:

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

El build Vite conserva advertencias de tamaño: notas pesa aproximadamente 572 KB sin comprimir (182 KB gzip) y el mayor módulo de Mermaid 662 KB (143 KB gzip), ambos cargados bajo demanda; el módulo principal permanece en ~336 KB. El precache PWA contiene aproximadamente 4,8 MB de recursos sin comprimir, incluidos diagramas y fuentes locales para su disponibilidad sin conexión. La actualización entre versiones con estos recursos pasó la suite PWA. La herramienta EF instalada localmente es 10.0.8 y avisa que el runtime es 10.0.10; la generación y comprobación del modelo finalizaron correctamente.

En ejecuciones intermedias aparecieron cortes `ECONNRESET` en peticiones del cliente de pruebas a Vite, antes de llegar a la API. Las pruebas HTTP se dirigen directamente a la API (5213); las pruebas de navegador siguen pasando por el proxy Vite (4174). No se añadieron reintentos automáticos de mutaciones. No se atribuye este fallo al servidor de producción, cuyo proxy es Nginx.

## Pendiente en infraestructura real

Este equipo no tiene Docker disponible, tampoco en su distribución Ubuntu de WSL. Por eso **no se ejecutaron**:

- `docker compose config --quiet`, construcción de imágenes y arranque del stack completo.
- Ejecución de la imagen exacta PostgreSQL 17 del Compose: sí se probaron instalación nueva y migración sobre PostgreSQL 18.4 nativo.
- Nginx Proxy Manager, DNS, HTTPS y Cloudflare Tunnel para el subdominio real.
- Instalación manual desde Safari/iOS o Android físico.
- Restauración de un respaldo Docker en otro servidor.

El repositorio está publicado en GitHub. La ejecución remota del workflow no se verificó en esta validación local. Los pasos para comprobar el despliegue y la restauración están en README y OPERATIONS.

## Criterios y alcance UX

La tarea principal de soporte necesita título y proyecto. El resto se presenta como opcional. La navegación lateral se recompone como navegación inferior en móvil; los formularios pasan a una columna. Los modales nativos ofrecen foco contenido y cierre con Escape, los controles tienen nombres accesibles y los estados incluyen texto además de color. El CSS respeta movimiento reducido. No se declara una auditoría completa WCAG, de lector de pantalla o de carga concurrente.

La marca, superficies, radios, degradados y colores provienen de AegiFitness. Los colores de texto compacto usan variantes semánticas legibles y AegiTasks aporta iconografía relacionada con pendientes. No se copiaron cuentas, datos personales ni configuración secreta de AegiFitness.
