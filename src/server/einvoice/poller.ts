import { eq } from "drizzle-orm";
import { db } from "@/db";
import { einvoiceSubmissions } from "@/db/schema";
import { refreshSubmissionStatus } from "./service";

const POLL_INTERVAL_MS = 30_000;

let started = false;

/**
 * In-process poller started from instrumentation.ts: while any submission is
 * awaiting LHDN validation, check its status every 30s.
 */
export function startEinvoicePoller(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const pending = await db.query.einvoiceSubmissions.findMany({
        where: eq(einvoiceSubmissions.status, "submitted"),
        limit: 25,
      });
      for (const submission of pending) {
        try {
          await refreshSubmissionStatus(submission.id);
        } catch (err) {
          console.error(`[einvoice-poller] failed to refresh ${submission.id}:`, err);
        }
      }
    } catch (err) {
      // DB not migrated yet or connection refused — log and keep polling.
      console.error("[einvoice-poller] tick failed:", err);
    }
  };

  setInterval(tick, POLL_INTERVAL_MS);
  void tick();
}
