/** "842 m" below a kilometre, "1.24 km" above. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.floor(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

/** "0:42" or "12:05". */
export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
