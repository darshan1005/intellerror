export function getRuntimeUptime(): number {
  const processValue = (globalThis as { process?: { uptime?: () => number } }).process;
  try {
    return typeof processValue?.uptime === 'function' ? processValue.uptime() : 0;
  } catch {
    return 0;
  }
}
