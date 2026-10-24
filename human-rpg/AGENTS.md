# Human RPG working instructions

Read `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/PLAN.md`, `PROJECT_STATE.md`, and `HANDOFF.md` before changing this app. Preserve approved decisions; update these records with every meaningful checkpoint.

- Root version rules apply: exactly X.Y.Z, each component a single digit. Increment Z for ordinary updates; Y only for a substantial redesign or carry from Z=9. Keep schema integers separate.
- All implementation stays under `human-rpg/`, apart from a narrowly scoped CI workflow if needed. No changes to other apps' storage, service workers, or root deployment behavior.
- Keep local data local. No external fonts, analytics, CDNs, hidden network requests, or uploaded photos/profile data. External reference links are user initiated.
- Use exact integer arithmetic for XP. Level 50 exceeds JavaScript's safe integer range. Serialize XP as validated decimal strings. Use integer hundredths for credits.
- Derive state from recorded events where practical. Rewards are idempotent and legendary bonuses are non-stacking per target skill. Tests must cover cascades, decay, recovery, backdating, and restore rejection.
- Never silently replace a damaged database with an empty character. Block mutations and offer export/recovery when persistence fails. Restore validates before replacing and preserves a recovery copy.
- Every skill remains tracked when interests change. Passed gateways and photo milestones survive decay. Previously paid rewards cannot be farmed through recovery, reassessment, equipment changes, or restore replay.
- Do not portray generic challenge templates as independently validated expert/world-champion standards. Record source coverage and editorial gaps honestly.
- Update plan checkboxes only with evidence. A passing logic test is not browser validation. A branch/PR is not a live deployment.
- Warn before any migration/reset/restore that could lose newer data and explain the recovery path. Warn in-app before accepting a commitment stake or activating equipment with a long slot lock.

No delegation is required by this file.
