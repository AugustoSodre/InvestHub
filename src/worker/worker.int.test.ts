import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../../test/db";
import { NOOP_JOB } from "./jobs";
import { SCHEDULE_TIME_ZONE, schedule } from "./schedule";
import { startWorker, type Worker } from "./worker";

describe("worker", () => {
  let worker: Worker | undefined;

  afterEach(async () => {
    await worker?.stop();
    worker = undefined;
  });

  it("boots against Postgres, registers its jobs and logs that they are registered", async () => {
    const logs: string[] = [];
    worker = await startWorker({
      connectionString: testDatabaseUrl(),
      log: (line) => logs.push(line),
    });

    expect(await worker.boss.getQueue(NOOP_JOB)).not.toBeNull();
    expect(logs).toContain(`Jobs registered: ${NOOP_JOB}`);
  });

  it("runs the no-op job to completion", async () => {
    worker = await startWorker({ connectionString: testDatabaseUrl(), log: () => {} });

    const id = await worker.boss.send(NOOP_JOB, {});
    expect(id).toBeTruthy();

    let state: string | undefined;
    for (let attempt = 0; attempt < 100 && state !== "completed"; attempt++) {
      state = (await worker.boss.getJobById(NOOP_JOB, id!))?.state;
      if (state !== "completed") await sleep(100);
    }
    expect(state).toBe("completed");
  });

  it("closes its connections when registering a job fails", async () => {
    const failingJob = { name: "not a valid queue name!", handler: async () => {} };

    await expect(
      startWorker({ connectionString: testDatabaseUrl(), log: () => {}, jobs: [failingJob] }),
    ).rejects.toThrow();

    expect(await otherConnectionCount()).toBe(0);
  });

  it("schedules cron jobs in Brasília time", async () => {
    worker = await startWorker({ connectionString: testDatabaseUrl(), log: () => {} });

    await schedule(worker.boss, NOOP_JOB, "0 7 * * *");

    const [created] = await worker.boss.getSchedules(NOOP_JOB);
    expect(SCHEDULE_TIME_ZONE).toBe("America/Sao_Paulo");
    expect(created?.timezone).toBe("America/Sao_Paulo");
    expect(created?.cron).toBe("0 7 * * *");

    await worker.boss.unschedule(NOOP_JOB);
  });
});

/** Connections to this file's database other than the one asking. */
async function otherConnectionCount(): Promise<number> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    // ::int makes the driver return a JS number (count(*) is a bigint string).
    const { rows } = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
    );
    return rows[0]!.count;
  } finally {
    await client.end();
  }
}
