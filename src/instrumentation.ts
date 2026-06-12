export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEinvoicePoller } = await import("./server/einvoice/poller");
    startEinvoicePoller();
  }
}
