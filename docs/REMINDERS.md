# Recordatorios

## Recordatorios del workspace

Abrir **Recordatorios** en la barra lateral; en móvil se encuentra en **Más → Recordatorios**. **Nuevo recordatorio** permite definir título, mensaje, destinatarios y programación. No utiliza estados de pendientes ni fecha de vencimiento. La fecha inicial indica desde cuándo comienza la programación.

El contexto inicial es **General del workspace**. Elegir un proyecto solo agrega contexto al mensaje: el recordatorio sigue perteneciendo al workspace y no requiere crear un pendiente. Se puede enviar a **Una persona**, **Todos en este espacio** o **Todos con acceso al proyecto**. Para una persona y un proyecto específicos se combinan Contexto y Destinatario. Los usuarios deben pertenecer al workspace y estar activos.

Los proyectos actuales comparten los miembros del workspace; no existen membresías independientes por proyecto. **Todos con acceso al proyecto** utiliza los miembros del espacio con permiso de página Proyectos. Los avisos siempre respetan también el permiso Recordatorios; los ligados a pendientes requieren acceso a Pendientes. La membresía, cuenta y permisos se verifican de nuevo al programar y al entregar el push. Los recordatorios del Space Personal permanecen privados, incluso frente a otro administrador.

Las tarjetas muestran el mensaje, destinatarios, contexto, frecuencia, zona y próxima ejecución. Permiten editar, pausar/activar y eliminar con confirmación. El selector distingue recordatorios independientes, ligados a pendientes o todos; la búsqueda y paginación limitan cada carga a 30 registros. Los cambios del equipo llegan por eventos en tiempo real. Si alguien modifica el registro durante la edición, se rechaza sobrescribirlo y se conserva el borrador para revisarlo.

## Recordatorios de pendientes

Guardar/abrir el pendiente y utilizar **Recordatorios** en su footer compacto. Se pueden crear varias programaciones para el mismo pendiente. El modo inicial avisa al **Responsable del pendiente**; si no hay responsable, avisa a todos los miembros con acceso. Se puede elegir un destinatario explícito o un grupo del workspace/proyecto. La asignación se consulta en cada ejecución; cambiar de responsable no obliga a recrear la programación.

El título del aviso es el título actual del pendiente. Un mensaje vacío utiliza «Tienes este pendiente por resolver». Crear o editar una programación no modifica el pendiente ni su versión, ni descarta el texto que se esté editando.

Los avisos se suspenden mientras el pendiente esté resuelto, archivado o su proyecto esté archivado. Al reabrirlo se conserva la secuencia y continúa en la siguiente ejecución; no se acumulan avisos del periodo suspendido. Al eliminar el pendiente se eliminan únicamente sus recordatorios ligados. Si se elimina un proyecto, sus recordatorios **independientes** conservan título y mensaje en el workspace, quedan sin proyecto y con la programación pausada para que una persona decida cómo reutilizarlos.

## Programación

- **Cada cierto tiempo:** intervalos de 1 a 10000 minutos, horas o días. Minutos/horas miden tiempo transcurrido desde la fecha inicial. Días conservan la hora local de esa fecha en la zona seleccionada, incluso al cambiar el horario de verano.
- **Días de la semana:** elegir uno o varios días, una hora y una zona horaria. La hora se aplica a esos días; la fecha inicial establece desde cuándo se puede enviar.
- **Una sola vez:** elegir una fecha futura; tras enviarlo el registro se conserva sin otra ejecución. Se puede editar la fecha para programar otro aviso.

La fecha inicial se introduce en la hora del dispositivo y se guarda en UTC. La zona seleccionada gobierna las horas/días de calendario; la tarjeta muestra la próxima fecha en esa misma zona. Si una hora local no existe por un cambio horario, se usa el primer minuto válido; una hora repetida genera solo un aviso.

No hay vencimiento automático de los recordatorios recurrentes. Pausar cancela próximas ejecuciones y bloquea pushes aún pendientes; reactivar calcula la siguiente fecha de la misma secuencia. Leer o limpiar un aviso no cancela la programación.

## Avisos y operación

El servidor ejecuta un worker cada 10 segundos; no depende de abrir una página, mantener una sesión de navegador ni un temporizador del teléfono. Cada ejecución guarda avisos y entregas push en una transacción junto con el avance de la programación. La reclamación condicional evita duplicar la misma ejecución ante reintentos/concurrencia. Tras una caída se emite como máximo una ejecución atrasada por programación y se continúa con la siguiente fecha, sin reproducir todos los intervalos perdidos.

Los avisos aparecen en la campanita. Para recibirlos con la app cerrada se debe activar **Ajustes → Notificaciones** en cada dispositivo; se reutilizan las suscripciones, claves persistentes, capacidades sin cookies y reintentos existentes. Un clic abre el pendiente o el recordatorio independiente en su workspace. El sistema operativo y proveedor push siguen controlando la entrega final; el servidor debe permanecer encendido. No se garantiza entrega en un segundo exacto.

Se agregó la página **Recordatorios** a los permisos de roles existentes y nuevos, habilitada por defecto; Admin puede revocarla desde Usuarios y roles. No requiere Redis, claves externas ni variables nuevas de Docker. El despliegue habitual aplica la migración PostgreSQL `Reminders`; el arranque de desarrollo actualiza SQLite de manera idempotente y conserva las notificaciones/entregas anteriores. Hacer el respaldo habitual antes de desplegar una migración. Las pruebas reproducen datos antiguos, horarios y entrega autorizada sin contactar un proveedor push externo.
