# Chat entre usuarios

El chat es de la cuenta, no del Space seleccionado. Puedes conversar con cualquier cuenta activa que tenga permiso de Chat aunque no comparta tus workspaces. Cambiar de Space conserva la conversación abierta, los mensajes y el borrador. En computadora se muestran la lista y la conversación juntas; en móvil se navega entre ambas con el botón de volver. Chat está en la navegación lateral, la barra superior de escritorio y la navegación inferior móvil.

## Conversaciones y grupos

**Nuevo chat** permite buscar por nombre o usuario y comenzar una conversación privada, o elegir **Grupo**, un nombre y sus integrantes. Existe una sola conversación privada por pareja de usuarios; abrirla desde cualquiera de las dos cuentas recupera el mismo historial. Los grupos admiten de 2 a 50 integrantes, incluido quien los crea.

Solo los participantes pueden consultar mensajes y descargar archivos. Ser Admin del sistema no permite consultar conversaciones ajenas. Quien crea un grupo puede cambiar su nombre y agregar/quitar integrantes desde **Integrantes del grupo**; los demás pueden consultar esa lista. Una edición desactualizada se rechaza y conserva el formulario. Los nuevos integrantes ven el historial del grupo; los retirados pierden inmediatamente el acceso a mensajes y archivos.

El permiso **Chat entre usuarios** se habilita por defecto para roles existentes y nuevos, y Admin puede revocarlo desde Usuarios y roles. El directorio de chat expone nombre y usuario de las cuentas activas con acceso, sin sus correos ni datos administrativos.

## Mensajes y archivos

Escribe y pulsa **Enviar**, o Ctrl/⌘ + Enter. El texto admite hasta 4000 caracteres y conserva saltos de línea. La lista se actualiza por eventos privados del servidor, sin consultar cada 30 segundos; el contador de mensajes sin leer se sincroniza entre sesiones. **Mensajes anteriores** carga bloques de 50 sin perder mensajes cuando llegan otros nuevos.

Cada mensaje admite hasta cinco archivos y 25 MB en total:

| Contenido | Formatos | Límite por archivo |
| --- | --- | --- |
| Imágenes con preview | PNG, JPG, WebP, GIF | 10 MB |
| Documentos descargables | PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP, ZIP, TXT, MD, CSV, LOG, JSON | 10 MB |
| Videos con controles | MP4 y WebM | 25 MB |

Las imágenes se pueden abrir y descargar; los videos ofrecen reproducción y peticiones de rango. La reproducción depende del soporte del formato/códec en el navegador. Los documentos se descargan como archivos y no ejecutan HTML. Se comprueban firmas de imágenes/PDF/video/archivos comprimidos y formatos de texto; la extensión o MIME declarado por el navegador no basta para admitir una imagen o video.

Los archivos se guardan fuera del sitio público. Cada lectura y petición de rango exige sesión, permiso de chat y participación actual. Los mensajes y archivos no se incluyen en el cache offline de la PWA. Un envío rechazado no guarda mensajes ni deja los archivos que había escrito. Cada envío lleva un identificador para evitar duplicados al reintentar después de una respuesta perdida; no se reenvían automáticamente mutaciones fallidas.

Los borradores de texto y el pendiente seleccionado se conservan en el almacenamiento de sesión del navegador, separados por cuenta y conversación. Los archivos seleccionados permanecen en memoria: cambiar de Space o conversación los conserva, pero recargar la app requiere seleccionarlos otra vez. La app avisa antes de cerrar con contenido pendiente y pospone la actualización PWA mientras hay envíos o borradores disponibles sin enviar.

## Compartir pendientes

**Compartir pendiente** abre un selector de workspace y buscador paginado. Solo muestra pendientes de un workspace al que todos los integrantes actuales tienen acceso y permiso para consultar pendientes. El servidor vuelve a comprobarlo al enviar. Esto se aplica también a los grupos, no solo a la pareja de un chat privado.

El acceso directo abre el pendiente en su Space y utiliza los permisos normales del detalle. No copia su descripción, evidencias ni contenido privado al mensaje. Al consultar mensajes se verifica nuevamente el acceso del lector: si se eliminó el pendiente o el usuario perdió acceso, se presenta como no disponible, sin revelar su título. La conversación y el resto de sus mensajes siguen funcionando después de perder acceso al workspace.

## Despliegue y persistencia

El despliegue Docker existente aplica automáticamente la migración **Chat** en PostgreSQL. Agrega tablas independientes de conversaciones, integrantes, mensajes y archivos; no modifica ni elimina pendientes, notas o historial de notificaciones. SQLite local utiliza una actualización idempotente. Los archivos están en `uploads/chat` bajo el `StoragePath` existente; el volumen `aegitasks-storage` y los respaldos recursivos ya los incluyen. El Nginx del cliente permite solicitudes de 26 MB para cubrir los 25 MB más el formulario; evidencias de pendientes conservan su límite de 10 MB.

El chat usa la instancia API y base de datos actuales, sin Redis ni servicios adicionales. Las conexiones SSE de chat son independientes de los Spaces y envían únicamente temas de invalidación al usuario, sin textos, títulos o archivos. Escalar a varias instancias requiere un bus de eventos compartido, igual que las actualizaciones actuales de pendientes. Los contadores de chat son avisos dentro de la app; las notificaciones push del dispositivo continúan correspondiendo a los eventos de pendientes.

## Validación

- `AEGITASKS_TEST_ONLY=chat node client/scripts/e2e.mjs`: privacidad, permisos, grupos, concurrencia, reintentos, historial, archivos, referencias y controles reales del navegador.
- La suite completa incluye las pruebas de chat y la regresión de todas las funciones anteriores.
- `node client/scripts/postgres-tests.mjs`: migración desde datos anteriores, instalación nueva y suite sobre PostgreSQL aislado.
- `dotnet run --project server/AegiTasks.NotificationTests`: incluye comprobación de la actualización SQLite de chat sobre una base existente.

Las pruebas de navegador usan Chromium y viewports emulados, con un WebM realmente grabado y reproducido. No sustituyen la instalación y reproducción en teléfonos físicos, ni la comprobación del proxy/volúmenes en el servidor real.
