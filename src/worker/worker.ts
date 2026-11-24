import { PgBoss } from "pg-boss";
import { jobs as defaultJobs, registerJobs, type JobDefinition } from "./jobs";

export type Worker = {
  boss: PgBoss;
  /** Stops polling and waits for running jobs to finish. */
  stop: () => Promise<void>;
};

type WorkerOptions = {
  connectionString: string;
  log?: (line: string) => void;
  jobs?: JobDefinition[];
};

/** Connects pg-boss to Postgres (creating its schema if needed) and registers every job. */
export async function startWorker({
  connectionString,
  log = console.log,
  jobs = defaultJobs,
}: WorkerOptions): Promise<Worker> {
  const boss = new PgBoss(connectionString);
  boss.on("error", (error) => console.error("[worker] pg-boss error", error));

  await boss.start();
  let names: string[];
  try {
    names = await registerJobs(boss, jobs);
  } catch (error) {
    // The caller never gets a Worker to stop, so close the pool here or it leaks.
    await boss.stop({ graceful: false });
    throw error;
  }
  log(`Jobs registered: ${names.join(", ")}`);

  return {
    boss,
    stop: () => boss.stop({ graceful: true }),
  };
}
