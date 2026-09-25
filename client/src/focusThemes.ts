export const focusThemes = [
  { id: 'aurora', name: 'Aurora · formas suaves' },
  { id: 'waves', name: 'Waves · ondas de calma' },
  { id: 'terminal', name: 'Terminal · coding flow' },
  { id: 'fireflies', name: 'Luciérnagas · luces flotantes' },
  { id: 'breeze', name: 'Brisa auroral · cintas de luz' },
  { id: 'constellation', name: 'Constelaciones · puntos conectados' },
  { id: 'codeRain', name: 'Lluvia de código · símbolos en caída' },
  { id: 'geometry', name: 'Geometría sonora · partículas y espectro' },
] as const;

export const particleShapes = [
  { id: 'mixed', name: 'Combinadas' },
  { id: 'circles', name: 'Círculos' },
  { id: 'triangles', name: 'Triángulos' },
  { id: 'squares', name: 'Cuadrados' },
  { id: 'hexagons', name: 'Hexágonos' },
] as const;

export function hasCustomVisual(theme: string) {
  return focusThemes.slice(3).some((t) => t.id === theme);
}
