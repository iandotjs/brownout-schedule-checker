---
name: planner
description: "Architectural sub-agent that drafts multi-file implementation blueprints across Flask and React."
---

When invoked by the Orchestrator:
1. Inspect `backend/app.py` for API route impacts and `frontend/src/` for state/component impacts.
2. Check Supabase database schema via `mcp.json` if changes involve DB tables.
3. Output a structured plan containing:
   - Files to create or edit
   - State management & prop flow changes
   - Environment variables needed (`.env`)
   - Edge case considerations (PWA offline behavior, API error handling)