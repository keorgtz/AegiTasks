# AegiTasks

Espacios personales y compartidos para organizar pendientes, documentar conocimiento y concentrarse en lo que sigue. PWA responsive con la identidad **AegiPulse de AegiFitness**, tema claro y oscuro, y despliegue mediante Docker + Nginx Proxy Manager + Cloudflare Tunnel.

## Qué incluye

- **Spaces:** cada cuenta recibe un espacio Personal privado. Crea workspaces independientes, invita a usuarios existentes mediante códigos con vencimiento, revoca invitaciones, retira miembros o transfiere la propiedad. Cada workspace comparte proyectos, pendientes y notas solo entre sus integrantes.
- **Notas Markdown:** carpetas y subcarpetas, búsqueda por contenido, notas fijadas o archivadas, proyecto opcional, plantillas, tablas GFM, citas, checklists, bloques de código con resaltado, colores, callouts y tres familias tipográficas. Vista dividida o previa, importación `.md`, exportación Markdown/HTML/PDF mediante impresión y ZIP de todo el espacio con su estructura. Las notas pueden generar un pendiente vinculado sin perder el original.
- **Focus Mode personal:** enfoque, pausa corta/larga y ciclos configurables; objetivos manuales y diálogo para seleccionar pendientes abiertos propios o sin responsable, de todos los proyectos activos del espacio, sin límite de cantidad. Incluye búsqueda, filtro por proyecto, selección entre páginas y confirmación o cancelación. El timer muestra un resumen, el progreso y una acción «Completar» que aplica el estado resuelto del proyecto y comparte el cambio con el equipo. Puedes ajustar la selección durante la sesión sin reiniciar el tiempo ni perder los pendientes completados que conserves. Aurora, Waves y Terminal con fondos animados, vista ampliada dentro de la pestaña y movimiento reducido. El diálogo se abre también sobre la vista ampliada; Esc cierra primero el diálogo y después permite salir de esa vista. Sesión guardada en el servidor, pausa/reanudación, sonido opcional e historial personal.
- **Bandeja por responsable:** al entrar muestra tus pendientes y los que no tienen responsable, también para Admin. El filtro permite ver solo los propios, sin responsable, todos o una persona concreta; las métricas siguen ese filtro. Incluye pendientes abiertos, alta prioridad, vencidos y resueltos; búsqueda por título y descripción.
- **Ocho ambientes de Focus:** Aurora, Waves y Terminal, más Luciérnagas, Brisa auroral, Constelaciones, Lluvia de código y Geometría sonora. Los cinco nuevos permiten elegir color; Geometría sonora también combina círculos, triángulos, cuadrados o hexágonos. Color y forma se guardan en las preferencias personales. Las animaciones se detienen con movimiento reducido, al desactivarlas o mientras la pestaña está oculta.
- **Espectro circular de audio:** Geometría sonora analiza frecuencias reales alrededor del reloj. Activa audio compartido, micrófono o un archivo de audio local; no se solicita acceso automáticamente. La captura de otras apps depende del navegador y del sistema; en dispositivos sin soporte puedes usar el micrófono o reproducir un archivo desde Focus. Con auriculares, el micrófono no escucha directamente lo que estás reproduciendo. El procesamiento ocurre en el dispositivo: no se graban ni se suben audio, archivos o imágenes. Cambiar de ambiente, salir de Focus o desconectar libera la captura.
- **Proyectos separados:** productos permanentes con etiquetas opcionales como PMS, POS y CRM; carpetas por módulo, cliente o área. Las etiquetas del proyecto no son estados de avance.
- **Lista y tablero:** filtros por proyecto, carpeta, estado, etiqueta y prioridad; orden por prioridad, fecha o creación. Paginación de 50 elementos, también visible en el tablero.
- **Reporte simple:** solo título y proyecto obligatorios. El estado inicial se asigna automáticamente. Descripción, etiquetas, responsable, prioridad, fecha límite y estimación en minutos son opcionales.
- **Estados de pendientes personalizables:** cada proyecto define el recorrido de sus pendientes mediante nombre, color, orden y si cuenta como resuelto. Los proyectos nuevos incluyen Pendiente, Por iniciar, En progreso, Resuelto y Resuelto y revisado. Los estados de proyectos existentes se conservan.
- **Etiquetas del equipo:** BUG, ADD y FIX iniciales; crea y modifica las que necesites.
- **Conversación y evidencias:** comentarios, historial de cambios de estado y adjuntos PNG/JPG/WebP/PDF de hasta 10 MB, máximo 20 por pendiente.
- **Usuarios y roles:** Admin, User y roles personalizados. Solo Admin crea/gestiona cuentas y roles desde **Usuarios y roles**. Los roles nuevos tienen todas las páginas operativas habilitadas por defecto; el administrador puede restringirlas. Sin registro público ni correo saliente.
- **Archivo reversible:** conserva pendientes e historial. Los proyectos archivados se restauran desde Ajustes → Organización.
- **Cambios simultáneos:** un pendiente modificado por otra persona rechaza una edición antigua con un mensaje para recargar; no sobrescribe silenciosamente.
- **PWA:** pulsa el logo en el sidebar o en la cabecera móvil para instalar; los nuevos despliegues se aplican automáticamente sin borrar caché. Fuentes e iconos locales.
- **Borradores sin conexión:** el texto de reportes nuevos se conserva por usuario y espacio en el dispositivo. Enviar requiere conexión y una sesión vigente. La PWA conserva su interfaz, pero **no almacena respuestas privadas de la API ni sincroniza cambios automáticamente en segundo plano**.

Las vistas reciben avisos del servidor al cambiar su contenido, sin consultar datos cada 30 segundos. La reconexión sincroniza la vista y los avisos recibidos en segundo plano se aplican al recuperar visibilidad. Los formularios abiertos conservan sus borradores y detectan conflictos al guardar. Las notas se guardan explícitamente; no son un editor de texto colaborativo simultáneo. Las tarjetas de métricas filtran la bandeja. Los estados se cambian desde el detalle o Focus; el tablero funciona también con touch y teclado.

En escritorio, las secciones del sidebar se abren de una en una. Cuando falta altura, las opciones se paginan para mantenerlas accesibles sin scrollbar vertical. Eliminar un pendiente borra sus comentarios y adjuntos; eliminar un proyecto borra además sus pendientes, carpetas y estados. Ambas acciones piden confirmación, conservan las notas y limpian los enlaces afectados en notas y Focus. Archivar sigue siendo la alternativa reversible.

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

Para ejecutar también la suite contra PostgreSQL local, coloca `initdb`, `pg_ctl` y `psql` en PATH y ejecuta `node client/scripts/postgres-tests.mjs`. Usa un cluster temporal en el puerto 55439, verifica una migración con datos anteriores y una instalación nueva, y lo detiene al finalizar.

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
