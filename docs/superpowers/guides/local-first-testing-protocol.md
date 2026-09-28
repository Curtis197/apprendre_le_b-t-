# Mandatory Protocol: Local-First Testing for Database, SQL, RLS & Edge Functions

**Scope:** Applies to all database schema changes, SQL functions, RLS security policies, and Supabase Edge Functions across all project phases.

---

## Strict Execution Sequence

Every migration and backend security change MUST strictly follow this 3-step sequence:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. WRITE                                                                  │
│    Create migration in supabase/migrations/YYYYMMDDHHMMSS_name.sql        │
│    Create RLS Vitest test file in web/__tests__/rls/                      │
└─────────────────────┬─────────────────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 2. LOCAL TEST (MANDATORY BEFORE REMOTE)                                   │
│    a. npx supabase migration up  -> Apply to local Docker Postgres        │
│    b. npm run test:rls           -> Execute Vitest suite against local DB  │
│    c. supabase functions serve   -> Test Edge Functions locally (if used) │
│    d. Confirm 100% test pass locally                                      │
└─────────────────────┬─────────────────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 3. REMOTE DEPLOY                                                          │
│    Apply migration to remote Supabase DB via supabase-mcp-server          │
│    Deploy Edge Functions to remote project (if used)                      │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Environment & Tooling Requirements

1. **Local Supabase Stack**:
   - Local Postgres port: `54322`
   - Local REST API: `http://127.0.0.1:54321`
   - Start local stack before testing: `npx supabase start`

2. **Test Command**:
   - `npm run test:rls` (runs `web/scripts/test-rls.mjs` with local environment credentials injected from `supabase status -o env`).

3. **RLS Verification Invariants**:
   - Test anonymous (`anon`) role access.
   - Test non-owner authenticated user access.
   - Test course owner / resource author access.
   - Test admin role access (`is_admin()`).
   - Verify sensitive tables (e.g., `quiz_answer_keys`) reject `SELECT` queries from non-owners.

---

## Enforcement Checklist for Plans & Agents

- [ ] Local Supabase stack is running (`npx supabase status`).
- [ ] Migration applied to local database first (`npx supabase migration up`).
- [ ] Local RLS Vitest suite passes 100% (`npm run test:rls`).
- [ ] Remote migration applied via MCP only AFTER local test suite clean run.
