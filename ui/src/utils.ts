export function fmtTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}
