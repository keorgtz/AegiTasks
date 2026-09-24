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

Los borradores nuevos se guardan en localStorage por usuario y espacio. Cerrar sesión los elimina; no se guardan contraseñas ni cookies de sesión en localStorage. La consulta de datos privados necesita servidor disponible. Las fechas límite son fechas sin hora; las métricas del servidor usan el día UTC. Los comentarios y evidencias se conservan como historial; esta versión no ofrece borrado de esos registros desde la interfaz.

La instalación prevista usa una sola API. Antes de escalar a varias réplicas, usa almacenamiento compartido para adjuntos y claves, coordinación de migraciones y un límite distribuido de autenticación. Redis es una incorporación posible en ese escenario.

## Espacios, notas y enfoque

Los permisos de página y la membresía se comprueban en el servidor. Las claves de sesión no conceden acceso al espacio Personal de otra cuenta. Retirar una membresía deja de autorizar nuevas llamadas inmediatamente; los datos que esa persona ya descargó no se pueden recuperar. Los datos personales permanecen en la base al desactivar una cuenta.

Las notas se guardan en PostgreSQL y se exportan solo bajo sesión y espacio autorizados. El editor procesa Markdown GFM y permite clases de estilo acotadas; filtra HTML activo, atributos de eventos y enlaces ejecutables. No carga imágenes remotas. Las notas no usan cifrado de extremo a extremo: el operador de la base y los respaldos puede leer su contenido. Para referencias a cuentas/VPN, guarda documentación y enlaces a la bóveda de credenciales que use el equipo; AegiTasks no implementa una bóveda de contraseñas.

El editor avisa al salir con cambios sin guardar. Ante un conflicto o desconexión, conserva el texto abierto y permite exportarlo; no almacena automáticamente notas sensibles en localStorage. Markdown conserva el texto y las clases de estilo; HTML exportado incluye estilos seguros. El ZIP incluye notas activas/archivadas y un índice JSON con la jerarquía. PDF usa el diálogo de impresión del navegador. La importación individual acepta `.md`; no importa bases de Obsidian ni ZIP completos.

El temporizador usa la hora del servidor y una fecha de finalización. Recargar o suspender la pestaña no reinicia el intervalo; al terminar, la siguiente etapa se inicia explícitamente. Solo se contabilizan intervalos de enfoque completos. El sonido necesita interacción y una pestaña que pueda ejecutarse: no se prometen alarmas con el navegador cerrado. Pantalla completa y bloqueo de suspensión dependen del soporte del navegador. Las tareas asociadas no cambian de estado automáticamente al marcar objetivos.

Las carpetas de notas se archivan indirectamente conservando sus notas; para eliminar una carpeta primero hay que mover sus notas y subcarpetas. Los espacios y las notas no se eliminan de forma destructiva desde la interfaz. Las notas pueden archivarse y restaurarse.
