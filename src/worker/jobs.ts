import type { PgBoss, WorkHandler } from "pg-boss";

/** Placeholder job proving the worker wiring. Real jobs call feature-module domain functions. */
export const NOOP_JOB = "noop";

type JobDefinition = {
  name: string;
  handler: WorkHandler<unknown>;
};

export const jobs: JobDefinition[] = [
  {
    name: NOOP_JOB,
    handler: async () => {},
  },
];

/** Creates each job's queue and attaches its handler. Returns the registered job names. */
export async function registerJobs(boss: PgBoss): Promise<string[]> {
  for (const job of jobs) {
    await boss.createQueue(job.name);
    await boss.work(job.name, job.handler);
  }
  return jobs.map((job) => job.name);
}
