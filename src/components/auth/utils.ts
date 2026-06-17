import type { ApiErrorPayload } from './types';

export async function parseJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    console.warn('[auth] Failed to parse JSON response');
    return null;
  }
}

export function resolveApiErrorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  if (!payload) {
    return fallback;
  }

  return payload.error ?? payload.message ?? fallback;
}
