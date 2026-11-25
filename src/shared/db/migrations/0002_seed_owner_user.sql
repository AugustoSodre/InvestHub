-- v1 has a single user (the owner) and no auth. Seed that user with a fixed id so
-- every user-owned row can reference it. Keep in sync with SEEDED_USER_ID in
-- src/shared/current-user.ts.
INSERT INTO "users" ("id") VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT ("id") DO NOTHING;
