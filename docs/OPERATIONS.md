# Operación de AegiTasks

## Datos persistentes

- `aegitasks-pgdata`: PostgreSQL, usuarios, roles, permisos, espacios, membresías, notas, sesiones Focus, proyectos, pendientes e historial.
- `aegitasks-storage`: archivos de evidencia y claves Data Protection para las sesiones.
- `.env`: configuración y claves de bootstrap. Guarda una copia privada fuera de Git.

`docker compose down` conserva los volúmenes. **No uses `down -v` para actualizar:** elimina los volúmenes del stack.

## Respaldos consistentes

Desde la carpeta del proyecto, en Ubuntu. Detén escrituras durante la copia y respalda BD y archivos juntos:

```bash
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose stop web api
docker compose exec -T db pg_dump -U aegitasks -d aegitasks -Fc > "backups/$stamp-db.dump"
docker run --rm -v aegitasks-storage:/source:ro -v "$PWD/backups:/backup" alpine \
  tar czf "/backup/$stamp-storage.tgz" -C /source .
docker compose start api web
```

Revisa los códigos de salida de los respaldos y conserva copias fuera del servidor. Los archivos contienen datos privados. Si un comando falla, vuelve a arrancar `api web` y corrige el respaldo; no lo consideres válido solo porque exista un archivo.

## Restauración

Ensaya primero en un servidor aislado. Conserva un respaldo del estado actual. Los dos archivos deben pertenecer al mismo respaldo.

1. Prepara el mismo `.env` y stack, levanta solamente `db` y espera a que esté saludable.
2. Mantén `web` y `api` detenidos.
3. Restaura la BD (esto reemplaza tablas existentes):

   ```bash
   docker compose exec -T db pg_restore -U aegitasks -d aegitasks --clean --if-exists --no-owner < backups/FECHA-db.dump
   ```

4. Restaura `FECHA-storage.tgz` en un volumen `aegitasks-storage` nuevo o previamente preparado. Evita mezclar archivos de respaldos distintos. La imagen de API ejecuta con el usuario `app`; conserva propietario y permisos del archivo tar.
5. Ejecuta `docker compose up -d`, revisa `/api/health`, ingresa y descarga una evidencia de prueba. Conserva las claves Data Protection del respaldo si necesitas conservar sesiones; el servidor igualmente verifica si la cuenta sigue activa.

## Diagnóstico

### Actualizaciones automáticas de la PWA

El build genera un UUID compartido por el cliente, `version.json` y `sw-version.js`. La app registra `/sw.js` desde el arranque, incluso antes del login, con `updateViaCache: none`. El nuevo worker descarga su precaché, se activa y toma control; cada pestaña comprueba su versión por `MessageChannel` antes de recargar. Una descarga fallida conserva el worker anterior y se reintenta. La app comprueba despliegues cada minuto visible y al volver al primer plano o recuperar conexión; los eventos consecutivos se limitan a una comprobación cada 15 segundos. Estas comprobaciones no consultan listas de pendientes ni sustituyen SSE.

La recarga espera si hay diálogos abiertos, formularios pendientes, escrituras a la API, preferencias/objetivos de Focus sin guardar, pantalla inmersiva o una fuente de audio de Focus conectada o solicitando permiso. Al cerrar/guardar esos cambios, desconectar el audio y salir de pantalla inmersiva, aplica la actualización pendiente. Los intervalos Focus guardados siguen calculándose desde la fecha de finalización del servidor. Cookies, preferencias y borradores existentes permanecen intactos; no se guardan notas sensibles ni contraseñas en el navegador para efectuar la actualización.

`version.json` y `sw-version.js` quedan fuera de la precaché. Nginx sirve HTML, metadatos de versión y worker con `no-store` también para Cloudflare. Conserva esas reglas en NPM y evita reglas de Cloudflare que las sobrescriban. Solo los recursos con hash bajo `/assets/` tienen caché inmutable. Para comprobar el despliegue:

```bash
curl -I https://task.tudominio.com/version.json
curl -I https://task.tudominio.com/sw.js
curl -I https://task.tudominio.com/sw-version.js
curl https://task.tudominio.com/version.json
```

Si se sirve una versión anterior, compara la respuesta pública con `docker compose exec web cat /usr/share/nginx/html/version.json`, revisa las reglas de caché y confirma que reconstruiste `web`. Un servidor/proxy que entrega archivos de versiones mezcladas limita las recargas automáticas a una por minuto. No borres almacenamiento de los usuarios como parte del despliegue.

La versión anterior no tenía este coordinador: una pestaña que siga ejecutándola puede necesitar una reapertura o recarga normal una vez instalado el nuevo worker. No requiere borrar caché. Las siguientes actualizaciones usan el mecanismo automático. No es posible ejecutar actualizaciones mientras el navegador está cerrado o el dispositivo está sin conexión.

Referencias de implementación: [Vite PWA, activación automática](https://vite-pwa-org.netlify.app/guide/auto-update) y [MDN, cambio de controlador](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/controllerchange_event). El registro se gestiona directamente para aplazar la recarga durante la edición.

### Comprobaciones del servidor

```bash
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
docker compose exec web wget -q -O- http://localhost/api/health
docker network inspect proxy
```

- **502 después de actualizar:** confirma que API está saludable. Nginx usa el resolver de Docker con DNS dinámico, y espera a la API al iniciar.
- **No mantiene la sesión:** accede mediante HTTPS; las cookies de producción son Secure. Mantén el volumen de claves.
- **No permite adjuntar:** configura `client_max_body_size 11m;` en NPM. Cada archivo permite hasta 10 MB; revisa espacio del volumen.
- **No instala PWA:** HTTPS válido, navegador compatible y acceso al manifest, service worker e iconos. En iOS usa Safari → Compartir → Agregar a inicio.
- **No cambia contraseña al editar `.env`:** el seed solo crea el primer administrador. Usa Usuarios y roles para restablecer cuentas existentes.
- **401 después de cambiar rol o contraseña:** las sesiones se invalidan intencionalmente. Ingresa de nuevo.
- **409 al guardar un pendiente:** otro usuario guardó primero. Copia lo que quieras conservar, cierra y vuelve a abrir el detalle; aplica los cambios sobre la versión actual.
- **Límite de login:** 30 intentos cada 5 minutos por IP visible para la API. Detrás de Nginx, ese límite puede compartirse entre usuarios; el sistema no confía en cabeceras IP enviadas por el cliente.

## Seguridad y límites

No hay registro público. Las contraseñas usan PasswordHasher; nunca se devuelve su hash a la interfaz. Las operaciones que cambian datos requieren una cabecera propia y no se habilita CORS. Las cookies son HttpOnly y SameSite Strict. Los adjuntos requieren autenticación para descargarse; el nombre físico es un identificador generado y la descarga fuerza un nombre seguro. Se verifica la firma de imágenes/PDF, pero no se incluye antivirus ni análisis del contenido de PDFs: adjunta evidencias del equipo, no archivos de fuentes desconocidas.

Los borradores nuevos se guardan en localStorage por usuario y espacio. Cerrar sesión los elimina; no se guardan contraseñas ni cookies de sesión en localStorage. La consulta de datos privados necesita servidor disponible. Las fechas límite son fechas sin hora; las métricas del servidor usan el día UTC. El borrado permanente de un pendiente o proyecto elimina sus comentarios y evidencias; archivar conserva el historial. Las notas sobreviven sin referencias al contenido eliminado.

La instalación prevista usa una sola API. Antes de escalar a varias réplicas, usa almacenamiento compartido para adjuntos y claves, coordinación de migraciones, un límite distribuido de autenticación y un bus compartido para avisos de cambios. Redis es una incorporación posible en ese escenario.

### Avisos de cambios

`/api/events?space=<id>` mantiene una conexión SSE autenticada por sesión y autorizada por membresía. Solo transmite temas a invalidar, sin títulos, notas ni datos de tareas. Los cambios personales de Focus se dirigen a su usuario; los cambios de contenido se limitan al espacio. La membresía y la sesión se revalidan antes de enviar eventos. Un cambio de permisos provoca una nueva lectura autorizada; una membresía revocada cierra el stream. Las reconexiones sincronizan el contenido visible para recuperar cambios ocurridos durante un corte.

El Nginx incluido desactiva `proxy_buffering`; la API envía `X-Accel-Buffering: no` y comentarios de mantenimiento cada 20 segundos. Estos comentarios mantienen la conexión y no refrescan datos. Conserva streaming sin caché ni buffering en Nginx Proxy Manager y Cloudflare Tunnel. Referencia del protocolo: [MDN, Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

La migración `ProjectLabels` añade una columna vacía para las etiquetas de proyectos existentes; conserva sus estados y pendientes. En desarrollo SQLite, el arranque añade esa columna solo si falta; producción usa las migraciones PostgreSQL.

## Espacios, notas y enfoque

Los permisos de página y la membresía se comprueban en el servidor. Las claves de sesión no conceden acceso al espacio Personal de otra cuenta. Retirar una membresía deja de autorizar nuevas llamadas inmediatamente; los datos que esa persona ya descargó no se pueden recuperar. Los datos personales permanecen en la base al desactivar una cuenta.

Las notas se guardan en PostgreSQL y se exportan solo bajo sesión y espacio autorizados. El editor procesa Markdown GFM y permite clases de estilo acotadas; filtra HTML activo, atributos de eventos y enlaces ejecutables. No carga imágenes remotas. Las notas no usan cifrado de extremo a extremo: el operador de la base y los respaldos puede leer su contenido. Para referencias a cuentas/VPN, guarda documentación y enlaces a la bóveda de credenciales que use el equipo; AegiTasks no implementa una bóveda de contraseñas.

El editor avisa al salir con cambios sin guardar. Ante un conflicto o desconexión, conserva el texto abierto y permite exportarlo; no almacena automáticamente notas sensibles en localStorage. Markdown conserva el texto y las clases de estilo; HTML exportado incluye estilos seguros. El ZIP incluye notas activas/archivadas y un índice JSON con la jerarquía. PDF usa el diálogo de impresión del navegador. La importación individual acepta `.md`; no importa bases de Obsidian ni ZIP completos.

### Página de edición y diagramas

Crear, importar y abrir notas lleva a una página completa (`#notes/new` o `#notes/<id>`). La toolbar superior conserva guardar y las herramientas al desplazarse. La vista inicial es dividida a partir de 1024 px y solo edición en pantallas menores; cambiar de vista no modifica el contenido. En móvil el editor utiliza toda el área de la app; «Volver a notas» recupera la navegación habitual. «Propiedades, plantillas y exportación» contiene carpeta, proyecto, tipografía, color, archivo/fijación y exportaciones. Ctrl/⌘ + S guarda desde el formulario. Navegar o cambiar de Space con cambios pendientes pide confirmación; la PWA pospone la actualización mientras hay un borrador, guardado o exportación en curso.

Las ocho tipografías se validan en el servidor y se conservan al exportar/importar Markdown. Las cinco nuevas se sirven como archivos locales, sin Google Fonts ni otro servicio externo, y se embeben en HTML. No cambia el esquema de la base: el campo `Font` ya es texto. Actualiza frontend y API juntos para que el servidor acepte las nuevas opciones.

«Diagramas y gráficos» inserta un bloque de ejemplo editable. También puedes escribir bloques con la etiqueta `mermaid`, según la [sintaxis oficial de Mermaid](https://mermaid.js.org/intro/syntax-reference.html). Los diagramas se procesan en el navegador con modo estricto, HTML desactivado y SVG saneado; los errores muestran el código original para corregirlo. Cada bloque admite hasta 20 000 caracteres y 300 conexiones. No se admiten directivas/frontmatter de configuración, imágenes externas ni CSS que cargue recursos. Las exportaciones Markdown/ZIP conservan el código; HTML/PDF incluyen los diagramas renderizados. HTML no necesita Mermaid ni conexión para mostrar los SVG y fuentes embebidas. Si un diagrama tiene errores, la exportación conserva el aviso y su código.

El temporizador usa la hora del servidor y una fecha de finalización. Recargar o suspender la pestaña no reinicia el intervalo; al terminar, la siguiente etapa se inicia explícitamente. Solo se contabilizan intervalos de enfoque completos. El sonido necesita interacción y una pestaña que pueda ejecutarse: no se prometen alarmas con el navegador cerrado. La vista ampliada ocupa el área de la app sin invocar la pantalla completa del navegador; salir con Esc no detiene el timer. El bloqueo de suspensión depende del soporte del navegador. Las tareas asociadas no cambian de estado automáticamente al marcar objetivos.

Focus permite seleccionar pendientes no completados, no archivados, propios o sin responsable de los proyectos activos del espacio actual. El diálogo conserva la selección entre búsquedas y páginas, sin límite de cantidad. El servidor vuelve a comprobar esas condiciones al iniciar y al agregar pendientes a una sesión activa, por si otro miembro cambió un pendiente mientras se elegía. La selección de una sesión activa se guarda con control de versión, conserva los pendientes ya completados que mantengas seleccionados y no modifica el vencimiento del timer. «Completar» aplica el primer estado del proyecto marcado como resuelto; si no existe, el resumen indica que hay que configurarlo. El cambio no necesita migraciones de base de datos.

La bandeja aplica por defecto el mismo filtro de responsable para cualquier rol, incluido Admin. El selector de responsable de la bandeja permite consultar otros usuarios y las métricas respetan ese filtro; esto no modifica los permisos de acceso al espacio.

### Ambientes y audio de Focus

La migración `FocusVisuals` agrega color y forma de partículas a las preferencias personales. Los perfiles existentes conservan tema, duraciones, animaciones y sonido, y reciben `#A78BFA` / `mixed` como valores iniciales. PostgreSQL aplica la migración al arrancar la API; el arranque de desarrollo en SQLite incorpora las columnas solo si faltan. No borres los volúmenes al actualizar.

Los ocho ambientes se eligen en «Ajustes de Focus» → «Ambiente visual», desde el icono de ajustes de la barra superior. Los cinco nuevos tienen un selector de color y Geometría sonora añade un selector de formas. «Guardar preferencias» conserva los valores entre dispositivos; comenzar una sesión también los guarda. Los cambios visuales no alteran un intervalo ya iniciado.

La barra superior abre los diálogos de pendientes, objetivos/historial, audio y ajustes. El contador muestra completados/seleccionados; su diálogo permite completar pendientes y abrir el selector. El icono de audio aparece en Geometría sonora, muestra un indicador mientras hay una fuente conectada y abre «Audio del espectro». Cerrar ese diálogo conserva la captura y la reproducción del archivo. La vista del timer se adapta sin scrollbar; las listas y formularios largos se desplazan dentro de sus diálogos. En teléfonos de poca altura se reduce la navegación superior para dejar espacio al reloj y sus controles.

En Geometría sonora, «Compartir audio» abre el selector del navegador: elige una pestaña o pantalla con sonido y activa «Compartir audio». Que el navegador ofrezca audio de pestaña, ventana o sistema depende de su soporte y del sistema operativo. Una PWA no tiene acceso automático al sonido de otras aplicaciones; si el navegador no permite capturarlo, usa «Usar micrófono» o «Reproducir archivo». El micrófono escucha el entorno, no el audio interno de unos auriculares. La API requiere HTTPS (localhost se admite para desarrollo). [Documentación de captura](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

El espectro utiliza Web Audio y frecuencias reales. Sin señal permanece en reposo. No se solicita permiso hasta pulsar una fuente. La captura compartida requiere también una pista de vídeo por exigencia del navegador, pero la app no lee sus imágenes, no graba contenido ni envía audio o archivos al servidor. Los archivos locales se reproducen mediante una URL temporal liberada al desconectar. «Desconectar audio», salir de Focus, abandonar la página o cambiar de ambiente cierra las pistas y el contexto de audio. Si el sistema interrumpe el audio, «Reactivar audio» permite reanudarlo; no se promete continuidad en segundo plano en móviles.

Los fondos limitan partículas, resolución y frecuencia de dibujo; dejan de dibujarse con la pestaña oculta. Desactivar animaciones o activar movimiento reducido deja una composición estática, incluido el espectro, sin modificar el timer. El audio conectado bloquea la recarga automática de la PWA hasta desconectarlo.

Las carpetas de notas se archivan indirectamente conservando sus notas; para eliminar una carpeta primero hay que mover sus notas y subcarpetas. Los espacios y las notas no se eliminan de forma destructiva desde la interfaz. Las notas pueden archivarse y restaurarse.
