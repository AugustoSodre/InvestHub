import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// pg-boss evaluates cron in UTC unless `tz` is set. Every schedule must go
// through schedule() in src/worker/schedule.ts, which sets America/Sao_Paulo,
// so a direct `.schedule(` call anywhere else is a lint error.
const eslint = new ESLint({ cwd: process.cwd() });

const DIRECT_SCHEDULE = 'export const run = (boss: any) => boss.schedule("job", "0 7 * * *");\n';

async function scheduleErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter(
    (m) => m.ruleId === "no-restricted-syntax" && /schedule\(\)/.test(m.message),
  );
}

describe("schedules go through schedule()", () => {
  it.each(["src/worker/jobs.ts", "src/features/research/digest.ts", "src/worker/index.ts"])(
    "flags a direct .schedule( call in %s",
    async (filePath) => {
      const errors = await scheduleErrors(filePath, DIRECT_SCHEDULE);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe(2);
    },
  );

  it.each([
    'export const run = (boss: any) => boss.schedule("job", "0 7 * * *");\n',
    'export const run = (pgBoss: any) => pgBoss.schedule("job", "0 7 * * *");\n',
    'export const run = (worker: any) => worker.boss.schedule("job", "0 7 * * *");\n',
    'export class Jobs {\n  boss: any;\n  run() {\n    return this.boss.schedule("job", "0 7 * * *");\n  }\n}\n',
  ])("flags a direct pg-boss schedule call: %s", async (code) => {
    expect(await scheduleErrors("src/worker/jobs.ts", code)).toHaveLength(1);
  });

  it("allows .schedule( on objects that are not pg-boss, such as a bond", async () => {
    const errors = await scheduleErrors(
      "src/features/fixed-income/coupons.ts",
      "export const coupons = (bond: any) => bond.schedule();\n",
    );
    expect(errors).toHaveLength(0);
  });

  it("allows the call inside src/worker/schedule.ts", async () => {
    expect(await scheduleErrors("src/worker/schedule.ts", DIRECT_SCHEDULE)).toHaveLength(0);
  });

  it("allows calling the schedule() helper itself", async () => {
    const errors = await scheduleErrors(
      "src/worker/jobs.ts",
      'import { schedule } from "./schedule";\nexport const run = (boss: never) => schedule(boss, "job", "0 7 * * *");\n',
    );
    expect(errors).toHaveLength(0);
  });
});
