# Repository Master Rules

## Stack & Architecture Guidelines
- **Backend (`/backend`):** Python 3.11 with Flask 3.1 & Supabase (`supabase-py`). REST endpoints strictly in `app.py`. Scraper logic in `logic.py`.
- **Frontend (`/frontend`):** React 19 + TypeScript 5.8 + Vite 7 (PWA). Keep components in `frontend/src/`. Enforce strict TypeScript typing (`noUncheckedSideEffectImports`, `erasableSyntaxOnly`).
- **Database:** Supabase Postgres via direct SQL/RPC queries. No ORM. Always verify read-only vs production database environments.
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`) and `motion` for animations.

## Orchestration Rules
1. **Single Point of Entry:** Operate as the lead systems architect.
2. **Phase Execution:** For non-trivial tasks, run:
   - **Phase 1 (Plan):** Analyze `@workspace` and available skills (`writing-plans`, `brainstorming`).
   - **Phase 2 (Build):** Execute backend (`backend/app.py`) and frontend (`frontend/src/`) changes cleanly. Validate with `pnpm lint` and `pnpm build`.
   - **Phase 3 (Audit):** Check code against `owasp-security` and `react-best-practices`.