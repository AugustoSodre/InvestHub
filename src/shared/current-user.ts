/**
 * The single v1 user (the owner). Migration 0002 seeds this row; there is no
 * signup or auth yet, so every request acts as this user.
 */
export const SEEDED_USER_ID = "00000000-0000-0000-0000-000000000001";

/** The user the current request acts for. One place to swap in auth later. */
export function currentUserId(): string {
  return SEEDED_USER_ID;
}
