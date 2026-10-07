# Notificaciones de pendientes

La campanita de la TitleBar muestra el historial personal de todos los Spaces a los que la cuenta tiene acceso. Los avisos se actualizan con los eventos del servidor, sin consultar periódicamente la bandeja. El historial funciona aunque el navegador no permita push o el usuario no acepte el permiso.

## Destinatarios

| Evento                                                      | Pendiente asignado                      | Pendiente sin responsable                        |
| ----------------------------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Creación                                                    | Responsable, si lo creó otra persona    | Todos los integrantes activos, incluido el autor |
| Edición, estado, archivo/restauración, módulo/ciclo o padre | Responsable, si lo cambió otra persona  | Todos los integrantes activos, incluido el autor |
| Comentario                                                  | Responsable, si comentó otra persona    | Todos los integrantes activos, incluido el autor |
| Nueva evidencia                                             | Responsable, si la adjuntó otra persona | Todos los integrantes activos, incluido el autor |

El propietario también es integrante. Se exige permiso para la página de pendientes; Admin conserva acceso operativo. La reasignación avisa al responsable nuevo. Una actualización masiva crea un aviso por pendiente, no un aviso por campo. Adjuntar evidencia genera un aviso de evidencia, sin duplicarlo por su entrada automática en Actividad. Convertir una nota a pendiente también genera el aviso de creación.

Los cambios rechazados no generan avisos. Al eliminar un pendiente se eliminan sus avisos y envíos asociados. No se crea un aviso adicional de eliminación. Al consultar o enviar se vuelve a verificar cuenta activa, permisos y membresía: nadie puede consultar el historial de otro usuario o de un Space al que ya no pertenece.

## Activación en cada dispositivo

1. Abrir **Ajustes → Notificaciones** y seleccionar **Activar en este dispositivo**. La campanita conserva el historial y un enlace a esta configuración.
2. Aceptar el permiso del navegador/sistema operativo.
3. Repetir en las computadoras y celulares que deban recibir avisos. Instalar la PWA facilita su uso; en iPhone/iPad se requiere agregarla a la pantalla de inicio y abrirla desde allí, con iOS/iPadOS 16.4 o posterior.

Al abrir por primera vez la app instalada con una cuenta autenticada, se muestra una invitación para activar las notificaciones si el dispositivo admite Web Push. El permiso nativo solo se solicita al pulsar **Activar notificaciones**. **Ahora no** cierra la invitación; la decisión se recuerda por usuario en el almacenamiento local de ese navegador y no se repite al recargar o cambiar de Space. Borrar ese almacenamiento permite que aparezca de nuevo. Los dispositivos ya activados no reciben la invitación y abrir la web en una pestaña normal no la dispara. Si hay un diálogo, una nota en edición o Focus inmersivo, la invitación espera a que se cierre esa vista.

La página de notificaciones muestra el estado del dispositivo, la acción de activación/desactivación y orientación si el navegador bloqueó el permiso o no admite push. Está disponible para todas las cuentas; no requiere permiso para administrar el workspace, usuarios ni roles. Los ajustes separan opciones personales, equipo y administración, con navegación lateral en escritorio y un selector compacto en móvil.

El historial permite ver solo sin leer, marcar un aviso o todos como leídos y abrir el pendiente en su Space. El botón de desactivación afecta solo al dispositivo actual. Cerrar sesión elimina su registro en el servidor; el navegador puede conservar el permiso pero no recibe nuevos envíos para esa cuenta. Cambiar contraseña, desactivar la cuenta o renovar su versión de sesión invalida los registros anteriores. Para reactivarlos se debe iniciar sesión y volver a activar los avisos. Límite: 20 dispositivos por cuenta.

Al abrir un aviso de otro Space se navega al enlace correspondiente. Un clic en la notificación del sistema solicita abrir AegiTasks sin navegar explícitamente una ventana existente. El sistema operativo puede reutilizar la instancia instalada de la PWA. Los enlaces conservan los controles normales de autenticación, membresía y permisos.

## Despliegue

El Compose existente ya conserva `/app/storage/keys` y `/app/storage/uploads` en el volumen `aegitasks-storage`. Al primer arranque se generan las claves VAPID y se guardan protegidas con Data Protection en `keys/webpush-vapid.json`. En los siguientes despliegues se reutilizan: **conservar el volumen completo de storage y la base de datos**, también en respaldos/restauraciones. No se necesita un proyecto Firebase, cuenta de Apple Developer ni Redis.

El servidor aplica la migración `TaskNotifications` automáticamente en PostgreSQL. SQLite local usa una actualización idempotente basada en el modelo y conserva los pendientes existentes. El dominio público requiere HTTPS. El servidor debe poder conectarse por HTTPS saliente a los proveedores push compatibles: Google/Chromium (`fcm.googleapis.com`), Mozilla (`updates.push.services.mozilla.com`), Apple (`*.push.apple.com`) y Windows (`*.notify.windows.com`). Las URLs de suscripción se validan contra estos proveedores y el cliente HTTP no sigue redirecciones.

El contacto VAPID usa `mailto:` con `SEED_ADMIN_EMAIL`; opcionalmente se puede configurar `Notifications__Subject` con un contacto válido. `Notifications__DeliveryEnabled=false` desactiva el procesamiento de envíos para pruebas locales; no se configura en el Compose de producción y no desactiva el historial.

## Persistencia y privacidad

La mutación, el aviso y sus entregas se guardan en la misma transacción. Una cola persistente procesa los envíos cada cinco segundos, con hasta ocho intentos y espera progresiva; las respuestas 404/410 eliminan la suscripción vencida. Avisos leídos, sesiones revocadas, acceso retirado y avisos de más de un día no se envían. Las entregas terminadas se limpian después de siete días; el historial permanece mientras exista el pendiente.

El payload push cifrado contiene únicamente identificadores de aviso/dispositivo. El service worker consulta la API con la sesión del navegador antes de mostrar el aviso. La notificación del sistema contiene el nombre del autor y el tipo de evento; títulos, descripciones, comentarios, archivos y notas permanecen dentro de la app. Si la API no está disponible o la sesión expiró, se omite el aviso del sistema y se conserva el historial autenticado. No se almacenan datos privados de avisos en el cache offline.

La cola tiene un único procesador, coherente con la instancia API del Compose actual. Escalar a varias instancias requiere agregar reclamación de entregas entre procesadores y un bus compartido para los eventos en tiempo real. Tras un corte entre aceptación del proveedor y confirmación en la base, un envío podría repetirse; el identificador de aviso se usa como `tag` para sustituir su notificación existente. La entrega push depende del navegador, conexión y restricciones de batería/No molestar; no es una alarma con horario garantizado.

## Validación

- `dotnet run --project server/AegiTasks.NotificationTests`: base SQLite real, persistencia/protección de claves, cola, reintentos, límite, revocación, rollback, actualización local y transporte WebPush con cifrado/VAPID sobre HTTP simulado.
- `node client/scripts/push-worker-tests.mjs`: autorización antes de mostrar, errores, identificadores, clics y origen de navegación.
- `AEGITASKS_TEST_ONLY=notifications node client/scripts/e2e.mjs`: reglas de destinatarios, historial, permisos, registro/desactivación, apertura y UI responsive. La suite completa también los incluye. Se simulan los permisos y PushManager de Chromium headless; no se contacta a proveedores reales.
- `AEGITASKS_TEST_ONLY=settings node client/scripts/e2e.mjs`: configuración, catálogos, navegación responsive e invitación al abrir la app instalada por primera vez. Verifica aceptar, posponer, permiso bloqueado, dispositivo ya activado y separación por usuario; el modo instalado y el permiso nativo se simulan.
- `node client/scripts/postgres-tests.mjs`: migraciones nuevas y de datos anteriores, seguido de la suite de API/navegador.

Estas pruebas no sustituyen la recepción en un dispositivo físico. Después de desplegar, activar avisos en PC, Android y iPhone; desde otra cuenta crear/editar/comentar/adjuntar evidencia a un pendiente asignado y uno sin responsable, con la app cerrada o en segundo plano. Comprobar recepción, clic, Space correcto y ausencia de avisos después de cerrar sesión o retirar acceso.
