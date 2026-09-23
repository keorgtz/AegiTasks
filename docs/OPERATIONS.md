# Operación de AegiTasks

## Datos persistentes

- `aegitasks-pgdata`: PostgreSQL, usuarios, proyectos, pendientes e historial.
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
- **No cambia contraseña al editar `.env`:** el seed solo crea el primer administrador. Usa Ajustes → Equipo para restablecer cuentas existentes.
- **401 después de cambiar rol o contraseña:** las sesiones se invalidan intencionalmente. Ingresa de nuevo.
- **409 al guardar un pendiente:** otro usuario guardó primero. Copia lo que quieras conservar, cierra y vuelve a abrir el detalle; aplica los cambios sobre la versión actual.
- **Límite de login:** 30 intentos cada 5 minutos por IP visible para la API. Detrás de Nginx, ese límite puede compartirse entre usuarios; el sistema no confía en cabeceras IP enviadas por el cliente.

## Seguridad y límites

No hay registro público. Las contraseñas usan PasswordHasher; nunca se devuelve su hash a la interfaz. Las operaciones que cambian datos requieren una cabecera propia y no se habilita CORS. Las cookies son HttpOnly y SameSite Strict. Los adjuntos requieren autenticación para descargarse; el nombre físico es un identificador generado y la descarga fuerza un nombre seguro. Se verifica la firma de imágenes/PDF, pero no se incluye antivirus ni análisis del contenido de PDFs: adjunta evidencias del equipo, no archivos de fuentes desconocidas.

Los borradores nuevos se guardan en localStorage por usuario. Cerrar sesión los elimina; no se guardan contraseñas ni cookies de sesión en localStorage. La consulta de datos privados necesita servidor disponible. Las fechas límite son fechas sin hora; las métricas del servidor usan el día UTC. Los comentarios y evidencias se conservan como historial; esta versión no ofrece borrado de esos registros desde la interfaz.

La instalación prevista usa una sola API. Antes de escalar a varias réplicas, usa almacenamiento compartido para adjuntos y claves, coordinación de migraciones y un límite distribuido de autenticación. Redis es una incorporación posible en ese escenario.
