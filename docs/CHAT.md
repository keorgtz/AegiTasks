# Chat entre usuarios

El chat es de la cuenta, no del Space seleccionado. Puedes conversar con cualquier cuenta activa que tenga permiso de Chat aunque no comparta tus workspaces. Cambiar de Space conserva la conversación abierta, los mensajes y el borrador. Chat está en la navegación lateral, la barra superior de escritorio y la navegación inferior móvil.

En horizontal, desde 768 px, la lista y la conversación ocupan la ventana junto a una barra lateral de iconos, que puedes expandir. El selector de Space está en **Cambiar espacio**, dentro de esa barra; también permanecen accesibles los ajustes, proyectos, notificaciones y tema. En ventanas bajas, las acciones secundarias de cuenta, tema y sesión se reúnen en **Más opciones** para dejar espacio a la navegación. Entrar al chat reduce temporalmente la barra, sin cambiar tu preferencia para otras páginas. Fuera del chat, la preferencia de contraer/expandir se recuerda por cuenta en ese navegador.

En móvil, abrir una conversación oculta la titlebar y la navegación global: solo quedan encabezado, mensajes y compositor. **Volver a conversaciones** restaura la lista y la navegación de la app. El encabezado y el compositor respetan las zonas seguras del teléfono; el compositor sigue el viewport visible al abrirse el teclado. El comportamiento real del teclado depende del navegador y se debe verificar también en dispositivos físicos.

## Conversaciones y grupos

**Nuevo chat** permite buscar por nombre o usuario y comenzar una conversación privada, o elegir **Grupo**, un nombre y sus integrantes. Existe una sola conversación privada por pareja de usuarios; abrirla desde cualquiera de las dos cuentas recupera el mismo historial. Los grupos admiten de 2 a 50 integrantes, incluido quien los crea.

Solo los participantes pueden consultar mensajes y descargar archivos. Ser Admin del sistema no permite consultar conversaciones ajenas. Quien crea un grupo puede cambiar su nombre y agregar/quitar integrantes desde **Integrantes del grupo**; los demás pueden consultar esa lista. Una edición desactualizada se rechaza y conserva el formulario. Los nuevos integrantes ven el historial del grupo; los retirados pierden inmediatamente el acceso a mensajes y archivos.

El permiso **Chat entre usuarios** se habilita por defecto para roles existentes y nuevos, y Admin puede revocarlo desde Usuarios y roles. El directorio de chat expone nombre y usuario de las cuentas activas con acceso, sin sus correos ni datos administrativos.

## Mensajes y archivos

En computadora, **Enter** envía y **Shift + Enter** agrega un renglón; Ctrl/⌘ + Enter también envía. En móvil, Enter conserva el salto de línea y se envía con el botón. La composición IME no dispara envíos. El texto admite hasta 4000 caracteres. La lista se actualiza por eventos privados del servidor y **Mensajes anteriores** carga bloques de 50.

El campo comienza con una línea y la misma altura que Enviar; crece al escribir hasta un máximo adaptado a la pantalla y después permite desplazar el texto. Enviar se mantiene accesible al pie del campo. **+ → Agregar al mensaje** reúne **Adjuntar archivos** y **Compartir pendiente**, sin ocupar una segunda fila permanente. Abrir o cerrar ese diálogo conserva el borrador.

### Emojis y GIFs

**Emojis y GIFs** abre un selector con dos secciones. En escritorio tiene un botón de sonrisa junto al mensaje; en teléfonos de hasta 480 px se encuentra dentro de **+ → Emojis y GIFs**, conservando el espacio para escribir. Funciona en conversaciones individuales y grupos.

- **Emojis:** [Emojibase 17](https://emojibase.dev/docs/datasets/) aporta 3979 registros incluyendo variantes, con nombres y términos CLDR en español, banderas, profesiones y secuencias combinadas. Las categorías y **Variantes de piel** permiten elegir también tonos mixtos. El catálogo se incluye en el build, con carga de opciones en bloques de 240 y licencia MIT en `/licenses/emojibase.txt`. Inserta en el cursor o reemplaza la selección; los recientes y tono se conservan por cuenta. La apariencia y soporte de los caracteres más nuevos dependen de las fuentes del sistema. El límite de 4000 caracteres se respeta sin recortar el borrador.
- **GIFs:** **Adjuntar GIF** selecciona archivos locales de hasta 10 MB. Comprueba tamaño y firma antes de agregarlos al borrador; Enviar sigue siendo una acción explícita. **GIFs de tus chats** ofrece búsqueda por nombre y páginas de 24 archivos provenientes únicamente de conversaciones en las que todavía participas. Elegir uno descarga el archivo autenticado y lo adjunta como una nueva copia. La descarga y el envío vuelven a comprobar permisos; perder acceso a un grupo también lo retira de la galería.
- **Catálogo online:** **Buscar en KLIPY** es la opción inicial de GIFs. Busca por palabras, muestra tendencias sin consulta y ofrece páginas de 12 resultados separados de **GIFs de tus chats**. Seleccionar agrega el enlace original al borrador. Se muestra animado al enviar, con atribución al proveedor; no se descarga ni se guarda una copia del contenido externo en el servidor. Los enlaces siguen siendo visibles para clientes antiguos. Un error, límite de consultas o falta de configuración se explica en el selector.
- **Teclado y portapapeles:** se reciben archivos, HTML con imágenes y enlaces directos de los CDN de KLIPY, Tenor y GIPHY mediante paste, beforeinput nativo o drop. También se detecta un enlace GIF insertado como texto. Los archivos GIF sin MIME se reconocen por nombre y el servidor verifica su firma. No se ejecuta HTML ni se consultan URLs arbitrarias desde el servidor. Solo se muestran automáticamente enlaces HTTPS de los hosts admitidos. Android [Commit Content](https://developer.android.com/develop/ui/views/touch-and-input/image-keyboard) es una API nativa: si el teclado/navegador no entrega ese contenido a la página, se utiliza el catálogo integrado o se adjunta el archivo. No se garantiza compatibilidad con cada teclado móvil ni se convierten enlaces a páginas web en enlaces de medios.

Los GIFs enviados conservan sus bytes y animación. **Pausar GIF** muestra un fotograma estático y **Reproducir GIF** vuelve a mostrar la animación. Con movimiento reducido, los mensajes comienzan estáticos y la galería mantiene **Animar** desactivado; se puede reproducir explícitamente. El poster utiliza el primer fotograma definido por el [estándar de canvas](https://html.spec.whatwg.org/multipage/canvas.html#canvasimagesource). Si falla la preview, el archivo conserva su opción de descarga. Mensajes sin texto que contienen GIFs se identifican como **GIF adjunto** en la lista y en las vistas previas de notificaciones.

La galería privada conserva el almacenamiento y autorización actuales. El catálogo online requiere configuración y los medios externos requieren red; esos GIFs no forman parte del cache offline. Emojis, archivos y sus notificaciones conservan los controles de participación, permisos y silencios. No se necesita una migración nueva.

### Activar el catálogo de KLIPY

Crear una clave para la **GIF API sin anuncios** en [KLIPY Partner Panel](https://partner.klipy.com), registrar la plataforma web y completar los pasos de producción del proveedor. Agregar `KLIPY_API_KEY=tu-clave` al `.env` del servidor y volver a desplegar. Compose lo pasa a `GifCatalog__KlipyKey`; en desarrollo se puede utilizar directamente ese nombre de variable o `GifCatalog:KlipyKey` en configuración local. Es una clave de integración pública de navegador, visible para los usuarios autorizados del chat; nunca se utiliza la clave administrativa de la cuenta KLIPY.

Según la [documentación de KLIPY](https://docs.klipy.com/), una clave de pruebas tiene 100 consultas por hora y el acceso de producción se solicita en su panel. Sus requisitos actuales exigen consultas y medios directamente desde el cliente, URLs originales, separación de fuentes y atribución. La integración utiliza **Search KLIPY** y **Powered by KLIPY**, no usa un proxy/cache de medios y no combina resultados online con adjuntos privados. El navegador debe alcanzar `api.klipy.com` y `static*.klipy.com` por HTTPS. Sin clave se puede seguir enviando archivos o enlaces GIF del teclado, pero la búsqueda online no queda activada.

Cada mensaje admite hasta cinco archivos y 25 MB en total:

| Contenido               | Formatos                                                           | Límite por archivo |
| ----------------------- | ------------------------------------------------------------------ | ------------------ |
| Imágenes con preview    | PNG, JPG, WebP, GIF                                                | 10 MB              |
| Documentos descargables | PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP, ZIP, TXT, MD, CSV, LOG, JSON | 10 MB              |
| Videos con controles    | MP4 y WebM                                                         | 25 MB              |

Las imágenes se pueden abrir y descargar; los videos ofrecen reproducción y peticiones de rango. La reproducción depende del soporte del formato/códec en el navegador. Los documentos se descargan como archivos y no ejecutan HTML. Se comprueban firmas de imágenes/PDF/video/archivos comprimidos y formatos de texto; la extensión o MIME declarado por el navegador no basta para admitir una imagen o video.

Los archivos se guardan fuera del sitio público. Cada lectura y petición de rango exige sesión, permiso de chat y participación actual. Los mensajes y archivos no se incluyen en el cache offline de la PWA. Un envío rechazado no guarda mensajes ni deja los archivos que había escrito. Cada envío lleva un identificador para evitar duplicados al reintentar después de una respuesta perdida; no se reenvían automáticamente mutaciones fallidas.

Los borradores de texto y el pendiente seleccionado se conservan en el almacenamiento de sesión del navegador, separados por cuenta y conversación. Los archivos seleccionados permanecen en memoria: cambiar de Space o conversación los conserva, pero recargar la app requiere seleccionarlos otra vez. La app avisa antes de cerrar con contenido pendiente y pospone la actualización PWA mientras hay envíos o borradores disponibles sin enviar.

## Compartir pendientes

**Compartir pendiente** abre un selector de workspace y buscador paginado. Solo muestra pendientes de un workspace al que todos los integrantes actuales tienen acceso y permiso para consultar pendientes. El servidor vuelve a comprobarlo al enviar. Esto se aplica también a los grupos, no solo a la pareja de un chat privado.

El acceso directo abre el pendiente en su Space y utiliza los permisos normales del detalle. No copia su descripción, evidencias ni contenido privado al mensaje. Al consultar mensajes se verifica nuevamente el acceso del lector: si se eliminó el pendiente o el usuario perdió acceso, se presenta como no disponible, sin revelar su título. La conversación y el resto de sus mensajes siguen funcionando después de perder acceso al workspace.

## Notificaciones y silencios

Los mensajes de otra persona generan avisos en tiempo real dentro de la app, tanto en chats privados como en grupos. El chat abierto y visible se marca como leído sin mostrar otro banner. Los mensajes anteriores al abrir la app se reflejan en los contadores; los banners avisan sobre mensajes nuevos. Abrir un banner lleva directamente al chat. Cada conversación mantiene su resumen con conteo y vistas previas de autor/texto; los mensajes propios no avisan al autor.

Para recibir avisos fuera de la app, activar el dispositivo desde **Ajustes → Notificaciones**, con los mismos permisos y claves VAPID de los pendientes. El aviso del sistema tiene el nombre de la persona o grupo, el conteo y hasta las últimas cinco vistas previas. Nuevos mensajes reemplazan el aviso de esa conversación; las etiquetas son independientes por cuenta/chat. Reintentos o pushes atrasados no reemplazan un resumen más reciente ni repiten la alerta sonora. El clic abre `#chat/{id}` con los controles normales de sesión y participación.

La campana de cada chat abre **Notificaciones del chat**. Cualquier integrante configura sus propias preferencias en todos sus dispositivos; ni Admin ni el propietario cambian las de otras personas:

- **Notificaciones activadas:** comportamiento predeterminado.
- **Silenciar hasta una fecha:** accesos rápidos para 1 hora, 8 horas, 1 día o 7 días, y fecha/hora personalizada. Al vencer vuelve a notificar automáticamente.
- **Silencio por horarios y días:** hasta 14 franjas semanales, con días y horas o **Todo el día**. Los días indican cuándo empieza la franja; 22:00–08:00 cruza al día siguiente. La zona horaria se guarda y se aplica en el servidor, incluidos sus cambios de horario de verano. Desde otro dispositivo se puede elegir usar su zona local.
- **Silenciar siempre:** evita avisos hasta volver a activarlos.

Silenciar conserva los mensajes y contadores sin leer, cancela avisos pendientes y evita crear avisos diferidos para reproducir mensajes silenciados después. Leer el chat elimina sus avisos y cierra el resumen del sistema en ese dispositivo. Las preferencias detectan cambios simultáneos sin sobrescribir otro formulario. Al retirar a un integrante se eliminan sus preferencias, avisos y cola de esa conversación; si vuelve a entrar comienza con preferencias predeterminadas.

El logo oficial se conserva en los iconos de instalación de la PWA y se envía como `icon` en avisos de pendientes y chat. Al omitirlo, el teléfono mostrado por el usuario generó un círculo con la letra T; por eso se restauró el logo. No se envía `image`. Se conserva el badge pequeño **done_all** de [Google Material Icons](https://github.com/google/material-design-icons), servido localmente como PNG monocromático de 96 px, con su licencia Apache-2.0. La API permite `badge`, `tag` y `renotify`; el navegador/sistema decide la presentación del identificador de la app, el espacio de las vistas previas y si muestra ese badge, especialmente en iOS. Es una notificación web agrupada, sin acceso al diseño nativo de WhatsApp/Telegram. [Referencia de showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

## Despliegue y persistencia

El despliegue Docker existente aplica automáticamente la migración **Chat** en PostgreSQL. Agrega tablas independientes de conversaciones, integrantes, mensajes y archivos; no modifica ni elimina pendientes, notas o historial de notificaciones. SQLite local utiliza una actualización idempotente. Los archivos están en `uploads/chat` bajo el `StoragePath` existente; el volumen `aegitasks-storage` y los respaldos recursivos ya los incluyen. El Nginx del cliente permite solicitudes de 26 MB para cubrir los 25 MB más el formulario; evidencias de pendientes conservan su límite de 10 MB.

El chat usa la instancia API y base de datos actuales, sin Redis ni servicios adicionales. Las conexiones SSE de chat son independientes de los Spaces y envían únicamente temas de invalidación al usuario, sin textos, títulos o archivos. Escalar a varias instancias requiere un bus de eventos compartido, igual que las actualizaciones actuales de pendientes.

La migración **ChatNotifications** agrega preferencias personales, avisos y cola push de chat, preservando conversaciones, integrantes y mensajes existentes. Los mensajes anteriores no generan avisos retroactivos. SQLite agrega las mismas tablas de forma idempotente. El mensaje, archivos y avisos se guardan en una sola transacción. La cola persistente agrupa envíos por conversación/dispositivo, reintenta fallos y vuelve a comprobar sesión, permisos, membresía, lectura y silencio antes de enviar. Tras el commit despierta al procesador y solicita prioridad alta al proveedor. El payload cifrado lleva identificadores y una credencial protegida limitada al aviso/dispositivo; el worker recupera la vista previa sin cookies ni ventanas abiertas, verificando nuevamente el acceso en el servidor. Ante un fallo temporal de red muestra solo un aviso genérico sin contenido privado. No guarda vistas previas ni credenciales en el cache offline. Conserva el procesador único del Compose actual. [Entrega en segundo plano y límites](NOTIFICATIONS.md).

## Presencia

La lista, el encabezado de cada conversación y los integrantes de grupos muestran **Conectado**, **Ausente** o **Desconectado**. Una cuenta está conectada mientras alguna pestaña o dispositivo tiene AegiTasks visible, enfocado y con actividad reciente. Pasa a ausente al perder el foco, ocultar la app o cumplir cinco minutos sin interacción. Cada dispositivo renueva una conexión identificada por el servidor; un dispositivo suspendido o sin red deja de contar después de 90 segundos. Cerrar la última conexión lo desconecta inmediatamente cuando el servidor detecta el cierre. El estado no disponible se muestra explícitamente cuando el cliente pierde conexión.

La presencia se comparte únicamente con participantes de conversaciones actuales, requiere permiso de Chat y no depende de Spaces. Cambia mediante SSE; los latidos de actividad no recargan mensajes ni generan avisos push. No guarda historial de actividad ni requiere migraciones. Usa memoria de la única API del Compose; varias réplicas requerirían presencia y eventos compartidos. La detección de ocultamiento sigue la [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

`AEGITASKS_TEST_ONLY=password-presence node client/scripts/e2e.mjs` verifica contraseñas flexibles, medidor, privacidad y presencia con conexiones SSE reales, varias pestañas y cambios de cuenta. Las pruebas .NET incluyen vencimiento de conexiones con reloj controlado.

## Validación

- `AEGITASKS_TEST_ONLY=chat node client/scripts/e2e.mjs`: privacidad, permisos, grupos, concurrencia, reintentos, historial, archivos, referencias, avisos agrupados y preferencias personales con controles reales del navegador.
- `node client/scripts/push-worker-tests.mjs`: autorización, badge, agrupación, reintentos, orden, lectura y enlaces directos.
- La suite completa incluye las pruebas de chat y la regresión de todas las funciones anteriores.
- `node client/scripts/postgres-tests.mjs`: migración desde datos anteriores, instalación nueva y suite sobre PostgreSQL aislado.
- `dotnet run --project server/AegiTasks.NotificationTests`: incluye comprobación de la actualización SQLite de chat sobre una base existente.

Las pruebas de navegador usan Chromium y viewports emulados, con un WebM realmente grabado y reproducido. No sustituyen la instalación y reproducción en teléfonos físicos, ni la comprobación del proxy/volúmenes en el servidor real.

`AEGITASKS_TEST_ONLY=layout node client/scripts/e2e.mjs` verifica barra lateral, titlebar compacta, navegación inferior al borde, chat completo, autoexpansión del texto, teclado y adjuntos con controles reales. Incluye viewports de 320–1920 px en ambos temas; las zonas seguras y el cambio de viewport del teclado se simulan explícitamente. La composición se basa en [navegación adaptativa de Material](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) y en la [distinción entre viewport de layout y visual de Chrome](https://developer.chrome.com/blog/viewport-resize-behavior).
