export const gitEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const readErrorMessageFromResponse = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    console.warn('[Onboarding] Failed to read error message from response');
    return fallback;
  }
};
