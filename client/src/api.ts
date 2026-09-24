import { holdAppUpdate } from './pwaUpdates';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let activeSpace = '';
export function setActiveSpace(id: string) {
  activeSpace = id;
}
export function getActiveSpace() {
  return activeSpace;
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const release = method !== 'GET' && method !== 'HEAD' ? holdAppUpdate() : () => {};
  try {
    const form = body instanceof FormData;
    const response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        'X-AegiTasks': '1',
        ...(activeSpace ? { 'X-Space-Id': activeSpace } : {}),
        ...(!form && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined && method !== 'GET' && method !== 'HEAD'
        ? { body: form ? body : JSON.stringify(body) }
        : {}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
        window.dispatchEvent(new Event('session-expired'));
      throw new ApiError(
        data.error ||
          (response.status === 401
            ? 'Tu sesión terminó. Ingresa de nuevo.'
            : response.status === 403
              ? 'No tienes permiso para realizar esta acción.'
              : response.status === 429
                ? 'Demasiados intentos. Intenta de nuevo en unos minutos.'
                : 'No se pudo completar la solicitud.'),
        response.status,
      );
    }
    return response.status === 204 ? (undefined as T) : await response.json();
  } finally {
    release();
  }
}
export const errorMessage = (e: unknown) =>
  e instanceof TypeError
    ? 'No hay conexión con el servidor. Tu información sigue en el formulario; intenta de nuevo.'
    : e instanceof Error
      ? e.message
      : 'Ocurrió un error. Intenta de nuevo.';
