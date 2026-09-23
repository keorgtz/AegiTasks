# AegiTasks

Un espacio compartido para que soporte reporte hallazgos y desarrollo los convierta en avances. PWA responsive con la identidad **AegiPulse de AegiFitness**, tema claro y oscuro, y despliegue mediante Docker + Nginx Proxy Manager + Cloudflare Tunnel.

## Qué incluye

- **Bandeja del equipo:** pendientes abiertos, alta prioridad, vencidos y resueltos; búsqueda por título y descripción.
- **Proyectos separados:** PMS, POS, CRM o los productos que necesites; carpetas por módulo, cliente o área.
- **Lista y tablero:** filtros por proyecto, carpeta, estado, etiqueta y prioridad; orden por prioridad, fecha o creación. Paginación de 50 elementos, también visible en el tablero.
- **Reporte simple:** solo título y proyecto obligatorios. El estado inicial se asigna automáticamente. Descripción, etiquetas, responsable, prioridad, fecha límite y estimación en minutos son opcionales.
- **Estados personalizables por proyecto:** nombre, color, orden y si cuenta como resuelto. Las carpetas del proyecto comparten ese recorrido.
- **Etiquetas del equipo:** BUG, ADD y FIX iniciales; crea y modifica las que necesites.
- **Conversación y evidencias:** comentarios, historial de cambios de estado y adjuntos PNG/JPG/WebP/PDF de hasta 10 MB, máximo 20 por pendiente.
- **Equipo y cuentas:** administrador y miembros. Alta, desactivación, cambio de rol y restablecimiento de contraseñas desde Ajustes. Sin registro público ni dependencia de correo saliente.
- **Archivo reversible:** conserva pendientes e historial. Los proyectos archivados se restauran desde Ajustes → Organización.
- **Cambios simultáneos:** un pendiente modificado por otra persona rechaza una edición antigua con un mensaje para recargar; no sobrescribe silenciosamente.
- **PWA:** instalación en computadora y teléfono; actualización desde navegación lateral o Ajustes en móvil; fuentes e iconos locales.
- **Borradores sin conexión:** el texto de reportes nuevos se conserva por usuario en el dispositivo. Enviar requiere conexión y una sesión vigente. La PWA conserva su interfaz, pero **no almacena respuestas privadas de la API ni sincroniza cambios automáticamente en segundo plano**.

La interfaz se actualiza cada 30 segundos mientras está visible. Las tarjetas de métricas filtran la bandeja. El estado se cambia desde el detalle; el tablero no requiere arrastrar tarjetas, por lo que funciona también con touch y teclado.

## Arquitectura

| Capa | Tecnología |
| --- | --- |
| Cliente | React 19, TypeScript, Vite, vite-plugin-pwa, Lucide |
| Diseño | Tokens originales de AegiFitness, Inter local, temas AegiPulse |
| API | ASP.NET Core 10, EF Core 10, endpoints HTTP |
| Producción | PostgreSQL 17, migraciones versionadas |
| Desarrollo y pruebas locales | SQLite en archivo aislado, sin instalar un servidor de BD |
| Autenticación | Cookie HttpOnly, SameSite Strict, Secure en producción; contraseñas con PasswordHasher de ASP.NET Core |
| Infraestructura | Docker Compose: PostgreSQL + API + Nginx; red externa `proxy` |

Redis no es necesario para esta versión: los pendientes se consultan directamente con índices y paginación. Esto evita invalidaciones de caché innecesarias en un espacio compartido. Se puede incorporar cuando las mediciones justifiquen su uso.

```text
client/src/                    Interfaz, componentes y estilos AegiPulse
client/scripts/e2e.mjs          Pruebas contra API y navegador reales
server/AegiTasks.Api/
  Domain/                      Entidades
  Data/                        DbContext, bootstrap y migraciones PostgreSQL
  Services/                    Validación y reglas compartidas
  Endpoints/                   Autenticación, catálogos y pendientes
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

   | Campo | Valor |
   | --- | --- |
   | Domain Names | `task.tudominio.com` |
   | Scheme | `http` |
   | Forward Hostname | `aegitasks-web` |
   | Forward Port | `80` |
   | SSL | Certificado válido y HTTPS forzado según tu instalación de NPM/Tunnel |
   | Advanced | `client_max_body_size 11m;` para evidencias de hasta 10 MB |

4. En el mismo Cloudflare Tunnel de AegiFitness, agrega el hostname `task.tudominio.com` apuntando a NPM. Ejemplo de túnel administrado por archivo:

   ```yaml
   - hostname: task.tudominio.com
     service: http://npm:80
   ```

   Conserva tus entradas actuales y coloca esta entrada antes del `http_status:404` final. Crea la ruta DNS/CNAME hacia tu túnel como haces para `fitness`. Si usas el panel de Cloudflare, añade un Public Hostname equivalente. Desactiva reglas de caché generales para `/api/*`, `/sw.js` e `/index.html`.

5. Abre `https://task.tudominio.com` e ingresa con `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`. Cambia tu contraseña desde **Ajustes → Mi cuenta**, crea los proyectos y agrega a tu equipo.

El dominio real queda a tu elección: el stack no contiene una referencia fija al subdominio fitness. Ningún puerto de base de datos o API se publica en el host. Los nombres y volúmenes tienen prefijo `aegitasks` para coexistir con AegiFitness.

### Actualizaciones

```bash
git pull
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 api
```

Realiza un respaldo antes de actualizar. La API aplica migraciones al arrancar. El administrador y sus claves se siembran **solo cuando no hay usuarios**: editar las variables de seed no cambia una contraseña existente. Los proyectos, etiquetas personalizadas y estados guardados no se reemplazan al desplegar. Ejecuta una sola instancia de API durante las migraciones.

En los clientes ya instalados, usa **Actualización disponible** en la navegación o en Ajustes móvil. Guarda los cambios abiertos antes de actualizar.

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
```

Las pruebas levantan una API y un cliente de producción con BD temporal independiente. Los puertos 5213 y 4174 deben estar libres. Cubren permisos, validaciones entre proyectos, persistencia, conflictos de edición, adjuntos, archivo, filtros, paginación, UI, temas, tamaños móviles, PWA y recuperación de borradores tras perder conexión. Sus datos de muestra **no se siembran en producción**. Evidencia y capturas: `artifacts/` (ignorado por Git).

Consulta [docs/VALIDATION.md](docs/VALIDATION.md) para los resultados efectivamente ejecutados y las verificaciones pendientes de infraestructura.

## Primer uso del equipo

1. El administrador crea un proyecto por producto, por ejemplo PMS, POS y CRM.
2. En Ajustes crea carpetas como Reservaciones o Caja, ordena los estados y agrega personas.
3. Soporte pulsa **Nuevo pendiente**, selecciona el producto y cuenta qué encontró. Después de guardarlo puede adjuntar capturas y comentar.
4. Desarrollo revisa la bandeja, asigna responsable/prioridad y avanza el estado desde el detalle.
5. Un estado marcado como resuelto se refleja en las métricas. Archivar conserva el historial.

## Alcance de acceso

Es una aplicación para **un equipo compartido**. Todo miembro autenticado puede ver proyectos, pendientes, comentarios y evidencias; crear reportes y modificar pendientes. Los administradores también gestionan cuentas, estructura, catálogos y archivo. Los permisos se validan en el servidor. No hay aislamiento por cliente, organización o proyecto privado; no uses este espacio para equipos que deban estar separados entre sí.

## Git

El repositorio local se inicializa en `main`. Crea el repositorio remoto **AegiTasks** vacío y conéctalo con su URL real:

```bash
git remote add origin <URL-DEL-REPOSITORIO-AegiTasks>
git push -u origin main
```

No incluye remote, publicación automática ni credenciales del servidor. Revisa [docs/OPERATIONS.md](docs/OPERATIONS.md) para respaldo, recuperación y diagnóstico.
