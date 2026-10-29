# Content revision — paused, unfinished 0.1.3

Owner feedback, 2026-10-28: the public build's challenges, catalog breadth, assessment and task XP are insufficiently developed. This is accurate: 20 of 204 skills have authored 29-objective paths, 184 have generic frameworks, and the assessment and task forms ask users to supply too much of the design themselves.

## Owner's sequencing decision

Later on 2026-10-28 the owner chose to finish the **1000 Steps book** first and return to the RPG using its results as input. App implementation is paused. The book is maintained separately; no book work was performed here. Treat the content below as a preserved draft to reconcile with the completed book, not a finalized curriculum.

## Checkpoint inventory

- Written: `skill-profiles.js` contains 204 existing skill IDs, four specialties and six original capability anchors each (1,224 anchors). A structural count found no missing or extra IDs. No claim of expert content review or scientific level calibration.
- Written, not validated: `curriculum.js` provides two preset types per anchor, sales/bench-press examples, capability scoring and a six-anchor challenge fallback. Shared stages are labeled explicitly; they are not 29 separately authored objectives per skill.
- Partially integrated: catalog specialties/challenge fallback, `recordAssessment`, fixed preset resolution in `logActivity`, and optional task/assessment snapshots with state-validation code.
- Not implemented: new assessment UI, preset logging UI, XP breakdown UI, skill-discovery changes, catalog breadth audit, updated content/register generation and assessment-history display.
- Not verified: scoring boundaries, task limits, XP balance, compatibility/backup roundtrip, new regression tests and desktop/mobile interaction. Historical tests and screenshots cover published 0.1.2 only.
- Publication: preserve this on `human-rpg-dev` only. Published `main` remains 0.1.2. No new PR or deployment is needed for this pause checkpoint.

## Resume after the book is complete

Read the book's repository handoff/status and actual completed content. Build a traceable mapping from chapter/step IDs to skill, specialty, prerequisites, capability, practice task, milestone and evidence. A step may serve several skills, but one activity's XP must not be duplicated. Separate prerequisites from promotion tests and preserve the rule that rubrics appear only after the first completion claim. Keep external ranking sources and unsupported areas explicit. Tune task XP within the accepted 2× curve rather than treating chapter order as an XP or proficiency scale.

## Implementation contract

- Author six concrete capability anchors and four meaningful specialties for each existing skill. Use them as specific assessment questions and preset activities with fixed difficulty, type and unit definitions.
- Estimate ordinary baseline levels from demonstrated capability, guidance, repeatability and prerequisite consistency. Higher recognition requires supporting evidence and broad independent ability; self-report remains self-report. Never treat XP or this questionnaire as a certified credential or population norm.
- Show the exact preset XP calculation before logging: base award, quantity, class multiplier, equipment adjustment and late-entry reduction. A preset's difficulty cannot be increased by editing a hidden/free-form tier field. Keep an explicitly custom activity option with an explanation of difficulty and evidence requirements.
- Preserve the 2× curve, character multiplier, bonus and decay rules. Presets are editorial initial balancing, not empirically calibrated equivalences. Record quantities as distinct completed units; no duplicate award for splitting one result into repeated entries.
- Retain the twenty independently authored paths. For the other 184 skills, use six skill-specific anchors with explicit shared progression stages and label that construction accurately. Do not call 29 generated stages 29 independently authored objectives.
- Do not rewrite old activities, baselines, passed gateways, reward prices or saved challenge definitions. New activity records retain the selected task's definition and edition. No database reset or destructive migration.
- Keep built-in IDs stable in this revision. Breadth needs further expansion, especially languages, disability sports, crafts and occupational disciplines; a larger count alone is not sufficient. Record a catalog audit and make all existing skills visible by default.

## Reference use

The task and question wording is original editorial content. O*NET's database-administration scope, WorldSkills cooking standards and the Council of Europe's language activity domains were checked on 2026-10-28 to inform breadth, not to reproduce licensed rubrics or claim an official RPG-level crosswalk. Existing per-skill references and explicit research gaps remain in RANKINGS.md. XP values are game-design choices, not numbers supplied by those sources.

- https://www.onetonline.org/link/summary/15-1242.00
- https://worldskills.org/what/projects/wsos/2024/events/579/skills/1670/
- https://www.coe.int/en/web/portfolio/the-common-european-framework-of-reference-for-languages-learning-teaching-assessment-cefr-

Completion and actual verification will be recorded in PLAN.md and VERIFICATION.md. This document does not claim the revision is delivered.
