/** MyInvois requires IssueDate (yyyy-MM-dd) and IssueTime (HH:mm:ssZ) in UTC. */
export function utcIssueDateTime(now: Date = new Date()): { issueDate: string; issueTime: string } {
  const iso = now.toISOString(); // 2026-06-12T07:30:15.123Z
  return {
    issueDate: iso.slice(0, 10),
    issueTime: `${iso.slice(11, 19)}Z`,
  };
}

/** Format a date for display as dd/MM/yyyy (Malaysian convention). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Today's date as yyyy-MM-dd in local time, for date input defaults. */
export function todayLocalISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function hoursSince(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}
