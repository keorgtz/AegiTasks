# Evidencia de validación

## Altura de opciones junto a submenús móviles — 9 de octubre de 2026

Se reprodujo en navegador real que abrir Ajustes dentro de Más opciones estiraba el botón vecino Chat de **44 a 278 px** en la bandeja a 320 px. La cuadrícula de dos columnas usaba la alineación vertical predeterminada, que estira sus elementos para llenar la fila. `.mobile-menu` ahora alinea cada elemento al inicio y conserva su altura natural; no fija alturas que puedan recortar etiquetas de varias líneas.

Pasaron **44 comprobaciones focalizadas de API/navegación/layout** con SQLite y Chromium real, además del build del cliente, TypeScript, lint, formato y whitespace. La prueba compara las alturas de todas las opciones directas antes/después de abrir Ajustes en Bandeja, Notas, Focus y Chat a 320/390/430 px, con temas claros/oscuros. También valida cerrar/navegar, iconos, áreas táctiles, sidebar de escritorio, navegación inferior y compositor de chat. Se revisaron capturas con el submenú abierto. Evidencia: `artifacts/mobile-menu-height-before.log`, `mobile-menu-height-after.log`, `mobile-menu-height-results.json` y `more-menu-expanded-*.png`. No se probó un teléfono físico ni un despliegue en producción.

## Roles de equipo por workspace — 8 de octubre de 2026

Se agregó el catálogo de roles de equipo en **Ajustes → Workspace**, con ejemplos en español, nombre/descripción, edición y eliminación confirmada. El propietario o un Admin que pertenezca al workspace compartido puede asignar un rol opcional a cada integrante, incluido el propietario. Los miembros comunes consultan las funciones sin controles de gestión. Cada workspace tiene su catálogo y asignaciones; Admin/User y los permisos por página siguen independientes. Los cambios actualizan las vistas conectadas mediante SSE.

La migración `20261008221807_WorkspaceTeamRoles` agrega catálogo/asignaciones con unicidad de nombres normalizados, versiones y relaciones compuestas que impiden asignar roles ajenos o a no miembros. La asignación del propietario materializa su membresía implícita sin cambiar propiedad; nunca recrea una membresía retirada por una operación concurrente. Quitar miembros elimina sus asignaciones; eliminar roles conserva miembros; transferir propiedad conserva funciones. La actualización SQLite es idempotente.

Pasaron **234 comprobaciones de regresión completa en SQLite**, **46 comprobaciones focalizadas en cada proveedor (SQLite y PostgreSQL real)** y **10 comprobaciones de persistencia/upgrade SQLite en memoria**. Los escenarios nuevos cubren validación, duplicados, permisos, aislamiento de espacios, asignación del propietario, versiones antiguas, renombrado, baja/reingreso de miembros, transferencia, eliminación, UI real y eventos entre dispositivos. La migración PostgreSQL se aplicó a datos anteriores: conserva las dos membresías existentes, roles globales, pendientes, estimaciones, etiquetas, conversaciones y notificaciones; los nuevos catálogos/asignaciones empiezan vacíos. La última comprobación focalizada en ambos proveedores incluye la protección adicional contra recrear membresías retiradas simultáneamente.

Compilación de API/cliente, TypeScript, lint, formato, whitespace y correspondencia del modelo con la migración aprobaron. Se revisaron capturas claras/oscuras en escritorio de 1440 px y móvil de 390/320 px; los selectores y diálogos caben sin desbordamiento horizontal y las acciones de icono mantienen 44 px con símbolos legibles. También aprobaron **76 comprobaciones .NET de notificaciones**, **38 de recordatorios**, **13 del worker push**, **6 de medios de chat** y **12 de actualización PWA con dos builds reales**. La suite respeta el límite de login existente cuando alcanza la ventana compartida de las cuentas de prueba.

Evidencia local: `artifacts/team-roles-full-sqlite-results.json`, `team-roles-focused-postgres-results.json`, `team-roles-postgres-migration-results.json`, logs `team-roles-*.log` y capturas `team-roles-*.png`. No se ejecutó el despliegue Docker en producción ni el workflow remoto de GitHub; la comprobación móvil usa Chromium con viewport móvil, no teléfonos físicos.

## Recordatorios de pendientes y del workspace — 8 de octubre de 2026

Se incorporó la página Recordatorios y su permiso habilitado por defecto para roles existentes/nuevos. Los registros independientes tienen título/mensaje, destinatario individual o todos los miembros elegibles, y contexto de proyecto opcional; no tienen estado ni vencimiento. Los proyectos comparten actualmente miembros del workspace: la audiencia de proyecto agrega el permiso Proyectos. El footer de los pendientes abre un diálogo compacto para varias programaciones, con responsable dinámico o audiencia explícita; sin responsable se avisa al equipo con acceso. Se pueden editar, pausar y eliminar con control de versiones. Los ligados suspenden avisos al resolver/archivar y los independientes sobreviven a eliminar su proyecto, pausados y sin contexto.

El worker de servidor evalúa la cola cada 10 segundos, persiste próxima ejecución y notificaciones/outbox en una transacción con reclamación condicional, coalesce intervalos perdidos y publica invalidaciones solo tras commit. Se mantienen push sin cookies, suscripciones persistentes y validación de cuenta, sesión, membresía, audiencia y permisos; pausar/resolver bloquea entregas todavía pendientes. Las frecuencias por minutos/horas usan tiempo transcurrido; días y semanas mantienen hora local y zona, con tratamiento explícito de horas inexistentes/repetidas. No exige Redis ni variables nuevas de despliegue.

Pasaron **226 comprobaciones completas en SQLite y 226 en PostgreSQL real**, incluyendo los seis grupos nuevos de API/UI de recordatorios. La migración PostgreSQL con datos antiguos aprobó: conserva pendientes, estimaciones, roles, espacios, etiquetas, conversaciones y avisos; agrega registros independientes con `WorkItemId` nullable y `ReminderId` opcional. SQLite reconstruye únicamente la tabla de avisos anterior en una transacción y conserva sus IDs, textos y outbox, verificados con `foreign_key_check` y una inserción independiente posterior. La migración es `20261008170300_Reminders`.

Pasaron **38 comprobaciones .NET del scheduler/calendario/upgrade**, **76 del subsistema anterior de notificaciones**, **13 del worker push** y **12 PWA con dos builds reales**. Compilación de API/cliente, TypeScript, lint, formato y whitespace aprobaron. Se revisaron capturas claras/oscuras en 1440, 390, 320 y 844 × 450 px, incluyendo el footer del pendiente, días táctiles en dos filas a 320 px y botones de guardar/cancelar visibles fuera del scroll del formulario. La prueba de conflicto mantiene el texto local tras una modificación de otra cuenta. Los tests de permisos se adaptaron a la octava página; los logins del test esperan la ventana de 30 intentos/5 minutos cuando se agota, sin modificar el límite de producción.

Evidencia local: `artifacts/reminders-full-sqlite-results.json`, `reminders-full-postgres-results.json`, `reminders-focused-sqlite-results.json`, logs `reminders-*.log`, `postgres-migration-results.json` y capturas `reminders-*.png`/`reminder-*.png`. Se utilizaron API, base, timer y conexiones reales; la autorización de push y el outbox se verificaron sin enviar a proveedores externos. No se probó instalación/entrega en teléfonos físicos, Docker en producción ni el workflow remoto de GitHub. La entrega exacta del sistema operativo no se presume desde estas pruebas.

## Stickers de KLIPY — 8 de octubre de 2026

El selector incorpora la pestaña Stickers, con tendencias, búsqueda y páginas de 12 resultados. Reutiliza la configuración pública `KLIPY_API_KEY` y las consultas directas del navegador, manteniendo atribución y URLs originales. Admite WebP, GIF y PNG en el contrato documentado del proveedor. El marcador Markdown permite persistir y distinguir stickers sin migración; lista y avisos muestran “Sticker compartido”. Se mantienen participación, silencios, movimiento reducido y borradores. Los errores explican falta de clave, límites o fallo del servicio; superar 4000 caracteres o cinco medios enlazados conserva el mensaje y permite corregirlo.

Pasaron **72 comprobaciones enfocadas de chat en SQLite y 72 en PostgreSQL real**, con las migraciones existentes. Incluyen stickers en chat individual y grupo, búsqueda/tendencias/paginación, envío explícito, URL exacta, eliminación del borrador, recarga, previews privadas, acceso denegado, movimiento reducido, vacío/429 y falta de configuración. La última revisión de SQLite también verificó el portapapeles con un borrador lleno. Se revisaron capturas claras/oscuras en escritorio, 320/390 px vertical y 844 × 450 px horizontal, con un PNG transparente propio como fixture; la opción, tabs y paginación permanecen accesibles.

Pasaron build de API/cliente, TypeScript, lint, formato y whitespace; **76 comprobaciones .NET**, **6 de parsing/contrato de medios**, **13 del worker push** y **12 PWA con dos builds reales**. La prueba de contrato también cubre WebP/GIF/PNG, orden de medios, query strings intactos, hosts/protocolos/formatos rechazados y respuestas de anuncios incompatibles. Se agregó al workflow de CI. Evidencia local: `artifacts/chat-stickers-sqlite-results.json`, `chat-stickers-postgres-results.json`, logs `chat-stickers-*.log` y capturas `chat-stickers-*.png`.

Las bases, API y conexiones de chat fueron reales; **el catálogo y medios externos de KLIPY fueron simulados**. No se validó una clave real, teléfono físico, despliegue Docker ni ejecución remota de CI. La clave usada en producción debe tener acceso a Stickers API. No se repitió la suite completa de otras páginas.

## Catálogo online, Unicode completo y teclado de chat — 8 de octubre de 2026

Se reemplazó la lista pequeña por Emojibase 17.0.0/CLDR, con 3979 registros incluyendo variantes, categorías, banderas, profesiones y tonos mixtos. Los datos españoles y licencia MIT se incluyen localmente; se presentan bloques de 240 opciones para limitar el DOM. Los tonos utilizan secuencias reales del dataset, incluidos ZWJ, en lugar de concatenar modificadores. Se conserva búsqueda sin acentos, selección, recientes por cuenta y límite del mensaje.

El selector abre por defecto la búsqueda online de KLIPY, separada de los GIFs privados. Usa tendencias, palabras y paginación, carga las URLs originales y muestra atribución. Los enlaces se guardan como texto compatible en el mensaje, con imagen animada en los clientes nuevos; no se copian medios externos al servidor ni se cachean en la PWA. La configuración pública del proveedor requiere sesión/permiso Chat y responde `no-store`. Compose y `.env.example` incluyen `KLIPY_API_KEY`. **La búsqueda real requiere una clave propia y configuración del proveedor; no se obtuvo ni se activó una cuenta KLIPY.**

El campo recibe archivos y enlaces HTTPS de CDN admitidos mediante paste, beforeinput nativo, drop o inserción textual. El HTML se examina en un template inerte y nunca se renderiza. Archivos GIF sin MIME se reciben y se validan al enviar. En computadora Enter envía y Shift+Enter agrega una línea; Ctrl/⌘+Enter sigue funcionando. En móvil Enter agrega una línea, y eventos de composición IME no envían mensajes. La restauración de foco compara el valor esperado del editor para evitar que un frame tardío del diálogo mueva el cursor mientras la persona empieza a escribir.

Pasaron **70 comprobaciones enfocadas de chat, notificaciones y shell en SQLite y 70 en PostgreSQL real**, con las migraciones existentes. Verifican búsqueda online por palabras, paginación, vacío, HTTP 429, atribución y preservación de URLs; consultas desde el cliente sin cookies de AegiTasks ni identidad interna para el proveedor; GIFs externos sin archivos copiados; banderas/tonos mixtos; paste HTML, beforeinput con URL/archivo sin MIME y drop; Enter/Shift+Enter, composición y Enter móvil. También pasan las funciones anteriores de grupos, archivos, silencios, permisos, navegación y teclado. Se revisaron capturas claras/oscuras de 1440, 390, 320 y 844 × 450 px, con opciones completas accesibles dentro del selector y paginación online.

Build de API/cliente, TypeScript, lint, formato y whitespace aprobaron. Pasaron **67 comprobaciones .NET**, **13 del worker push** y **12 PWA con dos builds reales** sobre el cliente final. El chunk de chat pesa 813 KB sin comprimir/103 KB gzip y se carga bajo demanda; la actualización y el shell offline siguen funcionando. La auditoría npm no reportó avisos para Emojibase; conserva dos avisos bajos existentes de Mermaid/KaTeX, que no se actualizaron en esta tarea.

Evidencia local: `artifacts/chat-catalog-sqlite-results.json`, `chat-catalog-postgres-results.json`, `chat-catalog-dotnet.log`, `chat-catalog-worker.log`, `chat-catalog-pwa.log`, `pwa-test-results.json`, `emoji-library-audit.json` y capturas `chat-catalog-*.png`. API, bases y conexiones fueron reales; el contrato KLIPY y sus medios usaron respuestas HTTP simuladas con el GIF propio de prueba. No se probó una clave real del proveedor, un teclado de Android/iOS físico ni el despliegue Docker en producción; tampoco se repitió la suite completa de otras funciones. La compatibilidad del teclado depende de que navegador/IME entregue contenido a la página; el catálogo integrado es la alternativa. No hay migraciones nuevas ni proxy/rehosting de medios externos.

## Emojis y GIFs de chat — 8 de octubre de 2026

Se añadió un selector de emojis Unicode con búsqueda en español sin distinción de acentos, categorías, tonos de piel y recientes por cuenta. Inserta o reemplaza en la selección del mensaje, conserva la posición del cursor y rechaza superar el límite sin perder el borrador. En escritorio tiene acceso directo; en teléfonos angostos utiliza el menú **+** para conservar el espacio del compositor. La galería de GIFs admite archivos locales y reutiliza adjuntos de conversaciones actuales, con búsqueda, páginas de 24 y verificación de acceso en cada lectura. El portapapeles permite adjuntar imágenes/GIFs; los envíos siguen siendo explícitos. Los GIFs conservan bytes/animación, tienen pausa/reproducción y empiezan estáticos con movimiento reducido. Las notificaciones y lista identifican mensajes de GIF sin texto.

Pasaron **68 comprobaciones enfocadas de chat, notificaciones y shell en SQLite y 68 en PostgreSQL real**, incluyendo las consultas nuevas y las migraciones existentes. Se verificaron selección y reemplazo de texto, inserciones múltiples, Unicode/tonos guardados, límite de longitud, firma/tamaño inválidos, adjuntar sin enviar, conservación de bytes, animación visible, pausa/reproducción, reutilización y movimiento reducido. La galería excluye chats ajenos incluso para Admin, retira grupos de integrantes expulsados y mantiene paginación estable sin duplicados. Las pruebas anteriores de grupos, adjuntos, referencias a pendientes, silencios, banners en vivo, sidebar, navegación móvil, autoexpansión, teclado, permisos y sesiones siguieron pasando.

Se revisaron capturas de 1440, 390, 320 y 844 × 450 px, claro/oscuro, de ambos selectores. Las comprobaciones exigen que una opción completa quepa en el área desplazable, además de que el diálogo respete el viewport. Durante la validación se corrigieron el espacio restado al mensaje en 320 px y las tarjetas recortadas en horizontal. La animación se comprobó mediante capturas reales de frames diferentes de un GIF de dos fotogramas: canvas usa el poster de imágenes animadas por especificación, por lo que no sirve para medir su reproducción visual. El GIF de prueba está en `client/scripts/fixtures/chat-animation.gif`.

Build de API/cliente, TypeScript, lint, formato y whitespace aprobaron. También pasaron **67 comprobaciones .NET**, **13 del worker push** y **12 PWA con dos builds reales**. Evidencia local: `artifacts/chat-media-sqlite-results.json`, `chat-media-postgres-results.json`, `chat-media-dotnet.log`, `chat-media-worker.log`, `chat-media-pwa.log`, `pwa-test-results.json` y capturas `chat-media-*.png`/`chat-gifs-*.png`. Los datos y conexiones fueron reales; los viewports, movimiento reducido, portapapeles de prueba y permisos push se simularon en Chromium. No se repitió la suite completa de otras funciones, no se probó en teléfonos físicos ni se desplegó en producción. No requiere migraciones, claves API, dependencias nuevas ni cambios al Compose.

## Push en segundo plano sin sesión de navegador — 7 de octubre de 2026

La revisión encontró rutas que podían retrasar o perder avisos: polling de cinco segundos, peticiones de pendientes que bloqueaban la cola de chat y un worker que necesitaba cookies para consultar los detalles y descartaba el aviso ante errores de red. El servidor ahora despierta la cola después del commit, procesa pendientes y chats con contextos independientes y envía `Urgency: high`. Una credencial protegida de 24 horas permite consultar únicamente el aviso autorizado para ese dispositivo, sin cookies ni ventana abierta. Se mantienen controles de cuenta activa, sesión, membresía, página, lectura y silencio. No se incluyen títulos ni mensajes privados en el payload push.

El worker conserva agrupación, logo y compatibilidad con payloads anteriores. Ante red caída, error temporal o una consulta de más de cuatro segundos muestra un aviso genérico sin contenido privado; las respuestas explícitas de acceso retirado, lectura o silencio lo suprimen. También cancela avisos de chat pendientes de mostrarse cuando la conversación se lee o silencia. La configuración recupera una cookie de vínculo vencida únicamente si la cuenta y las claves coinciden con un registro vigente; no reactiva dispositivos eliminados ni toma suscripciones ajenas.

Pasaron **211 comprobaciones completas en SQLite y 211 en PostgreSQL real**, incluyendo migraciones existentes. Después del ajuste adicional del vínculo pasaron **73 comprobaciones enfocadas de ajustes, perfil y notificaciones en SQLite y 58 de notificaciones en PostgreSQL**. El ejecutable .NET pasó **67 comprobaciones**, incluyendo una petición HTTP real sin cookies y con respuesta `no-store`, credenciales alteradas/vencidas/revocadas, permiso retirado, lectura, silencio, cola y cabeceras del transporte cifrado/VAPID. El worker pasó **13 comprobaciones**, incluyendo ausencia de ventanas, errores/timeout, agrupación y cancelación durante consultas pendientes. La PWA pasó **12 comprobaciones con dos builds reales** sobre el cliente final. Build de API/cliente, TypeScript, lint, formato y whitespace aprobaron.

En una ejecución intermedia de PostgreSQL falló la activación de un arrastre al desplazarse una columna larga. Se ajustó exclusivamente el helper de pruebas para esperar dos frames al medir coordenadas y activar el sensor, conservando sus aserciones y sin cambiar la aplicación. La ejecución enfocada posterior pasó **44 comprobaciones** y la completa posterior pasó las **211** citadas.

Evidencias locales: `artifacts/background-push-unit.log`, `background-push-sqlite-results.json`, `background-push-pg-full-results.json`, `background-push-pg-interactions-results.json`, `background-push-recovery-sqlite-results.json`, `background-push-recovery-postgres-results.json`, `background-push-final-pwa.log` y `pwa-test-results.json`. Los proveedores push y permisos nativos se simularon; las bases, API, consultas HTTP y builds fueron reales. **No se midió entrega FCM/Apple en un teléfono físico ni se desplegó en producción.** El sistema operativo, proveedor y red aún pueden retrasar la entrega; no se garantiza recepción instantánea con el dispositivo sin red o el navegador detenido. No requiere migración nueva ni cambios al Compose; se deben conservar storage y claves entre despliegues.

## Restauración del logo en notificaciones — 7 de octubre de 2026

La captura móvil del usuario mostró un círculo con la letra T después de omitir `icon`. Se restauró `/aegitasks-icon-192.png` en el worker compartido por avisos de pendientes y chat, manteniendo el badge, autorización, agrupación y ausencia de `image`. Las pruebas verifican explícitamente el logo enviado en ambos tipos de aviso: **7 comprobaciones del worker push y 12 de actualización PWA aprobadas**, con dos builds reales. Lint, formato y whitespace aprobaron. La presentación nativa después de este cambio no se verificó en un teléfono físico; el cambio se aplica a nuevos avisos tras desplegar y actualizar la PWA.

## Contraseñas flexibles y presencia de chat — 7 de octubre de 2026

Se eliminaron las restricciones de longitud y obligatoriedad de la contraseña en API, acceso, cambio de clave, edición de identidad y administración de usuarios. Las claves vacías siguen pasando por PasswordHasher; no existe un bypass de autenticación. En edición administrativa, omitir o enviar `null` conserva el hash, mientras `""` lo reemplaza por una clave vacía. El bootstrap y Compose admiten un valor inicial explícitamente vacío, manteniendo el error cuando falta la configuración. El medidor local y orientativo detecta contraseñas comunes, patrones y datos de la persona; analiza como máximo 128 caracteres para limitar trabajo del navegador, sin recortar la clave guardada.

La presencia usa las conexiones SSE autenticadas y agrega varias pestañas/dispositivos. El servidor emite cambios de estado; los latidos no recargan datos ni generan notificaciones. Se probaron estados conectado/ausente/desconectado, ocultamiento, cinco minutos de inactividad con reloj de navegador controlado, reanudación, cierre de la última conexión, vencimiento a 90 segundos, tokens ajenos/inventados y exclusión de cuentas desactivadas. La lectura se limita a integrantes actuales de chats compartidos. Se revisaron capturas de 1440, 390 y 320 px en ambos temas.

La ejecución final completa pasó **211 comprobaciones en SQLite y 211 en PostgreSQL real**, incluyendo migraciones existentes y todas las funciones anteriores. La ejecución enfocada pasó **44**, la de ajustes **72**, el ejecutable .NET **50**, el worker push **7** y la actualización PWA **12**. Build/typecheck, lint, formato y revisión de whitespace aprobaron. Evidencias locales: `artifacts/password-presence-focused-results.json`, `password-presence-settings-results.json`, `password-presence-unit.log`, `password-presence-sqlite-results.json`, `postgres-test-results.json`, `pwa-test-results.json`, `password-strength-*.png` y `chat-presence-*.png`.

Los viewports, reloj, ocultamiento y proveedores de notificación se simularon en Chromium; las conexiones, sesiones y bases de datos fueron reales. No se verificó esta versión en teléfonos físicos ni se desplegó en el servidor de producción. No requiere una migración nueva; la presencia queda en memoria de la única API existente.

## Chat global, grupos y archivos — 7 de octubre de 2026

Se agregaron conversaciones privadas únicas por pareja y grupos de hasta 50 integrantes, independientes del Space, con texto, hasta cinco adjuntos por mensaje y accesos directos a pendientes. Los usuarios activos pueden iniciar conversaciones sin pertenecer al mismo workspace. Mensajes, historial y archivos exigen participación y permiso de Chat; incluso Admin no puede leer chats ajenos. El creador administra el grupo con protección de versión. Referencias a pendientes exigen acceso compartido al enviar y se vuelven a autorizar al leer.

Pasaron **180 comprobaciones completas en SQLite y 180 en PostgreSQL 18.4**. Incluyen las funciones anteriores y 11 grupos nuevos de chat: independencia de headers/Spaces, privacidad, conversaciones únicas, reintentos idempotentes, mensajes concurrentes, paginación por secuencia, lectura monotónica, grupos, retiro de miembros, archivos autenticados/rangos, contenido falso o demasiado grande, referencias y revocación, interacción real, borradores entre Spaces y roles. Una ejecución enfocada previa pasó 49 comprobaciones. Los conflictos de grupo desde otra sesión conservan la edición local y rechazan sobrescribir la versión nueva.

Se generó y reprodujo un **WebM real** desde canvas/MediaRecorder, se subió al servidor y se verificó avance del reproductor autenticado. Se probaron previews PNG, descarga PDF y rangos de video. Los mensajes en vivo llegan desde otro usuario sin polling. Se revisaron capturas de escritorio claro/oscuro, móviles de 390/320 px y horizontal de 844 × 450 px, manteniendo visibles los controles de envío y navegación móvil.

La migración PostgreSQL **Chat** se ejecutó sobre datos anteriores y una base nueva: agrega sus tablas y el permiso por defecto, conservando pendientes, usuarios y avisos existentes. La actualización SQLite pasó dos veces sobre una base con datos anteriores, conservando pendientes y habilitando Chat para los roles existentes. Las **19 comprobaciones .NET** de entrega/cola/actualizaciones locales y las **4 del worker push** pasaron. Las **12 comprobaciones PWA** se repitieron sobre el código final con dos builds reales y pasaron.

Build de cliente con TypeScript, lint/formato, API Debug/Release y modelo EF sin cambios pendientes aprobados. El cliente usa el mismo volumen de archivos y despliegue, con límite Nginx/formulario de 26 MB para videos de hasta 25 MB; los adjuntos de pendientes siguen limitados a 10 MB. La guía está en [CHAT.md](CHAT.md).

Evidencia local en `artifacts/`: `chat-sqlite-results.json`, `chat-sqlite-full.log`, `chat-postgres-results.json`, `chat-postgres-full.log`, `postgres-migration-results.json`, `chat-focused-final-results.json`, `chat-local-upgrade.log`, `chat-pwa-final.log`, `chat-build-final.log`, `chat-release.log`, `chat-worker.log` y capturas `chat-*.png`. **No se validaron teléfonos físicos, Safari/iOS, Docker ni proxies del servidor real, y no se desplegó en producción.**

## Centrado del diálogo de notificaciones en móvil — 7 de octubre de 2026

Se reprodujo el desplazamiento horizontal: en un viewport de 390 px el diálogo tenía 366 px de ancho y comenzaba en `x=0`, dejando 24 px libres solo a la derecha. Su ancho específico se combinaba con `margin: auto 0 0` de los modales móviles. Se agregó `margin-inline: auto` exclusivamente al diálogo de notificaciones; ahora tiene 12 px a cada lado y conserva su comportamiento de panel inferior. Los demás diálogos no cambian.

La comprobación nueva falló con el CSS anterior y pasó con el cambio. La suite enfocada pasó **54 verificaciones sobre SQLite**, incluidas acciones de lectura, filtros, apertura de pendientes, notificaciones y navegación. Se verificaron centrado horizontal y límites del viewport en 11 combinaciones: escritorio de 1440 px, tablet de 768 px, móviles verticales de 320/375/390/430 px y horizontal de 844 × 390 px, con ambos temas. También se verificó el diálogo vacío después de marcar todos los avisos como leídos.

Build/TypeScript, lint, formato y diff correctos. Se revisaron visualmente capturas de 390 px oscuro, 320 px claro y estado vacío. Evidencia en `artifacts/`: `notification-mobile-alignment-before.log`, `notification-mobile-alignment-after.log`, `notification-mobile-alignment-results.json`, `notification-mobile-build.log`, `notification-details-*.png` y `notification-mobile-empty-centered.png`. Es validación de navegador Chromium con viewports emulados, sin prueba física ni despliegue en producción. No cambia API ni base de datos; no se repitieron PostgreSQL ni la suite PWA.

## Avisos con título y cambios precisos — 7 de octubre de 2026

Historial y notificaciones del sistema muestran el título del pendiente. Los avisos nuevos guardan el título del evento y distinguen creación, asignación/reasignación, eliminación del responsable, cambio al estado personalizado, propiedades editadas, comentario, evidencia, archivo y restauración. La comparación incluye relaciones y etiquetas; cambiar únicamente versión/fecha interna no produce avisos. No se incluyen textos completos de comentarios, descripciones ni archivos.

Pasaron **169 comprobaciones completas en SQLite y 169 en PostgreSQL 18.4**. Verifican títulos conservados después de renombrar, resúmenes de más de 200 caracteres, cambios de estado con nombre real, múltiples propiedades en un aviso, etiquetas sin otros cambios, guardados sin cambios, agrupaciones masivas, padre, estimación, traslado de proyecto, responsable y respuesta autenticada para push. También pasó una ejecución enfocada previa de 53 comprobaciones sobre SQLite.

La migración PostgreSQL `NotificationDetails` se probó sobre historial existente: conserva identificadores/mensajes, recupera el título actual y permite resúmenes largos. La actualización SQLite pasó dos veces sobre una tabla anterior sin `TaskTitle`, conservando historial y pendientes. Los títulos y detalles de eventos anteriores que no se almacenaban no pueden reconstruirse; su resumen original se conserva.

Pasaron **18 comprobaciones .NET** de entrega/cola, rollback, actualización SQLite y transporte cifrado sobre HTTP simulado, y **4 comprobaciones del service worker**, incluyendo mostrar el título y acción devueltos por la API. Build de API Debug/Release, comprobación del modelo EF, TypeScript, lint, formato de scripts y diff sin errores. No se cambió el código del cliente ni del worker de producción, por lo que no se repitió la suite PWA de la iteración anterior.

Se revisaron capturas del historial en escritorio claro y móvil oscuro de 390/320 px, con títulos largos y resúmenes de propiedades. Evidencia local en `artifacts/`: `notification-details-sqlite-results.json`, `notification-details-sqlite-full.log`, `notification-details-postgres-results.json`, `notification-details-postgres-full.log`, `postgres-migration-results.json`, `notification-details-delivery.log`, `notification-details-focused-results.json` y capturas `notification-details-*.png`.

Las pruebas utilizan API/bases reales y cliente de producción; permisos y PushManager se simulan en Chromium. **No se probó recepción de proveedores push reales ni en dispositivos físicos, y no se desplegó en producción.**

## Configuración e invitación del dispositivo — 7 de octubre de 2026

La activación/desactivación se trasladó a **Ajustes → Notificaciones**; la campanita conserva el historial y un enlace a esa página. Los ajustes separan opciones personales, organización del equipo y administración, con descripción y alcance de cada sección, navegación lateral en escritorio y selector compacto en móvil. Mi cuenta distingue identidad y seguridad; organización distingue proyecto, carpetas, estados y etiquetas compartidas. Se conservaron permisos y rutas anteriores.

La primera apertura instalada muestra una invitación sin solicitar automáticamente el permiso nativo. La decisión se recuerda por usuario y almacenamiento del navegador; un dispositivo ya activado no vuelve a preguntar. La invitación espera si hay un diálogo, una nota en edición o Focus inmersivo. La página del dispositivo muestra permiso bloqueado, errores, carga y reintento. Activar/desactivar bloquea la actualización automática de la PWA durante la operación.

Pasaron **165 comprobaciones de la suite completa en SQLite**, incluyendo los ocho grupos nuevos de ajustes/invitación y la regresión de tableros, tareas, notas, Focus, permisos y notificaciones. Una ejecución enfocada previa pasó 58 comprobaciones. Durante la regresión se corrigió el movimiento del tablero de módulos/ciclos causado por insertar el aviso de actualización en segundo plano: el aviso conserva su anuncio accesible sin desplazar las tarjetas.

Build/typecheck de producción, lint y formato aprobados. Las **12 comprobaciones PWA** se repitieron sobre el código final con dos builds reales y pasaron: actualización entre despliegues, conservación de formularios, modo offline y ausencia de bucles. Se revisaron capturas de escritorio claro/oscuro, móvil de 390/320 px y la invitación instalada. Las pruebas también cubren orientación horizontal de 844 × 450 px, creación real de carpetas/estados/etiquetas, acceso de User sin administración, decisiones separadas por usuario, registro/desactivación y protección durante una suscripción pendiente. Evidencia local: `settings-sqlite-results.json`, `settings-sqlite-full.log`, `settings-focused-results.json`, `settings-pwa-final.log`, `pwa-test-results.json` y capturas `settings-*.png`, dentro de `artifacts/`.

El modo instalado, el permiso y PushManager se simulan en Chromium; la API y el registro del dispositivo son reales. **No se verificó una instalación física, el diálogo nativo de permisos ni la recepción de proveedores push reales.** No cambia backend ni esquema; PostgreSQL conserva la validación anterior de 157 comprobaciones y no se repitió para esta iteración de interfaz. No se desplegó en producción.

## Notificaciones — 7 de octubre de 2026

Se agregaron historial personal, Web Push por dispositivo y la migración `TaskNotifications`. La suite completa pasó **157 verificaciones en SQLite y 157 en PostgreSQL 18.4**, incluyendo creación/asignación, ediciones, comentarios, evidencias, pendientes sin responsable, permisos y revocación. PostgreSQL también pasó la migración desde datos anteriores con las nuevas tablas vacías y sus pendientes conservados.

La revisión final repitió **50 comprobaciones enfocadas en SQLite**, con el registro de dispositivos transaccional y el contador de avisos con contraste reforzado. Evidencia: `notifications-sqlite-focused-results.json` y `notifications-sqlite-focused-final.log`.

El ejecutable `server/AegiTasks.NotificationTests` pasó **17 comprobaciones** sobre claves protegidas y reutilizadas, entrega, reintentos, suscripciones vencidas, revocación, cifrado/VAPID del transporte HTTP simulado, rollback de avisos y actualización SQLite idempotente. `push-worker-tests.mjs` pasó **4 comprobaciones** de autorización, errores, identificadores y navegación del service worker. Las **12 comprobaciones PWA** siguen pasando con el nuevo script importado.

Build/typecheck de producción, lint, formato, builds .NET Debug/Release y modelo EF sin cambios pendientes aprobados. La auditoría .NET con dependencias transitivas del 7 de octubre no reportó paquetes vulnerables. Las claves privadas y endpoints no se escriben a logs; se desactivaron los loggers automáticos del cliente HTTP push.

Las capturas `notifications-1440-light.png`, `notifications-390-dark.png` y `notifications-320-dark.png` se revisaron visualmente. La UI también valida registro/desactivación contra la API y recepción de eventos reales; permisos y PushManager se simulan porque Chromium headless mantiene bloqueado el permiso de notificaciones del sistema. **No se probó recepción desde proveedores push reales ni en PC/Android/iPhone físicos y no se desplegó en producción.** La guía de comprobación después del despliegue está en [NOTIFICATIONS.md](NOTIFICATIONS.md).

Evidencias locales: `notifications-sqlite-results.json`, `notifications-postgres-results.json`, `notifications-delivery-tests.log`, `notifications-worker-tests.log`, `notifications-pwa.log` y `postgres-migration-results.json`, dentro de `artifacts/` (excluido de Git). El workflow ahora ejecuta las pruebas de entrega y del worker además de la suite completa; no se verificó su ejecución remota.

## Evidencia de la iteración anterior

Actualización funcional: 6 de octubre de 2026. Entorno local: Windows, .NET SDK 10.0.400, Node 24.15.0, Chromium de Playwright y PostgreSQL 18.4. La auditoría de npm se repitió el 6 de octubre; las auditorías de .NET y comprobaciones de YAML/shell siguen correspondiendo al 23 de septiembre.

La iteración de Kanban, estado rápido y calendario modifica frontend, filtros opcionales de consultas de pendientes en la API, pruebas y documentación. Se repiten build/typecheck, lint, formato, builds Debug/Release de API, comprobación del modelo, suites SQLite/PostgreSQL y PWA. No cambia el esquema ni se agrega una migración. Las pruebas utilizan datos temporales aislados y no modifican la base de desarrollo ni el servidor de producción.

## Ejecutado correctamente

| Verificación                                                                    | Resultado                                                                                                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dotnet build`                                                                  | Sin errores ni advertencias                                                                                                 |
| `dotnet build -c Release`                                                       | Sin errores ni advertencias                                                                                                 |
| `dotnet ef migrations has-pending-model-changes --project server/AegiTasks.Api` | Modelo y migración PostgreSQL coinciden                                                                                     |
| `npm --prefix client run typecheck`                                             | Correcto                                                                                                                    |
| `npm --prefix client run lint`                                                  | Sin diagnósticos                                                                                                            |
| `npm --prefix client run build`                                                 | Build de producción y service worker generados                                                                              |
| `npm --prefix client run test:e2e`                                              | **145 verificaciones aprobadas sobre SQLite**                                                                               |
| `npm --prefix client run test:pwa`                                              | **12 verificaciones aprobadas** el 6 de octubre; migración opcional del worker anterior documentada en la validación previa |
| `node client/scripts/sqlite-upgrade-tests.mjs`                                  | Conserva cuentas, contraseñas, espacio personal, notas y estimaciones; módulos, ciclos y jerarquía nuevos operativos        |
| `node client/scripts/postgres-tests.mjs`                                        | **145 verificaciones aprobadas** y migración con datos anteriores sobre PostgreSQL 18.4, el 6 de octubre                    |
| `npm --prefix client audit --omit=dev`                                          | Dos avisos bajos de KaTeX/Mermaid; sin avisos moderados, altos o críticos el 6 de octubre                                   |
| `dotnet list server/AegiTasks.Api package --vulnerable --include-transitive`    | Sin paquetes vulnerables reportados                                                                                         |
| Parseo de YAML con Prettier                                                     | Compose y workflow válidos sintácticamente                                                                                  |
| `sh -n scripts/setup-env.sh` en Ubuntu/WSL                                      | Sintaxis correcta                                                                                                           |

La auditoría de dependencias corresponde a la fecha indicada; no garantiza ausencia de vulnerabilidades futuras.

## Pruebas funcionales

### Kanban, estado rápido y calendario (6 de octubre)

Las suites completas aprobaron **145 verificaciones en SQLite y 145 en PostgreSQL 18.4**, y la suite PWA aprobó **12 verificaciones**. El recorrido específico aprobó además **44 verificaciones** de arranque/API, interacciones y sesión, tanto en SQLite como en la revisión final de PostgreSQL con los controles habilitados durante refrescos. Evidencia: `task-interactions-sqlite-results.json`, `task-interactions-postgres-results.json`, `task-interactions-focused-results.json`, `task-interactions-postgres-focused-results.json` y `pwa-test-results.json`. Compilaciones Debug/Release, modelo EF sin cambios pendientes, build del cliente con typecheck, lint y formato correctos. No se desplegó en producción ni se verificó en dispositivos físicos.

Seis grupos nuevos comprueban rangos inclusivos, año bisiesto, más de 50 resultados, responsable, proyecto y consultas sin fecha; cambios de estado desde listas, tarjetas y cronología sin abrir detalles; arrastre con mouse y teclado, cancelación y rechazo de otro proyecto; conflictos persistentes con actualización segura; tableros y calendarios de módulos/ciclos, incluyendo eventos táctiles reales enviados a Chromium; y mes anterior/siguiente, Hoy, paginación del calendario, agenda móvil y estado rápido en ambos temas a 1440, 390, 320 y 844 px. Las columnas tienen scroll local y se verifica arrastrar también una tarea al final de una columna extensa. Los recorridos existentes comprueban estados de subpendientes y Focus, progreso, permisos, notas, archivos, actualizaciones y ausencia de polling.

Capturas revisadas: `task-calendar-1440-light.png`, `task-calendar-320-dark.png`, `task-calendar-grid-320-dark.png`, `group-board-touch.png` y `tasks-drag-board-dark.png`. El nombre de la última captura identifica el escenario; su tema depende del contexto inicial del recorrido. Los botones rápidos son hermanos del botón de apertura, evitando controles interactivos anidados. Su selector vive fuera de las listas y se conserva durante refrescos SSE. Una operación iniciada de arrastre conserva su tarea/version original durante el refresco; el servidor decide si la escritura sigue vigente.

Las ejecuciones intermedias detectaron selectores antiguos que contaban todos los botones de una fila, duplicación visual del estado en Focus, un picker descartado al refrescar y gestos/clics ignorados por bloqueo transitorio de carga. Se corrigieron la composición y las esperas sobre activación/columna elegida; los gestos de teclado esperan la pintura del overlay, sin reintentar escrituras. Una prueba de desvinculación de hijos confundía el ocultamiento temporal de la lista con la finalización del PUT: ahora espera la respuesta 200 antes de comprobar la relación. Los conflictos siguen devolviendo 409. El preview de Vite terminó una vez con el código nativo Windows `3221226505`; el harness ahora sirve el mismo `client/dist` con un servidor Node y proxy API/SSE, sin cargar herramientas nativas durante la navegación. Se conserva un modo opcional `AEGITASKS_TEST_ONLY=interactions` para revisar este recorrido; no sustituye la suite completa.

Se añadió `@dnd-kit/core` 6.3.1 y se actualizó la dependencia de desarrollo `source-map-js` a 1.2.2, eliminando su aviso alto. npm mantiene dos avisos bajos de la dependencia existente KaTeX/Mermaid; no se aplicó la reducción a Mermaid 10 propuesta por `audit --force`, porque perdería diagramas ya soportados. La auditoría completa final figura en `task-interactions-full-audit.json`, y la de producción en `task-interactions-audit.json`.

### Altura natural y espaciado del sidebar (6 de octubre)

La suite completa pasó **139 verificaciones sobre SQLite** y la suite de actualización PWA pasó **12 verificaciones**. Build de producción con typecheck, lint y formato correctos. Resultados: `sidebar-sizing-sqlite-results.json`, `pwa-test-results.json`; registros: `sidebar-sizing-build.log`, `sidebar-sizing-sqlite.log` y `sidebar-sizing-pwa.log`.

La prueba adicional comprueba que Workspace conserva su altura natural cuando cabe, que Proyectos plegado permanece inmediatamente debajo a alturas 900/600/450 px y que sus acciones miden 32 px con separación de 8 px en computadora. Verifica la eliminación del mensaje inferior y el espaciado del submenú de Ajustes. Las pruebas existentes cubren ambos paneles abiertos, catálogos extensos, scroll independiente, teclado, navegación móvil y ausencia de desbordamiento en ambos temas. Capturas revisadas: `sidebar-content-sized-light.png`, `sidebar-content-sized-dark.png`, `sidebar-projects-collapsed-dark.png` y `project-tree-600-dark.png`.

Una comprobación inicial exigía mostrar todo Workspace incluso a 450 px, donde el contenido requiere scroll local. Se corrigió esa expectativa: altura natural cuando cabe y encabezados contiguos también cuando no cabe; las esperas nuevas tienen un límite de cinco segundos. No cambiaron API, esquema, migraciones ni dependencias. No se repitió PostgreSQL ni se desplegó en producción o verificó en dispositivos físicos.

### Navegación y cuatro vistas de bandeja (6 de octubre)

La suite final completa pasó **138 verificaciones sobre SQLite** y la suite PWA pasó **12 verificaciones** con el código final. Build de producción con typecheck, lint y formato correctos. Resultados en `navigation-inbox-sqlite-results.json` y `pwa-test-results.json`; API, modelo, migraciones y dependencias no cambian. No se repitió PostgreSQL ni se ejecutó el despliegue de producción o aceptación en dispositivos físicos.

Ocho grupos nuevos comprueban el encabezado Proyectos sin expansión automática, retirada de enlaces duplicados, submenú completo de Ajustes, rutas antiguas redirigidas, permisos de Usuarios y roles, aislamiento de preferencias por usuario y ocultación independiente/persistente de bienvenida y KPIs. Se conserva el acceso a cuenta, organización, espacios, administración, proyectos individuales y sus módulos/ciclos. Los paneles de workspace y proyectos se mantienen abiertos a la vez a alturas 900, 768, 600 y 450 px en ambos temas: cada scroll cambia solo su región y todos los enlaces permanecen alcanzables; el sidebar no desborda ni desplaza su logo/perfil. Se sustituyen las comprobaciones anteriores de exclusión/paginación lateral por la navegación solicitada.

Un conjunto de 54 pendientes comprueba que el filtro inicial incluye 52 propios/sin asignar, excluye el responsable ajeno y el completado, y que las cuatro vistas muestran exactamente los mismos IDs antes y después de cambiar página. Cambiar proyecto, responsable y alcance conserva equivalencia entre tarjetas, lista, tablero y cronología. El selector de vista se comparte con Módulos/Ciclos y conserva sus flujos existentes. La cronología verifica fechas límite y pendientes sin fecha sin inventar duraciones; abrir una fila lleva al detalle normal. En 320 y 390 px, los vencimientos se presentan como una agenda sin scroll horizontal; en escritorio se conserva el eje con marcadores y hoy.

Las vistas y Ajustes se revisan en 1440×900, 390×844, 320×740 y 844×390, con temas claro/oscuro y controles de 44 px, sin desbordamiento de página. Capturas revisadas: `navigation-panels-450-dark.png`, `inbox-tarjetas-390-light.png`, `inbox-cronología-320-dark.png`, `inbox-cronología-1440-dark.png` y `settings-workspace-320-dark.png`. Las pruebas previas de notas, Focus, edición concurrente, padres/hijos, roles, archivos, actualizaciones y ausencia de polling siguen dentro del recorrido completo.

Dos ejecuciones intermedias detectaron esperas incompletas en pruebas: una contaba filas durante el refresco del tablero de un módulo y otra comprobaba el scroll antes de que los proyectos creados por API llegaran al catálogo del cliente. Se añadieron esperas acotadas sobre la fila esperada y el último proyecto antes de mantener las mismas comprobaciones. No se añadieron pausas arbitrarias ni reintentos de escrituras; registros y capturas conservados como `navigation-inbox-planning-wait*` y `navigation-inbox-catalog-wait*`.

### Footer compacto y padres/subpendientes (6 de octubre)

La suite completa final pasó **130 verificaciones en SQLite y 130 en PostgreSQL 18.4**, incluyendo catorce grupos nuevos de jerarquía/footer; las actualizaciones PWA pasaron sus **12 verificaciones** con el código final. Resultados en `task-hierarchy-sqlite-results.json`, `postgres-test-results.json`, `postgres-migration-results.json`, `sqlite-upgrade-results.json` y `pwa-test-results.json`. Pasaron build Debug/Release de API, modelo EF sin cambios pendientes, build de producción del cliente con typecheck, lint y formato. La validación visual y funcional utiliza Chromium local; no se ejecutó en dispositivos físicos ni se desplegó al servidor de producción.

El footer mantiene estado, responsable y Guardar fuera del contenido desplazable en las tres pestañas. Las propiedades opcionales se abren con botones compactos y se agrupan en pantallas pequeñas. La prueba real modifica fecha y guarda desde Actividad; verifica que un título inválido devuelve a General y que las selecciones se conservan entre pestañas. Escape cierra solo el diálogo secundario, sin activar la confirmación de salida del pendiente ni perder el borrador. Se corrigió la propagación del evento cancel en el componente Modal y se conservó el fallo que lo detectó como `task-hierarchy-escape-failure*`. Se revisan 1440×900, 390×844, 320×600 y 844×390, en claro/oscuro, sin desbordamiento horizontal, con controles visibles y áreas táctiles de 44 px en teléfono/landscape. Capturas: `task-footer-1440-light.png`, `task-footer-390-dark.png`, `task-footer-320-light.png`, `task-footer-844-dark.png`.

Los casos de API cubren varios niveles, responsables independientes, avance con estados personalizados, compatibilidad con clientes que omiten jerarquía, rechazo de autorreferencias/ciclos/proyectos/Spaces ajenos, tareas archivadas, versiones antiguas, movimiento de hojas entre proyectos, bloqueo de movimiento de padres con hijos y eliminación que conserva los hijos con nueva versión e historial. Dos peticiones simultáneas que intentan A→B y B→A deben producir una aceptación y un rechazo sin ciclo. El borrado del proyecto con múltiples niveles debe completar sin fallos de claves foráneas.

La UI crea un hijo asignado a otro integrante con proyecto/módulo/ciclo heredados; navega al padre y completa al hijo sin completar al padre. También busca, vincula y retira un pendiente existente. La elección de padre permanece como borrador hasta guardar; puede eliminarse con **Sin padre**. Las listas y candidatos incluyen más de 50 pendientes y verifican paginación; los endpoints nuevos requieren permiso Pendientes además de membresía del Space.

`TaskHierarchy` añade una referencia nullable, índice y clave foránea restrictiva en PostgreSQL; los pendientes anteriores siguen como raíces y conservan texto, IDs, comentarios y estimaciones. La extensión del esquema SQLite anterior conserva usuarios, hashes, espacio personal, notas y estimaciones y permite crear un hijo correctamente. El estado de los padres y las estimaciones no se agregan automáticamente: los recuentos de proyectos/módulos/ciclos siguen contando pendientes individuales.

Una primera ejecución SQLite se interrumpió cuando `vite preview` salió con código Windows 3221226505 durante una prueba existente de módulos; la repetición completa pasó 128 verificaciones. PostgreSQL presentó el mismo cierre del preview en otra prueba de planificación. Ambos registros y capturas se conservaron como `task-hierarchy-*-preview-failure*`. El harness carga ahora la configuración de preview con `--configLoader native`, soportado por Node 24 local y CI; conserva Vite preview, su proxy y el build de producción. No se añaden reintentos de escrituras ni se modifica la configuración de producción.

### Árbol lateral de proyectos y muestrario compartido (6 de octubre)

La suite completa pasó **116 verificaciones en SQLite** y las actualizaciones PWA pasaron sus **12 verificaciones**. Resultados en `project-tree-sqlite-results.json` y `pwa-test-results.json`. Una espera existente de `Response.finished()` en la prueba de sincronización de Focus carecía de límite; se sustituyó por `requestfinished` con un máximo de 30 segundos, manteniendo la comprobación de refresco real. La repetición completa pasó; la ejecución detenida se conserva en `project-tree-e2e-interrupted.log`. El producto Focus no se modificó.

La navegación Pendientes / Módulos / Ciclos se trasladó al árbol del sidebar; las pestañas del contenido se eliminaron. Las pruebas verifican despliegue y plegado por teclado, cambio de sección, indicador activo al abrir un enlace de detalle y recarga. Un catálogo adicional de nueve proyectos, incluido un nombre largo, verifica que todas las opciones son alcanzables mediante paginación y que el sidebar y su panel no desbordan a alturas 900, 768, 600 y 450 px en ambos temas. Cuando cabe, el encabezado y sus tres enlaces permanecen juntos.

En 390×844, 320×740 y 844×390 se verifica el diálogo móvil de navegación, sus enlaces, cierre con Escape sin navegar y ausencia de las pestañas superiores. Proyectos, módulos y ciclos utilizan un único componente de muestrario con seis botones de 44 px, nombre accesible y selección anunciada. Las pruebas guardan azul en un módulo y verde en un ciclo, recuperan el color al editar y comprueban que Cancelar conserva el valor anterior; Enter selecciona un color sin enviar el formulario. El mismo componente conserva la selección en proyectos.

Se revisaron capturas de `planning-views-modules-Tarjetas-1440-dark.png`, `project-tree-mobile-390-light.png`, `planning-swatches-modules-320-light.png` y `planning-swatches-cycles-1440-dark.png`. El build de producción, typecheck, lint y formato se validaron. Las pruebas son en Chromium local; no en dispositivos físicos ni en el servidor de producción. Esta iteración solo modifica cliente y documentación: no cambia API, modelo ni migraciones.

### Páginas de gestión de módulos y ciclos (6 de octubre)

La suite final pasó **112 verificaciones en SQLite y 112 en PostgreSQL 18.4**, incluyendo ocho comprobaciones nuevas de gestión y permisos. Pasaron typecheck, lint, build de producción y formato; la suite PWA pasó 12 verificaciones. Los resultados están en `sqlite-planning-views-results.json`, `postgres-test-results.json` y `pwa-test-results.json`. Una ejecución PostgreSQL intermedia quedó detenida en Focus mientras se regeneraba el build local; se interrumpió y se repitió completa con el build fijo, con resultado satisfactorio. Se conserva su registro en `planning-views-postgres-interrupted.log`.

Se incorporaron páginas de gestión accesibles desde las tarjetas de Proyectos y las secciones de cada proyecto. La suite ejercita tarjetas, lista, tablero y cronología sobre los mismos datos, persistencia de la vista por contexto, búsqueda y filtros. Verifica ciclos actuales de un día, próximos, finalizados, sin fechas y con fecha parcial; los periodos no completan automáticamente sus pendientes y la cronología conserva los grupos sin programar.

El detalle se prueba con creación, edición y eliminación, enlace directo y recarga, alta de pendientes con agrupación preseleccionada, incorporación de existentes, cambio de estado personalizado y retirada sin borrar el pendiente ni su otra agrupación. Una edición real concurrente provoca 409: el mensaje permanece visible, se recarga la versión y el siguiente intento funciona. Un conjunto de 51 pendientes verifica ambas páginas; durante el cambio de página no se presentan filas anteriores bajo el nuevo contador. El tablero indica que los recuentos corresponden a la página actual. Las rutas directas exigen permiso Proyectos y los usuarios sin Pendientes conservan acceso al resumen, sin acciones ni detalle de tareas.

Las cuatro vistas y el detalle se recorren en 1440×900, 390×844, 320×740 y 844×390, con temas claro/oscuro y comprobación de desbordamiento horizontal. Las capturas incluyen `planning-views-cycles-Tablero-1440-dark.png`, `planning-views-cycles-Cronología-1440-dark.png`, `planning-views-modules-Tarjetas-390-light.png` y `planning-detail-390-dark.png` en `artifacts/`. Validación en Chromium local; no en dispositivos físicos. No se modificó el esquema de datos ni se desplegó al servidor de producción en esta iteración.

### Barra superior, módulos, ciclos y estimaciones (6 de octubre)

La suite completa pasó 104 verificaciones en SQLite y 104 en PostgreSQL 18.4. Se repitieron build Debug/Release, comprobación del modelo EF, build de producción del cliente (con typecheck), lint y formato de los archivos modificados. La suite de actualizaciones PWA pasó sus 12 verificaciones en esta iteración. Las comprobaciones anteriores de Focus, notas, permisos, evidencias, filtros, paginación y edición simultánea siguen dentro de la suite completa.

Diez grupos nuevos verifican CRUD de módulos/ciclos opcionales, fechas nulas o de un día, ciclos paralelos, rechazo de fechas/nombres inválidos y duplicados, avance del proyecto y agrupaciones con estados resueltos, todos los responsables y tareas sin agrupar. Se contrastan totales por escala numérica y recuentos XS–XL, sin mezclar tiempo y puntos. Se prueban los seis tipos de estimación, valores opcionales/cero, escalas inválidas y conservación de estimaciones existentes al cambiar la sugerida del proyecto o guardar desde un cliente anterior.

Las asignaciones por lote incluyen versiones y se rechazan completas ante una versión antigua o una referencia de otro proyecto/Space. La eliminación de una agrupación conserva los pendientes, su otra agrupación y estimación, con nueva versión de edición. La eliminación de un proyecto limpia sus agrupaciones; los permisos de página bloquean operaciones no autorizadas. El diálogo real selecciona entre páginas con más de 50 pendientes, conserva elecciones, evita usar filas anteriores mientras carga y se compara con la API. «Ver pendientes» aplica el mismo conjunto a lista/tablero, y crear desde ese contexto toma su agrupación.

La interfaz se verifica en 1440, 390, 320 y 844 px, en claro/oscuro, con una sola instancia del selector en la barra superior. El botón del perfil mide exactamente 44×44 px y conserva radio 50%; las opciones nativas tienen colores de superficie/texto del tema. Se corrigió la asociación de etiquetas con inputs envueltos en iconos y se prueban todos los controles de estimación mediante guardado real. Las capturas revisadas incluyen `titlebar-1440-light.png`, `titlebar-320-dark.png`, `planning-desktop-dark.png`, `planning-cycle-mobile.png` y `planning-picker-mobile.png`. La lista del diálogo tiene desplazamiento interno y acciones accesibles. Pruebas en Chromium local, sin dispositivos físicos.

La migración PostgreSQL con datos previos conserva IDs, comentarios y una estimación de 90 minutos como `time:90`; los módulos/ciclos empiezan vacíos. La prueba SQLite recrea el esquema de tareas anterior sin las nuevas columnas/tablas, conserva contenido y estimación, reinicia la API y crea/asigna módulos/ciclos correctamente. Los archivos nuevos incluyen restricciones de pertenencia al proyecto; en archivos SQLite extendidos se validan las referencias desde la API. El despliegue de producción no se ejecutó aquí.

Una ejecución PostgreSQL inicial se interrumpió porque el proceso local `vite preview` se cerró con código 3221226505 y produjo reconexiones. Los registros se conservaron en `planning-postgres-preview-failure.log` y `planning-preview-failure.log`; la repetición completa terminó con 104 aprobadas, incluida la prueba de ausencia de consultas periódicas durante 31,5 segundos.

### Edición de Spaces, incorporación directa y login con usuario (6 de octubre)

Build Debug/Release de la API sin errores ni advertencias; modelo y migración PostgreSQL coinciden. El cliente pasó build de producción (incluye typecheck), lint y comprobación de formato de los archivos modificados. La suite SQLite completa pasó 94 verificaciones y las 12 de actualización PWA se repitieron con el nuevo campo de login. La revisión visual incluyó los diálogos de edición y selección de usuarios en 1440×900 claro, 320×600 claro y 390×844 oscuro. Capturas: `space-edit-desktop.png`, `space-member-desktop.png`, `space-member-mobile.png` y `space-edit-mobile-dark.png` en `artifacts/`. Sin validación en teléfonos físicos ni despliegue de producción.

La suite completa también pasó 94 verificaciones sobre PostgreSQL 18.4 después de validar la migración con datos anteriores. El cluster temporal utiliza un puerto disponible del sistema para evitar los rangos reservados de Windows. Nueve grupos nuevos comprueban login por correo y usuario con mayúsculas/espacios, compatibilidad con el payload anterior, credenciales inválidas con error genérico, cuentas inactivas, validación y unicidad de usuarios con nombres visibles repetidos y prefijos de correo en colisión. El admin edita el usuario en el formulario real; el identificador anterior deja de autenticar y el nuevo funciona sin cambiar el nombre visible. Los clientes anteriores que omiten usuario conservan creación y actualización.

Spaces verifica edición propia personal, edición del workspace por propietario o Admin integrante, rechazo para miembros normales/admin sin acceso, nombres vacíos/largos, cancelación sin escritura, persistencia tras recargar y actualización de navegación. La incorporación directa exige Admin y una cuenta activa existente, excluye integrantes del selector y es idempotente. Un segundo navegador conectado recibe el workspace por SSE y puede abrirlo sin código. Un Admin integrante puede retirar miembros de un workspace de otro propietario; no puede retirar al propietario ni incorporar miembros a espacios personales.

La prueba de actualización SQLite crea contenido, simula la tabla de cuentas anterior sin columna de usuario y reinicia la API. Comprueba dos cuentas con mismo nombre visible y prefijo de correo, conserva IDs, hashes de contraseña, nota y espacio personal, verifica ambos tipos de login y el índice único. La prueba de migración PostgreSQL agrega datos anteriores con nombres/prefijos duplicados y cortos antes de aplicar `Usernames`, y comprueba identificadores únicos sin alterar los hashes ni los datos existentes.

### Filtros en diálogo y tableros en la bandeja (25 de septiembre)

La suite SQLite completa pasó 85 verificaciones después del build de producción; typecheck y lint también finalizaron correctamente. PostgreSQL y la suite dedicada de actualización PWA no se repitieron en esta iteración de cliente; sus resultados anteriores permanecen identificados en la tabla.

Tres grupos nuevos prueban la barra sin combos, apertura del diálogo y aplicación conjunta de proyecto, carpeta, estado, responsable, etiqueta, prioridad y orden. Se verifica que aplicar vuelve a la página 1, cancelar conserva la selección anterior y restablecer recupera los valores iniciales sin borrar la búsqueda. Cambiar de proyecto limpia carpeta/estado; crear un pendiente toma el proyecto y carpeta filtrados. Las pruebas existentes de asignación ahora usan el diálogo y siguen validando el valor inicial para Admin y User, su restauración al navegar/recargar y el aislamiento entre responsables.

El tablero de la bandeja se compara contra la lista con más de 50 pendientes de dos proyectos: mismos elementos, sin duplicados entre páginas, sin incluir otro responsable ni resueltos por defecto. Cada proyecto mantiene sus propias columnas, incluido un estado personalizado. El filtro de proyecto conserva la ruta de bandeja y combinar filtros devuelve el pendiente esperado. Incluir resueltos se contrasta con la respuesta real de la API.

Se verifican 1440×900, 390×844, 320×600 y 844×390 en claro/oscuro: la página no desborda horizontalmente y los botones del diálogo son alcanzables. Se revisaron `artifacts/inbox-board-1440-light.png`, `inbox-board-320-light.png`, `inbox-filters-1440-light.png` e `inbox-filters-390-dark.png`. En escritorio las columnas permiten desplazamiento horizontal dentro del tablero; en móvil se apilan. Capturas y pruebas en Chromium local, sin dispositivos físicos.

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

La suite actual de 85 verificaciones ejecuta la API real, el cliente compilado de producción y Chromium sobre SQLite temporal. La ejecución previa de 79 verificaciones también pasó sobre PostgreSQL 18.4 local; la imagen Docker prevista continúa siendo PostgreSQL 17 y requiere su validación en infraestructura. Incluyen:

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

El build Vite conserva advertencias de tamaño: notas pesa aproximadamente 572 KB sin comprimir (182 KB gzip) y el mayor módulo de Mermaid 662 KB (143 KB gzip), ambos cargados bajo demanda; el módulo principal ocupa aproximadamente 361 KB. El precache PWA contiene aproximadamente 4,8 MB de recursos sin comprimir, incluidos diagramas y fuentes locales para su disponibilidad sin conexión. La actualización entre versiones con estos recursos pasó la suite PWA. La herramienta EF instalada localmente es 10.0.8 y avisa que el runtime es 10.0.10; la generación y comprobación del modelo finalizaron correctamente.

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
