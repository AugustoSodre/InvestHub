import type { PgBoss, ScheduleOptions } from "pg-boss";

/** pg-boss evaluates cron in UTC unless told otherwise; our schedules are Brasília time. */
export const SCHEDULE_TIME_ZONE = "America/Sao_Paulo";

/**
 * The only way to create a schedule: it always sets `tz`, so "0 7 * * *" means
 * 07:00 in São Paulo, not 04:00.
 */
export function schedule(
  boss: PgBoss,
  name: string,
  cron: string,
  data?: object,
  options: Omit<ScheduleOptions, "tz"> = {},
): Promise<void> {
  return boss.schedule(name, cron, data ?? null, { ...options, tz: SCHEDULE_TIME_ZONE });
}
