// Editable starting points for the diagram families bundled with Mermaid 11.17.2.
export const noteDiagrams = [
  {
    id: 'flow',
    name: 'Diagrama de flujo',
    source:
      'flowchart TD\n  A[Reportar problema] --> B{¿Reproducible?}\n  B -->|Sí| C[Resolver]\n  B -->|No| D[Solicitar información]\n  C --> E[Verificar]',
    category: 'Procesos',
  },
  {
    id: 'sequence',
    name: 'Secuencia',
    source:
      'sequenceDiagram\n  participant U as Usuario\n  participant A as API\n  participant D as Base de datos\n  U->>A: Consultar pendientes\n  A->>D: Leer datos\n  D-->>A: Resultados\n  A-->>U: Mostrar pendientes',
    category: 'Software y datos',
  },
  {
    id: 'mindmap',
    name: 'Mapa mental',
    source:
      'mindmap\n  root((Proyecto))\n    Pendientes\n      Bugs\n      Mejoras\n    Documentación\n    Entregas',
    category: 'Ideas y estrategia',
  },
  {
    id: 'er',
    name: 'Entidades y relaciones',
    source:
      'erDiagram\n  PROYECTO ||--o{ PENDIENTE : contiene\n  USUARIO ||--o{ PENDIENTE : resuelve\n  PENDIENTE {\n    string titulo\n    string estado\n  }',
    category: 'Software y datos',
  },
  {
    id: 'gantt',
    name: 'Cronograma',
    source:
      'gantt\n  title Plan de trabajo\n  dateFormat YYYY-MM-DD\n  section Entrega\n  Análisis :a1, 2026-01-01, 3d\n  Desarrollo :after a1, 5d\n  Validación :3d',
    category: 'Planificación',
  },
  {
    id: 'pie',
    name: 'Gráfico circular',
    source:
      'pie showData\n  title Pendientes por tipo\n  "Bugs" : 8\n  "Mejoras" : 5\n  "Documentación" : 3',
    category: 'Métricas',
  },
  {
    id: 'bar',
    name: 'Gráfico de barras',
    source:
      'xychart-beta\n  title "Avance semanal"\n  x-axis [Lun, Mar, Mie, Jue, Vie]\n  y-axis "Pendientes" 0 --> 10\n  bar [3, 6, 4, 8, 5]',
    category: 'Métricas',
  },
  {
    id: 'class',
    name: 'Clases UML',
    category: 'Software y datos',
    source:
      'classDiagram\n  class Proyecto {\n    +string nombre\n    +agregarPendiente()\n  }\n  class Pendiente {\n    +string titulo\n    +completar()\n  }\n  Proyecto "1" --> "*" Pendiente : contiene',
  },
  {
    id: 'state',
    name: 'Estados',
    category: 'Procesos',
    source:
      'stateDiagram-v2\n  [*] --> Pendiente\n  Pendiente --> EnProgreso : iniciar\n  EnProgreso --> Revision : resolver\n  Revision --> EnProgreso : corregir\n  Revision --> Completado : aprobar\n  Completado --> [*]',
  },
  {
    id: 'swimlane',
    name: 'Carriles por responsable',
    category: 'Procesos',
    source:
      'swimlane-beta LR\n  subgraph Soporte\n    A[Registrar problema]\n    D[Confirmar solución]\n  end\n  subgraph Desarrollo\n    B[Diagnosticar]\n    C[Corregir]\n  end\n  A --> B --> C --> D',
  },
  {
    id: 'flow-advanced',
    name: 'Flujo con grupos y estilos',
    category: 'Procesos',
    source:
      'flowchart LR\n  accTitle: Procesamiento de una solicitud\n  accDescr: La API valida, persiste y devuelve el resultado.\n  subgraph Cliente\n    A[Enviar solicitud]\n  end\n  subgraph Servicios\n    B{¿Válida?} -->|Sí| C[(Base de datos)]\n    B -->|No| D[Mostrar error]\n  end\n  A --> B\n  C -.-> E[Notificar]\n  classDef destacado fill:#ede9fe,stroke:#7c3aed,color:#3b0764\n  class C destacado',
  },
  {
    id: 'journey',
    name: 'Recorrido del usuario',
    category: 'Procesos',
    source:
      'journey\n  title Atención de un reporte\n  section Soporte\n    Registrar problema: 4: Usuario, Soporte\n    Reproducir: 3: Soporte\n  section Solución\n    Corregir: 4: Desarrollo\n    Verificar: 5: Usuario, Soporte',
  },
  {
    id: 'timeline',
    name: 'Línea del tiempo',
    category: 'Planificación',
    source:
      'timeline\n  title Evolución del proyecto\n  section Primera entrega\n    Enero : Análisis : Prototipo\n    Febrero : Desarrollo\n  section Lanzamiento\n    Marzo : Validación : Publicación',
  },
  {
    id: 'kanban',
    name: 'Tablero Kanban',
    category: 'Planificación',
    source:
      'kanban\n  todo[Por hacer]\n    a[Documentar API]\n    b[Revisar permisos]\n  doing[En progreso]\n    c[Mejorar editor]\n  done[Completado]\n    d[Preparar entorno]',
  },
  {
    id: 'quadrant',
    name: 'Matriz de prioridades',
    category: 'Ideas y estrategia',
    source:
      'quadrantChart\n  title Impacto y esfuerzo\n  x-axis Poco esfuerzo --> Mucho esfuerzo\n  y-axis Bajo impacto --> Alto impacto\n  quadrant-1 Planificar\n  quadrant-2 Priorizar\n  quadrant-3 Complementar\n  quadrant-4 Reconsiderar\n  Documentar: [0.2, 0.7]\n  Migrar: [0.8, 0.8]\n  Pulir: [0.3, 0.2]',
  },
  {
    id: 'requirement',
    name: 'Requisitos y verificación',
    category: 'Software y datos',
    source:
      'requirementDiagram\n  requirement acceso {\n    id: ACC01\n    text: Solo miembros pueden leer el espacio\n    risk: high\n    verifymethod: test\n  }\n  element prueba {\n    type: integration\n  }\n  prueba - verifies -> acceso',
  },
  {
    id: 'git',
    name: 'Ramas de Git',
    category: 'Software y datos',
    source:
      'gitGraph\n  commit id: "inicio"\n  branch feature\n  checkout feature\n  commit id: "editor"\n  commit id: "pruebas"\n  checkout main\n  merge feature\n  commit id: "entrega"',
  },
  {
    id: 'block',
    name: 'Bloques',
    category: 'Software y datos',
    source:
      'block-beta\n  columns 3\n  cliente["Cliente"] api["API"] datos[("Datos")]\n  cliente --> api\n  api --> datos',
  },
  {
    id: 'architecture',
    name: 'Infraestructura',
    category: 'Software y datos',
    source:
      'architecture-beta\n  group sistema(cloud)[Sistema]\n  service api(server)[API] in sistema\n  service db(database)[Datos] in sistema\n  service files(disk)[Archivos] in sistema\n  api:R -- L:db\n  api:B -- T:files',
  },
  {
    id: 'event',
    name: 'Modelado de eventos',
    category: 'Software y datos',
    source:
      'eventmodeling\n  tf 01 ui Formulario\n  tf 02 cmd CrearPendiente { titulo: string }\n  tf 03 evt PendienteCreado { titulo: string }\n  tf 04 rmo Bandeja\n  tf 05 ui ListaPendientes',
  },
  {
    id: 'packet',
    name: 'Paquetes de red',
    category: 'Software y datos',
    source:
      'packet-beta\n  title Cabecera UDP\n  0-15: "Puerto origen"\n  16-31: "Puerto destino"\n  32-47: "Longitud"\n  48-63: "Checksum"\n  64-95: "Datos"',
  },
  {
    id: 'tree',
    name: 'Árbol de archivos',
    category: 'Software y datos',
    source:
      'treeView-beta\n  proyecto/\n    src/\n      components/\n      api.ts\n    tests/\n      notes.test.ts\n    README.md',
  },
  {
    id: 'line',
    name: 'Gráfico de líneas',
    category: 'Métricas',
    source:
      'xychart-beta\n  title "Tiempo de respuesta"\n  x-axis [Lun, Mar, Mie, Jue, Vie]\n  y-axis "Milisegundos" 0 --> 200\n  line [180, 150, 160, 110, 90]',
  },
  {
    id: 'sankey',
    name: 'Flujo Sankey',
    category: 'Métricas',
    source:
      'sankey-beta\n  Soporte,Bugs,12\n  Soporte,Mejoras,8\n  Bugs,Resueltos,9\n  Bugs,Pendientes,3\n  Mejoras,Resueltos,5\n  Mejoras,Pendientes,3',
  },
  {
    id: 'radar',
    name: 'Radar comparativo',
    category: 'Métricas',
    source:
      'radar-beta\n  title Calidad del producto\n  axis a["Rendimiento"], b["Accesibilidad"], c["Pruebas"], d["Documentación"]\n  curve actual["Actual"]{4, 3, 4, 2}\n  curve objetivo["Objetivo"]{5, 5, 5, 5}\n  max 5\n  graticule polygon',
  },
  {
    id: 'treemap',
    name: 'Mapa de áreas',
    category: 'Métricas',
    source:
      'treemap-beta\n  "Pendientes"\n    "Bugs": 12\n    "Mejoras": 8\n  "Documentación"\n    "Guías": 6\n    "Referencias": 4',
  },
  {
    id: 'venn',
    name: 'Conjuntos de Venn',
    category: 'Ideas y estrategia',
    source:
      'venn-beta\n  title "Responsabilidades"\n  set Soporte["Soporte"]:20\n  set Desarrollo["Desarrollo"]:18\n  union Soporte,Desarrollo["Diagnóstico"]:6',
  },
  {
    id: 'ishikawa',
    name: 'Causas y efecto · Ishikawa',
    category: 'Ideas y estrategia',
    source:
      'ishikawa-beta\n  Respuesta lenta\n  Aplicación\n    Consultas repetidas\n    Falta de caché\n  Infraestructura\n    Latencia de red\n    Recursos limitados\n  Proceso\n    Medición insuficiente',
  },
  {
    id: 'wardley',
    name: 'Mapa Wardley',
    category: 'Ideas y estrategia',
    source:
      'wardley-beta\n  title Evolución de la plataforma\n  anchor Usuario [0.95, 0.6]\n  component Aplicacion [0.75, 0.4]\n  component API [0.5, 0.55]\n  component Infraestructura [0.2, 0.8]\n  Usuario -> Aplicacion\n  Aplicacion -> API\n  API -> Infraestructura\n  evolve API 0.8',
  },
  {
    id: 'cynefin',
    name: 'Marco Cynefin',
    category: 'Ideas y estrategia',
    source:
      'cynefin-beta\n  title Clasificar incidentes\n  complex\n    "Explorar una falla intermitente"\n  complicated\n    "Analizar rendimiento"\n  clear\n    "Aplicar solución conocida"\n  chaotic\n    "Restablecer servicio"\n  confusion\n    "Identificar el problema"\n  complicated --> clear : "Documentar solución"',
  },
  {
    id: 'c4-context',
    name: 'C4 · Contexto',
    category: 'Arquitectura C4',
    source:
      'C4Context\n  title Contexto de AegiTasks\n  Person(equipo, "Equipo", "Reporta y resuelve pendientes")\n  System(app, "AegiTasks", "Organización del trabajo")\n  Rel(equipo, app, "Gestiona notas y pendientes")',
  },
  {
    id: 'c4-container',
    name: 'C4 · Contenedores',
    category: 'Arquitectura C4',
    source:
      'C4Container\n  title Contenedores\n  Person(equipo, "Equipo")\n  System_Boundary(sistema, "AegiTasks") {\n    Container(web, "Web", "PWA", "Interfaz de usuario")\n    Container(api, "API", "HTTP", "Reglas de negocio")\n    ContainerDb(db, "Datos", "SQL", "Persistencia")\n  }\n  Rel(equipo, web, "Usa")\n  Rel(web, api, "Consulta")\n  Rel(api, db, "Lee y escribe")',
  },
  {
    id: 'c4-component',
    name: 'C4 · Componentes',
    category: 'Arquitectura C4',
    source:
      'C4Component\n  title Componentes de la API\n  Container_Boundary(api, "API") {\n    Component(endpoint, "Notas", "HTTP", "Recibe solicitudes")\n    Component(servicio, "Servicio", "Aplicación", "Valida reglas")\n    Component(repo, "Repositorio", "SQL", "Guarda notas")\n  }\n  Rel(endpoint, servicio, "Ejecuta")\n  Rel(servicio, repo, "Persiste")',
  },
  {
    id: 'c4-dynamic',
    name: 'C4 · Interacción dinámica',
    category: 'Arquitectura C4',
    source:
      'C4Dynamic\n  title Guardar una nota\n  Container(web, "Editor", "PWA")\n  Container(api, "API", "HTTP")\n  ContainerDb(db, "Datos", "SQL")\n  Rel(web, api, "Enviar nota")\n  Rel(api, db, "Guardar cambios")',
  },
  {
    id: 'c4-deployment',
    name: 'C4 · Despliegue',
    category: 'Arquitectura C4',
    source:
      'C4Deployment\n  title Despliegue\n  Deployment_Node(host, "Servidor", "Linux") {\n    Deployment_Node(docker, "Contenedores", "Docker") {\n      Container(web, "Web", "Nginx", "PWA")\n      Container(api, "API", "ASP.NET", "Servicios")\n      ContainerDb(db, "Datos", "PostgreSQL", "Persistencia")\n    }\n  }\n  Rel(web, api, "HTTP")\n  Rel(api, db, "SQL")',
  },
  {
    id: 'railroad',
    name: 'Gramática · Primitivas',
    category: 'Gramáticas',
    source:
      'railroad-beta\n  title Comando de consulta\n  consulta = sequence(terminal("buscar"), nonterminal("campo"), optional(terminal("asc"))) ;\n  campo = choice(terminal("titulo"), terminal("fecha")) ;',
  },
  {
    id: 'ebnf',
    name: 'Gramática · EBNF',
    category: 'Gramáticas',
    source:
      'railroad-ebnf-beta\n  title Filtro de pendientes\n  filtro = campo "=" valor ;\n  campo = "estado" | "proyecto" ;\n  valor = "abierto" | "editor" ;',
  },
  {
    id: 'abnf',
    name: 'Gramática · ABNF',
    category: 'Gramáticas',
    source: 'railroad-abnf-beta\n  title Identificador de ticket\n  ticket = "TASK-" 1*DIGIT ;',
  },
  {
    id: 'peg',
    name: 'Gramática · PEG',
    category: 'Gramáticas',
    source:
      'railroad-peg-beta\n  title Expresión de búsqueda\n  Consulta <- Campo ":" Valor ;\n  Campo <- "estado" / "proyecto" ;\n  Valor <- "abierto" / "editor" ;',
  },
];
export const noteDiagramCategories = [...new Set(noteDiagrams.map((diagram) => diagram.category))];
