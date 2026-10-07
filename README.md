# AegiTasks

Espacios personales y compartidos para organizar pendientes, documentar conocimiento y concentrarse en lo que sigue. PWA responsive con la identidad **AegiPulse de AegiFitness**, tema claro y oscuro, y despliegue mediante Docker + Nginx Proxy Manager + Cloudflare Tunnel.

## Qué incluye

- **Chat global:** conversaciones privadas 1-1 y grupos independientes de los Spaces, con texto, documentos, imágenes, videos pequeños y accesos directos a pendientes compartidos. Historial paginado, mensajes sin leer y actualización en tiempo real; cambiar de Space conserva conversación y borrador. Solo los integrantes pueden leer y descargar archivos. [Uso, formatos, permisos y despliegue](docs/CHAT.md).

- **Notificaciones:** campanita con historial personal y avisos con título del pendiente, autor y cambio preciso: asignación, estado, propiedades, comentarios o evidencias. Cada persona puede eliminar avisos individuales o limpiar todo su historial con confirmación, conservando pendientes y dispositivos activados. Los pendientes asignados notifican al responsable cuando actúa otra persona; los pendientes sin responsable notifican a todos los integrantes activos con acceso, incluido el autor. Push opcional por dispositivo desde **Ajustes → Notificaciones**, con invitación en la primera apertura de la app instalada, lectura y limpieza sincronizadas y apertura del pendiente en su Space. Las claves se generan automáticamente y persisten en el volumen existente de Docker. [Funcionamiento, permisos y despliegue](docs/NOTIFICATIONS.md).

- **Spaces:** cada cuenta recibe un espacio Personal privado y puede editar su nombre. El propietario o un Admin integrante puede editar el nombre del workspace desde un diálogo. Admin también puede agregar directamente cualquier usuario existente y activo desde **Agregar usuario**, sin código; su dispositivo conectado recibe el nuevo workspace mediante eventos. Se conservan las invitaciones con vencimiento, su revocación y la transferencia de propiedad. El propietario y los admins integrantes pueden retirar miembros; cualquier miembro puede salir. Cada workspace comparte proyectos, pendientes y notas solo entre sus integrantes; los espacios personales siguen siendo privados.
- **Notas Markdown:** editor que ocupa toda la ventana de la app, sin sidebar ni navegación global mientras escribes. Toolbar compacta y colapsable; título, guardar y selector de vista siempre accesibles. Guardado con Ctrl/⌘ + S y enlace directo a cada nota. En computadora abre la vista dividida; en móvil, solo el texto Markdown. Puedes cambiar a edición, dividida o preview. Incluye carpetas y subcarpetas, búsqueda por contenido, notas fijadas o archivadas, proyecto opcional, plantillas, tablas GFM, citas, checklists, código con resaltado, colores y callouts. Ocho tipografías, incluidas Lora, Source Serif 4, JetBrains Mono, Nunito Sans e IBM Plex Sans, servidas desde la app.
- **Diagramas y gráficos en notas:** bloques `mermaid` con **39 plantillas agrupadas en siete categorías**: procesos, software/datos, ideas/estrategia, planificación, métricas, arquitectura C4 y gramáticas. Incluye UML, ER, infraestructura, eventos, paquetes de red, árboles, Git, Sankey, radar, Venn, Wardley, Cynefin e Ishikawa, además de flujos y gráficos habituales. El catálogo cubre las familias nativas de Mermaid 11.17.2; las extensiones y los tipos de versiones posteriores no se incluyen. Se dibujan localmente y se adaptan al tema. Importación `.md`, exportación Markdown/HTML/PDF mediante impresión y ZIP de todo el espacio con su estructura. HTML incluye los diagramas SVG y las nuevas fuentes embebidas. Las notas pueden generar un pendiente vinculado sin perder el original.
- **Focus Mode personal:** enfoque, pausa corta/larga y ciclos configurables; objetivos manuales y diálogo para seleccionar pendientes abiertos propios o sin responsable, de todos los proyectos activos del espacio, sin límite de cantidad. Incluye búsqueda, filtro por proyecto, selección entre páginas y confirmación o cancelación. La pantalla del timer se adapta a la altura y anchura disponibles sin scrollbar, también en teléfonos horizontales. La barra superior muestra el contador de pendientes completados/seleccionados; al pulsarlo abre el resumen y la acción «Completar», que aplica el estado resuelto del proyecto y comparte el cambio con el equipo. Objetivos, historial, preferencias y audio tienen sus propios diálogos. Puedes ajustar la selección durante la sesión sin reiniciar el tiempo ni perder los pendientes completados que conserves. Vista ampliada dentro de la pestaña y movimiento reducido. Los diálogos se abren también sobre la vista ampliada; Esc cierra primero el diálogo y después permite salir de esa vista. Sesión guardada en el servidor, pausa/reanudación, sonido opcional e historial personal.
- **Bandeja por responsable:** al entrar muestra tus pendientes y los que no tienen responsable, también para Admin. El filtro permite ver solo los propios, sin responsable, todos o una persona concreta; las métricas siguen ese filtro. Incluye pendientes abiertos, alta prioridad, vencidos y resueltos; búsqueda por título y descripción. La bienvenida y los KPIs se pueden ocultar por separado y recuperar desde sus botones; la preferencia se conserva por usuario/Space en el dispositivo. La antigua vista Mis pendientes redirige a la bandeja.
- **Ocho ambientes de Focus:** Aurora, Waves y Terminal, más Luciérnagas, Brisa auroral, Constelaciones, Lluvia de código y Geometría sonora. Los cinco nuevos permiten elegir color; Geometría sonora también combina círculos, triángulos, cuadrados o hexágonos. Color y forma se guardan en las preferencias personales. Las animaciones se detienen con movimiento reducido, al desactivarlas o mientras la pestaña está oculta.
- **Espectro circular de audio:** Geometría sonora analiza frecuencias reales alrededor del reloj. Activa audio compartido, micrófono o un archivo de audio local; no se solicita acceso automáticamente. La captura de otras apps depende del navegador y del sistema; en dispositivos sin soporte puedes usar el micrófono o reproducir un archivo desde Focus. Con auriculares, el micrófono no escucha directamente lo que estás reproduciendo. El procesamiento ocurre en el dispositivo: no se graban ni se suben audio, archivos o imágenes. Cambiar de ambiente, salir de Focus o desconectar libera la captura.
- **Proyectos separados:** productos permanentes con etiquetas opcionales como PMS, POS y CRM; carpetas por módulo, cliente o área. Las etiquetas del proyecto no son estados de avance.
- **Gestión de módulos y ciclos:** páginas dedicadas desde las tarjetas de Proyectos y las secciones Pendientes / Módulos / Ciclos. Vistas de **tarjetas, lista, tablero y cronología**, preferencia por cuenta/Space/proyecto, búsqueda y filtros en diálogo. Los módulos muestran el avance de partes del producto; los ciclos agrupan trabajo por periodos actuales, próximos, finalizados o sin fechas. Cada agrupación tiene enlace directo, resumen de avance y detalle con lista/tablero de sus pendientes: crear, agregar existentes, abrir, cambiar estado y retirar sin borrar. El detalle conserva paginación y detecta ediciones simultáneas. Las fechas son opcionales y se permiten ciclos paralelos. Cada pendiente puede pertenecer a un módulo y un ciclo independientes, además de su carpeta y etiquetas. Eliminar una agrupación conserva los pendientes y su otra agrupación. El resumen plegable **Planificación y avance** sigue disponible en la bandeja del proyecto.
- **Avance por proyecto y agrupación:** porcentaje y recuento de pendientes resueltos, según los estados personalizados. Incluye todos los responsables y pendientes sin módulo; excluye pendientes archivados. Los totales de estimación se muestran separados por escala, con avance ponderado dentro de cada escala numérica y recuentos por categoría. No se convierten puntos o tamaños a horas ni se mezclan escalas.
- **Estimaciones opcionales:** tiempo en minutos, Story Points enteros de 0 a 1000, Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89), puntos lineales de 0 a 10 o categorías XS/S/M/L/XL. En Ajustes del proyecto puedes elegir la escala sugerida para nuevos pendientes; cada pendiente puede usar otra escala o quedar sin estimación. Cambiar la escala sugerida conserva las estimaciones existentes; cambiar el tipo de un pendiente limpia sus valores incompatibles. Referencia funcional: [propiedades y estimaciones de Plane](https://docs.plane.so/work-items/work-item-properties), adaptada a esta app.
- **Cinco vistas de pendientes:** tarjetas, lista, tablero, cronología y calendario. Las primeras cuatro comparten los mismos 50 elementos por página; el calendario consulta el mes elegido por fecha límite, con los mismos filtros y paginación, y permite ver pendientes sin fecha aparte. Entrar/salir del calendario o cambiar su periodo vuelve a la primera página. En computadora muestra una cuadrícula mensual y en móvil una cuadrícula compacta con agenda del día seleccionado. El buscador y el diálogo de filtros conservan proyecto, carpeta, módulo, ciclo, estado, responsable, etiqueta, prioridad, alcance y orden. La preferencia de vista se guarda por cuenta/Space/contexto. La cronología conserva puntos de vencimiento y pendientes sin fecha, sin inventar duraciones.
- **Kanban y estado rápido:** los tableros de pendientes de bandeja, proyectos, módulos y ciclos permiten arrastrar desde su asa con mouse o touch; con teclado, espacio/Enter inicia, las flechas eligen columna, espacio/Enter confirma y Escape cancela. Cada pendiente solo puede moverse entre estados de su proyecto. Listas, tarjetas, tableros, cronología, calendario, subpendientes y el resumen de Focus ofrecen un botón de estado que abre un selector compacto, sin abrir el detalle completo. Los cambios se guardan y notifican a los dispositivos conectados; las versiones impiden sobrescribir ediciones simultáneas.
- **Reporte simple:** solo título y proyecto obligatorios. El estado inicial se asigna automáticamente. Descripción, etiquetas, responsable, prioridad, fecha límite y estimación en minutos son opcionales.
- **Estados de pendientes personalizables:** cada proyecto define el recorrido de sus pendientes mediante nombre, color, orden y si cuenta como resuelto. Los proyectos nuevos incluyen Pendiente, Por iniciar, En progreso, Resuelto y Resuelto y revisado. Los estados de proyectos existentes se conservan.
- **Etiquetas del equipo:** BUG, ADD y FIX iniciales; crea y modifica las que necesites.
- **Detalle del pendiente:** pestañas de Detalle general, Evidencias y Conversación y actividad. El footer permanece visible al desplazar el contenido: estado, responsable y Guardar están siempre accesibles; botones compactos abren proyecto, etiquetas, prioridad, fecha, carpeta, módulo, ciclo y estimación. En móvil se agrupan en **Más propiedades**. Conserva ediciones y comentarios al cambiar de pestaña y permite guardar desde cualquiera. Comentarios, historial y adjuntos PNG/JPG/WebP/PDF de hasta 10 MB, máximo 20 por pendiente.
- **Padres y subpendientes:** relación opcional dentro del mismo proyecto y Space, con varios niveles. Desde el detalle puedes elegir un padre, crear hijos, vincular existentes, consultar su avance, abrirlos, cambiar su estado o retirar la relación. Cada hijo tiene su propio responsable, estado y estimación; completar los hijos no completa automáticamente el padre. Los selectores tienen búsqueda y paginación, sin limitar la cantidad de hijos. Se impiden ciclos y relaciones entre proyectos o espacios. Eliminar el padre conserva los hijos sin padre; eliminar el proyecto elimina sus pendientes de todos los niveles.
- **Usuarios y roles:** Admin, User y roles personalizados. Login con correo o nombre de usuario único, sin distinguir mayúsculas. Cada persona, incluido Admin, puede editar su nombre visible, usuario y correo desde **Ajustes → Mi cuenta**; cambiar usuario o correo requiere confirmar la contraseña actual y no cierra sus sesiones ni cambia permisos. Ambos identificadores deben ser únicos, incluso entre cuentas desactivadas. Los datos se actualizan en las pestañas conectadas, conservando formularios en edición. Solo Admin crea y gestiona otras cuentas y roles desde **Usuarios y roles**, donde también puede editar su correo. El nombre visible puede repetirse; el usuario de login tiene de 3 a 40 caracteres y acepta letras sin acentos, números, puntos, guiones y guiones bajos, empezando con una letra o número. Las cuentas anteriores reciben un usuario basado en el prefijo del correo, con sufijo numérico si se repite. Los roles nuevos tienen todas las páginas operativas habilitadas por defecto; el administrador puede restringirlas. Sin registro público ni correo saliente.
- **Archivo reversible:** conserva pendientes e historial. Los proyectos archivados se restauran desde Ajustes → Organización.
- **Cambios simultáneos:** un pendiente modificado por otra persona rechaza una edición antigua con un mensaje para recargar; no sobrescribe silenciosamente.
- **PWA:** pulsa el logo en el sidebar o en la cabecera móvil para instalar; los nuevos despliegues se aplican automáticamente sin borrar caché. Fuentes e iconos locales.
- **Barra superior:** un único selector de Space en escritorio y móvil; opciones con los colores del tema claro/oscuro y botón de perfil circular de 44 px. El selector conserva las protecciones de formularios y notas sin guardar.
- **Borradores sin conexión:** el texto de reportes nuevos se conserva por usuario y espacio en el dispositivo. Enviar requiere conexión y una sesión vigente. La PWA conserva su interfaz, pero **no almacena respuestas privadas de la API ni sincroniza cambios automáticamente en segundo plano**.

Las vistas reciben avisos del servidor al cambiar su contenido, sin consultar datos cada 30 segundos. La reconexión sincroniza la vista y los avisos recibidos en segundo plano se aplican al recuperar visibilidad. Los formularios abiertos conservan sus borradores y detectan conflictos al guardar. Las notas se guardan explícitamente; no son un editor de texto colaborativo simultáneo. Las tarjetas de métricas filtran la bandeja. El selector rápido de estado conserva su apertura durante los refrescos de la lista; los pendientes o proyectos archivados deben restaurarse antes de cambiar su estado.

En escritorio, **Workspace y Proyectos pueden permanecer abiertos simultáneamente**. Cada panel tiene su propio scroll cuando falta altura; el sidebar completo, el logo y el perfil permanecen fijos. Las secciones se colapsan de forma independiente y conservan esa preferencia por cuenta/Space. Pulsar el encabezado **PROYECTOS** abre el catálogo sin expandirlo; su flecha independiente abre/cierra el árbol. Seleccionar un proyecto despliega **Pendientes / Módulos / Ciclos**, con la sección activa marcada y sin pestañas encima del contenido. **Ajustes** reúne Organización, Workspace, Usuarios y roles (solo con permiso) y Mi cuenta. Los enlaces anteriores a Spaces y administración se redirigen a sus nuevas secciones. En móvil, **Más → Ajustes** abre ese submenú; **Explorar proyecto** y **Más → Explorar proyectos** mantienen el árbol en un diálogo y Más → Proyectos abre el catálogo. Proyectos, módulos y ciclos comparten el mismo muestrario de seis colores, accesible con teclado y adaptable al ancho. Eliminar un pendiente borra sus comentarios y adjuntos; eliminar un proyecto borra además sus pendientes, carpetas y estados. Ambas acciones piden confirmación, conservan las notas y limpian los enlaces afectados en notas y Focus. Archivar sigue siendo la alternativa reversible.

Los paneles del sidebar usan la altura de su contenido, sin reservar mitades iguales. Cuando falta espacio, los paneles extensos comparten la altura disponible y desplazan solo su contenido. Proyectos permanece inmediatamente debajo de Workspace al plegarse. Las acciones de proyecto son compactas y separadas en computadora; en dispositivos táctiles conservan un área de 44 px. Los árboles de proyectos y Ajustes incluyen separación entre sus enlaces.

## Arquitectura

| Capa                         | Tecnología                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Cliente                      | React 19, TypeScript, Vite, vite-plugin-pwa, Lucide                                                    |
| Diseño                       | Tokens originales de AegiFitness, Inter local, temas AegiPulse                                         |
| API                          | ASP.NET Core 10, EF Core 10, endpoints HTTP                                                            |
| Producción                   | PostgreSQL 17, migraciones versionadas                                                                 |
| Desarrollo y pruebas locales | SQLite en archivo aislado, sin instalar un servidor de BD                                              |
| Autenticación                | Cookie HttpOnly, SameSite Strict, Secure en producción; contraseñas con PasswordHasher de ASP.NET Core |
| Infraestructura              | Docker Compose: PostgreSQL + API + Nginx; red externa `proxy`                                          |

Redis no es necesario para esta versión: los pendientes se consultan directamente con índices y paginación. Esto evita invalidaciones de caché innecesarias en un espacio compartido. Se puede incorporar cuando las mediciones justifiquen su uso.

```text
client/src/                    Interfaz, componentes y estilos AegiPulse
client/scripts/e2e.mjs          Pruebas contra API y navegador reales
server/AegiTasks.Api/
  Domain/                      Entidades
  Data/                        DbContext, bootstrap y migraciones PostgreSQL
  Services/                    Validación y reglas compartidas
  Endpoints/                   Autenticación, espacios, roles, notas, enfoque y pendientes
scripts/                       Preparación y desarrollo local
docs/                          Operación, validación y decisiones
docker-compose.yml             Stack para la misma red proxy que AegiFitness
```

## Despliegue en tu servidor

Requisitos: Ubuntu, Docker con Compose, Nginx Proxy Manager en la red externa `proxy` y Cloudflare Tunnel, como en AegiFitness. Usa **HTTPS** para que funcionen la cookie de producción y la instalación PWA.

1. Sube o clona el repositorio AegiTasks:

   ```bash
   cd /home/keor/AegiTasks
   sh scripts/setup-env.sh
   ```

   El script pide el correo del administrador y genera contraseñas aleatorias en `.env`, con permisos restringidos. **No sobrescribe un `.env` existente.** Puedes usar `.env.example` como referencia. No subas `.env` a Git. Lee `SEED_ADMIN_PASSWORD` localmente para el primer ingreso.

2. Verifica la red y levanta el stack:

   ```bash
   docker network inspect proxy
   # Solo si la red todavía no existe:
   # docker network create proxy
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```

3. En **Nginx Proxy Manager**, crea un Proxy Host:

   | Campo            | Valor                                                                 |
   | ---------------- | --------------------------------------------------------------------- |
   | Domain Names     | `task.tudominio.com`                                                  |
   | Scheme           | `http`                                                                |
   | Forward Hostname | `aegitasks-web`                                                       |
   | Forward Port     | `80`                                                                  |
   | SSL              | Certificado válido y HTTPS forzado según tu instalación de NPM/Tunnel |
   | Advanced         | `client_max_body_size 11m;` para evidencias de hasta 10 MB            |

4. En el mismo Cloudflare Tunnel de AegiFitness, agrega el hostname `task.tudominio.com` apuntando a NPM. Ejemplo de túnel administrado por archivo:

   ```yaml
   - hostname: task.tudominio.com
     service: http://npm:80
   ```

   Conserva tus entradas actuales y coloca esta entrada antes del `http_status:404` final. Crea la ruta DNS/CNAME hacia tu túnel como haces para `fitness`. Si usas el panel de Cloudflare, añade un Public Hostname equivalente. Excluye de las reglas generales de caché `/api/*`, `/`, `/index.html`, `/sw.js`, `/sw-version.js` y `/version.json`. Respeta las cabeceras de Nginx; `/assets/*` conserva caché inmutable por nombre de archivo.

5. Abre `https://task.tudominio.com` e ingresa con `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`. Cambia tu contraseña desde **Mi cuenta**, agrega cuentas en **Usuarios y roles**, crea un workspace e invita al equipo antes de crear los proyectos compartidos.

El dominio real queda a tu elección: el stack no contiene una referencia fija al subdominio fitness. Ningún puerto de base de datos o API se publica en el host. Los nombres y volúmenes tienen prefijo `aegitasks` para coexistir con AegiFitness.

### Actualizaciones

```bash
git pull
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 api
```

Realiza un respaldo antes de actualizar. La API aplica migraciones al arrancar. El administrador y sus claves se siembran **solo cuando no hay usuarios**: editar las variables de seed no cambia una contraseña existente. Los proyectos, etiquetas personalizadas y estados guardados no se reemplazan al desplegar. Ejecuta una sola instancia de API durante las migraciones.

Cada build genera su propia versión. La app comprueba nuevos despliegues al abrir, volver al primer plano, recuperar conexión y cada minuto mientras está visible. Instala el nuevo service worker y recarga automáticamente cuando sus archivos están listos. No elimina sesiones, preferencias ni borradores. Si hay un editor abierto, un formulario con cambios pendientes, una operación de guardado o Focus en pantalla inmersiva, espera a terminar/cerrar esa edición o salir del modo inmersivo. No copia notas ni contraseñas a almacenamiento local para actualizar.

Los dispositivos desconectados reciben la actualización al reconectar y abrir la app. **Transición desde la versión anterior:** una pestaña que ya estaba abierta con el actualizador antiguo puede necesitar cerrarse y abrirse de nuevo, o una recarga normal después de descargar el nuevo worker. No necesita borrar caché ni reinstalar. Las siguientes versiones se actualizan automáticamente. Detalles y diagnóstico en [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Desarrollo local en Windows

Requisitos: .NET SDK 10 y Node 24. No hace falta Docker para desarrollar.

```powershell
dotnet restore
npm --prefix client ci
# Terminal 1: pide una contraseña de administrador en el primer arranque
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
# Terminal 2
npm --prefix client run dev
```

Abre `http://localhost:5174`. Correo predeterminado local: `admin@aegitasks.local`; la contraseña es la que elegiste. Puedes cambiar el correo inicial con `-AdminEmail`. La API usa `http://localhost:5213`. La BD local se guarda en `server/AegiTasks.Api/.local-data/aegitasks.db`; este directorio está excluido de Git. Si cambias el modelo durante desarrollo, SQLite usa `EnsureCreated` y no aplica las migraciones PostgreSQL: conserva tus datos o crea una nueva BD de desarrollo deliberadamente. **SQLite está bloqueado en modo Production.**

Para desarrollar con PostgreSQL, configura `DatabaseProvider=Postgres`, `ConnectionStrings__Default`, `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`, y ejecuta:

```powershell
dotnet run --project server/AegiTasks.Api --urls http://localhost:5213
```

## Validación

```powershell
dotnet build
npm --prefix client run typecheck
npm --prefix client run lint
npm --prefix client run build
npx --prefix client playwright install chromium
npm --prefix client run test:e2e
npm --prefix client run test:pwa
```

Las pruebas levantan una API y un cliente de producción con BD temporal independiente. Los puertos 5213 y 4174 deben estar libres. Cubren permisos, validaciones entre proyectos, persistencia, conflictos de edición, adjuntos, archivo, filtros, paginación, UI, temas, tamaños móviles, PWA y recuperación de borradores tras perder conexión. Sus datos de muestra **no se siembran en producción**. Evidencia y capturas: `artifacts/` (ignorado por Git).

`test:pwa` compila dos versiones en carpetas temporales y alterna su publicación en el mismo origen con service workers reales de Chromium. Verifica actualizaciones automáticas, varias pestañas, formularios, modo offline y reintentos. No necesita base de datos y no reemplaza el build de `client/dist`.

Para ejecutar también la suite contra PostgreSQL local, coloca `initdb`, `pg_ctl` y `psql` en PATH y ejecuta `node client/scripts/postgres-tests.mjs`. Usa un cluster temporal con un puerto disponible elegido por el sistema, verifica una migración con datos anteriores y una instalación nueva, y lo detiene al finalizar. `node client/scripts/sqlite-upgrade-tests.mjs` verifica la actualización de cuentas y contenido local anterior en una BD temporal (requiere Node 24 y el puerto 5215 libre).

Consulta [docs/VALIDATION.md](docs/VALIDATION.md) para los resultados efectivamente ejecutados y las verificaciones pendientes de infraestructura.

## Primer uso del equipo

1. El administrador da de alta las cuentas desde **Usuarios y roles**. Cada persona recibe su espacio Personal.
2. Crea un workspace en **Spaces**, genera una invitación y comparte su código con las cuentas que deben unirse. Selecciona ese workspace antes de crear proyectos como PMS, POS y CRM. En **Ajustes → Organización**, crea carpetas, estados y etiquetas.
3. Soporte pulsa **Nuevo pendiente**, selecciona el producto y cuenta qué encontró. Después de guardarlo puede adjuntar capturas y comentar.
4. Desarrollo revisa la bandeja, asigna responsable/prioridad y avanza el estado desde el detalle.
5. Un estado marcado como resuelto se refleja en las métricas. Archivar conserva el historial.

## Alcance de acceso

El límite de acceso a datos es el **espacio**. El Personal solo es accesible por su propietario, incluso frente a otras cuentas Admin. En un workspace, sus miembros pueden leer y modificar su contenido; no hay notas privadas dentro de un espacio compartido. Para eso se usa Personal. El rol Admin gestiona cuentas y permisos, pero no evita la comprobación de membresía de espacios.

Las páginas operativas configurables son Pendientes, Proyectos, Notas, Focus, Spaces y Ajustes. Los permisos se comprueban en cada llamada de API; los cambios de acceso notifican a las sesiones conectadas. Revocar una página no equivale a ocultar referencias de catálogos necesarias para otras páginas autorizadas. La cuenta propia sigue accesible para cambiar contraseña. Usuarios y roles permanecen exclusivos de Admin.

Solo el propietario del workspace genera/revoca invitaciones, retira a otros miembros o transfiere la propiedad; un miembro puede salir. Las invitaciones duran 7 días, se almacenan como hash y regenerarlas invalida el código anterior. Es necesario tener cuenta para unirse. Las sesiones Focus y su historial son privados y continúan al cambiar de espacio.

## Actualización desde la primera versión

La migración PostgreSQL conserva los proyectos y pendientes existentes dentro de **Equipo existente**, une a los usuarios anteriores y crea sus espacios Personal. Convierte `Member` en `User` e invalida esas sesiones. La actualización no copia contenido compartido a espacios privados ni cambia contraseñas. Su reversión requiere restaurar un respaldo anterior; no se elimina el aislamiento de datos mediante una migración descendente.

## Git

El repositorio está disponible en https://github.com/keorgtz/AegiTasks y utiliza la rama `Master`:

```bash
git clone --branch Master https://github.com/keorgtz/AegiTasks.git
cd AegiTasks
```

GitHub Actions valida los cambios enviados a `Master` y los pull requests. El despliegue al servidor es manual y las credenciales se configuran mediante `.env`, excluido de Git. Revisa [docs/OPERATIONS.md](docs/OPERATIONS.md) para respaldo, recuperación y diagnóstico.
