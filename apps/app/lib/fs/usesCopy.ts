/**
 * Whether this device keeps a copy: on Android (its folder is slow to read), unless this browser says
 * otherwise ("isostride.mirror": "on" or "off", for a test).
 */
export function usesCopy(): boolean {
  try {
    const said = localStorage.getItem('isostride.mirror');
    if (said === 'on') return true;
    if (said === 'off') return false;
  } catch {
    // No storage (a worker): the page says, by the request.
  }
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}
