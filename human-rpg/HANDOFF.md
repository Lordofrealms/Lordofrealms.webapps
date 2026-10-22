# Future chat handoff

Read in order: root `AGENTS.md`, app `AGENTS.md`, `PROJECT_STATE.md`, `docs/PLAN.md`, `docs/DESIGN.md`, `docs/DECISIONS.md`.

The owner completed an extensive design discussion. Do not ask them to repeat it. The latest decisions are income-relative reward anchors (L10 .2%, L20 1%, L30 10%, L40 50%, L50 100%) and at most one legendary bonus per target skill, while allowing rewards to cascade into other skills. Every five character levels grants one free attribute point. Skill 50 means historic world-best, regardless of age group. Current skill XP can decay, permanent character XP/credits cannot. Read the precise rules before working.

This checkpoint intentionally precedes application implementation. The owner explicitly required documentation and an action plan in the repository FIRST. Commit the documentation as its own checkpoint before writing application source.

Use `human-rpg-dev`, based on the recorded main SHA, and keep existing apps untouched. All user-facing versions use single-digit X.Y.Z. Begin at 0.1.0. Do not create a separate Sites project or move this repository's source into Library; the source is GitHub-backed.

Update this file and project state with the real completed steps, test results, remote commit, remaining work, and next command before handing off again. Never claim partner integrations, reviewed world-class standards, or live deployment unless actually completed.
