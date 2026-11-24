import { PgBoss } from "pg-boss";
import { registerJobs } from "./jobs";

export type Worker = {
  boss: PgBoss;
  /** Stops polling and waits for running jobs to finish. */
  stop: () => Promise<void>;
};

type WorkerOptions = {
  connectionString: string;
  log?: (line: string) => void;
};

/** Connects pg-boss to Postgres (creating its schema if needed) and registers every job. */
export async function startWorker({
  connectionString,
  log = console.log,
}: WorkerOptions): Promise<Worker> {
  const boss = new PgBoss(connectionString);
  boss.on("error", (error) => console.error("[worker] pg-boss error", error));

  await boss.start();
  const names = await registerJobs(boss);
  log(`Jobs registered: ${names.join(", ")}`);

  return {
    boss,
    stop: () => boss.stop({ graceful: true }),
  };
}
