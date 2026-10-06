import type { EstimateKind, TaskItem } from './types';

export const estimateKinds: Record<EstimateKind, string> = {
  none: 'Sin estimación',
  time: 'Tiempo',
  points: 'Story points',
  fibonacci: 'Puntos Fibonacci',
  linear: 'Puntos lineales',
  categories: 'Categorías (XS–XL)',
};
export const fibonacciPoints = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
export const linearPoints = Array.from({ length: 11 }, (_, i) => i);
export const estimateCategories = ['XS', 'S', 'M', 'L', 'XL'];
export function estimateLabel(task: TaskItem) {
  if (task.estimateKind === 'categories')
    return task.estimateCategory ? `Tamaño ${task.estimateCategory}` : '';
  if (['points', 'fibonacci', 'linear'].includes(task.estimateKind))
    return task.estimatePoints != null ? `${task.estimatePoints} pts` : '';
  return task.estimateMinutes != null ? `${task.estimateMinutes} min` : '';
}
