export const noteDiagrams = [
  {
    id: 'flow',
    name: 'Diagrama de flujo',
    source:
      'flowchart TD\n  A[Reportar problema] --> B{¿Reproducible?}\n  B -->|Sí| C[Resolver]\n  B -->|No| D[Solicitar información]\n  C --> E[Verificar]',
  },
  {
    id: 'sequence',
    name: 'Secuencia',
    source:
      'sequenceDiagram\n  participant U as Usuario\n  participant A as API\n  participant D as Base de datos\n  U->>A: Consultar pendientes\n  A->>D: Leer datos\n  D-->>A: Resultados\n  A-->>U: Mostrar pendientes',
  },
  {
    id: 'mindmap',
    name: 'Mapa mental',
    source:
      'mindmap\n  root((Proyecto))\n    Pendientes\n      Bugs\n      Mejoras\n    Documentación\n    Entregas',
  },
  {
    id: 'er',
    name: 'Entidades y relaciones',
    source:
      'erDiagram\n  PROYECTO ||--o{ PENDIENTE : contiene\n  USUARIO ||--o{ PENDIENTE : resuelve\n  PENDIENTE {\n    string titulo\n    string estado\n  }',
  },
  {
    id: 'gantt',
    name: 'Cronograma',
    source:
      'gantt\n  title Plan de trabajo\n  dateFormat YYYY-MM-DD\n  section Entrega\n  Análisis :a1, 2026-01-01, 3d\n  Desarrollo :after a1, 5d\n  Validación :3d',
  },
  {
    id: 'pie',
    name: 'Gráfico circular',
    source:
      'pie showData\n  title Pendientes por tipo\n  "Bugs" : 8\n  "Mejoras" : 5\n  "Documentación" : 3',
  },
  {
    id: 'bar',
    name: 'Gráfico de barras',
    source:
      'xychart-beta\n  title "Avance semanal"\n  x-axis [Lun, Mar, Mie, Jue, Vie]\n  y-axis "Pendientes" 0 --> 10\n  bar [3, 6, 4, 8, 5]',
  },
];
