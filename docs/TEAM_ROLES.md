# Roles de equipo por workspace

En **Ajustes → Workspace**, selecciona el espacio compartido y usa **Crear rol de equipo**. Define un nombre y una descripción opcional; por ejemplo Dirección general, Dirección técnica, Gerencia, Desarrollo o Soporte técnico. En la lista de miembros, el selector **Rol de equipo** asigna la función y guarda el cambio inmediatamente. **Sin rol de equipo** elimina la asignación. Cada persona puede tener un rol distinto en cada workspace.

El catálogo pertenece exclusivamente al workspace compartido. El propietario o un usuario con rol global Admin que pertenezca al espacio puede gestionarlo y asignar un rol a cada integrante, incluido el propietario. Los demás miembros pueden consultar los roles. Se requiere el permiso de página Spaces (`spaces`). Los espacios personales no tienen roles de equipo.

Estos roles son descriptivos: una persona con Dirección general sigue teniendo los permisos de su rol global User/Admin. No otorgan administración de cuentas, membresía ni permisos adicionales. Los roles globales siguen en **Ajustes → Usuarios y roles**.

Editar el nombre o la descripción actualiza las asignaciones existentes. Eliminar un rol solicita confirmación y deja a sus integrantes sin rol, conservando su acceso. Quitar un miembro borra su asignación; si regresa empieza sin rol. Transferir la propiedad conserva las funciones de equipo de ambos integrantes. Los cambios actualizan las vistas conectadas mediante los eventos existentes, sin consultas periódicas.

## Persistencia y API

`TeamRoles` guarda el catálogo por Space, con nombre de hasta 80 caracteres, descripción opcional de hasta 400 y nombre normalizado único por espacio (ignora mayúsculas y espacios repetidos). `TeamRoleAssignments` tiene clave `(SpaceId, UserId)` y referencia compuesta al rol del mismo espacio y a la membresía. Una asignación del propietario materializa su membresía implícita; no cambia la propiedad. Las relaciones impiden asignar roles de otro workspace y eliminan asignaciones al quitar miembros o roles.

Rutas autenticadas bajo `/api/spaces/{spaceId}`:

| Operación | Ruta | Datos |
| --- | --- | --- |
| Consultar catálogo | `GET /team-roles` | Devuelve `id`, `name`, `description`, `version` |
| Crear rol | `POST /team-roles` | `{ name, description? }` |
| Editar rol | `PUT /team-roles/{roleId}` | `{ name, description?, version }` |
| Eliminar rol | `DELETE /team-roles/{roleId}?version={version}` | Versión actual del catálogo |
| Asignar/quitar rol | `PUT /members/{userId}/team-role` | `{ teamRoleId: id o null, version: teamRoleVersion o null }` |
| Consultar integrantes | `GET /members` | Incluye `teamRole` y `teamRoleVersion`, ambos opcionales/null |

Las versiones de rol y de asignación son independientes. Una edición antigua devuelve 409 sin sobrescribir cambios; un nombre duplicado devuelve 409. Un miembro ordinario recibe 403 al gestionar y un workspace ajeno o personal recibe 404. Los permisos se validan en servidor.

La migración PostgreSQL `20261008221807_WorkspaceTeamRoles` se aplica con el arranque habitual del contenedor API. Solo agrega tablas y relaciones; no cambia cuentas, roles globales, espacios ni contenido existente. El upgrade local SQLite es idempotente. No se requieren variables nuevas, servicios adicionales ni Redis. Los integrantes anteriores empiezan sin rol de equipo.

## Comprobaciones

`dotnet run --project server/AegiTasks.TeamRoleTests` verifica el upgrade SQLite en memoria, concurrencia, relaciones entre espacios y eliminación en cascada sin perder miembros. `AEGITASKS_TEST_ONLY=team-roles node client/scripts/e2e.mjs` comprueba API y UI real, propietario/Admin/miembro, persistencia, versiones, transferencia, eventos y layouts claros/oscuros en escritorio y móvil. La suite completa también ejecuta estos escenarios. `node client/scripts/postgres-tests.mjs` verifica la migración con datos antiguos y la suite sobre PostgreSQL real.
