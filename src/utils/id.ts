// Utility to generate a reasonably unique id. Prefer crypto.randomUUID when available.
export function generateId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (globalThis as any).crypto !== 'undefined' && typeof (globalThis as any).crypto.randomUUID === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (globalThis as any).crypto.randomUUID();
    }
  } catch (e) {
    // ignore
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default generateId;
