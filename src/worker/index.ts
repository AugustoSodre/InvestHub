// Entry point for `pnpm worker`: a plain Node process next to the Next.js app.
import { serverEnv } from "@/shared/env";
import { startWorker } from "./worker";

const worker = await startWorker({ connectionString: serverEnv().databaseUrl });
console.log("Worker started. Press Ctrl+C to stop.");

let stopping = false;
async function shutdown(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, stopping worker...`);
  try {
    await worker.stop();
    console.log("Worker stopped.");
    process.exit(0);
  } catch (error) {
    console.error("Worker failed to stop cleanly", error);
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
