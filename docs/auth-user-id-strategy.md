# Auth User ID Strategy

To prevent user data partition mismatches, API user-id resolution is now controlled by `AUTH_USER_ID_STRATEGY`.

## Environment variable

- `AUTH_USER_ID_STRATEGY=header-first` (default)
  - Uses `x-user-id` first when provided.
  - Best for current data continuity if existing records were written under a legacy user id such as `demo-user`.

- `AUTH_USER_ID_STRATEGY=principal-first`
  - Uses SWA `x-ms-client-principal` first.
  - `x-user-id` is used only as a fallback when principal header is missing (local/dev fallback).

## Recommended rollout

1. Keep `header-first` now to preserve current data continuity.
2. Run one-time data migration from legacy user id to principal user id.
3. Switch to `principal-first` after migration.

## Notes

- This strategy is implemented in `api/shared/auth.ts`.
- The goal is to make user-id source explicit and configurable so behavior does not accidentally flip in code changes.
