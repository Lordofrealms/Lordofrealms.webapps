# Decision register

Baseline date: 2026-10-22. `Accepted` means explicitly decided by the owner; `Default` is an implementation choice that can be tuned without rewriting the accepted contract.

| ID | Status | Decision |
|---|---|---|
| D01 | Accepted | Existing webapps GitHub repository; responsive desktop/mobile; modern game dashboard. |
| D02 | Accepted | All skills persist locally, editable interests, complete file backup/restore; manual platform transfer. |
| D03 | Accepted | Quick Start at 0; selected-category assessment estimates existing skills and composite character. |
| D04 | Accepted | Categories aggregate; substantial skills have 50 ranks; specialties add challenges/equipment. |
| D05 | Accepted | 20s capable/amateur; 30s expert/local winners; 40s national leaders; 50 historic sustained world-best. |
| D06 | Accepted | 2x XP promotion thresholds; character thresholds 50x skill; advanced tasks award much more. |
| D07 | Accepted | Every new skill rank needs XP and challenge; rubric first revealed after claiming first completion. |
| D08 | Accepted | Optional milestone photos, self-assessment, passed gateways retained permanently. |
| D09 | Accepted | Assessment validation at N grants unclaimed prerequisite gear through N. |
| D10 | Accepted | Current skill XP decays at minimum positive base current-level task XP/day. |
| D11 | Accepted | One demotion per three inactive months, only if XP insufficient; catch up offline chronological events. |
| D12 | Accepted | XP floor at next lower level threshold during grace; rebuilding XP needs no repeat gateway. |
| D13 | Accepted | Character/lifetime XP, reward credits, historical milestones do not decay. |
| D14 | Accepted | Ten equipment slots; modern names; stats, conditional effects, choices, active abilities. |
| D15 | Accepted | Active ability locks its item/slot throughout cooldown; pre-activation warning/confirmation. |
| D16 | Accepted | Daily qualified hiking can boost all that day's XP; final item effects designed by implementer. |
| D17 | Accepted | Combined skill levels qualify for rewards; only one legendary bonus applies per target skill. |
| D18 | Accepted | Legendary reward cascades to uncovered skills allowed; overlapping sources do not stack. |
| D19 | Default | Strongest eligible legendary source wins; reward IDs once; finite fixed-point calculation, cap 50. |
| D20 | Accepted | Attributes influenced by skill development; free assignable attribute point every 5 character levels. |
| D21 | Accepted | Age-group achievement relevant; skill 50 requires open-age top achievement in the discipline. |
| D22 | Accepted | Classes change without deleting progress; meaningful related XP bonus and class quests. |
| D23 | Accepted | Daily work modest base XP; substantial measurable outcomes get task/quest XP. |
| D24 | Accepted | Backdated activity gets half base XP, no bonuses; active logging is discipline. |
| D25 | Accepted | Ordinary timed quests lose completion bonus; optional explicit commitment penalties. |
| D26 | Default | Commitment stake reserved in credits, returned on success, forfeited on expiry; no undisclosed debt. |
| D27 | Accepted | Separate Reward Credits, roughly $1/credit; self-funded shop and power-appropriate virtual item costs. |
| D28 | Accepted | Promotion purchase permission is additional to store, no extra credit cost; not actual ownership. |
| D29 | Accepted | Reference is total personal income; no monthly budget/earning cap. |
| D30 | Accepted | Reward anchors: L10=.2%, L20=1%, L30=10%, L40=50%, L50=100% of annual income. |
| D31 | Default | L1=.005% income; geometric interpolation between anchors, integer cents, freeze awarded values. |
| D32 | Accepted | US adult comparisons, sourced demographic cohorts when valid; manual entries initially. |
| D33 | Accepted | Future partner tracking/rewards only; no assumed existing integrations. |
| D34 | Accepted | Commit full design and progress/handoff plan to repo before implementation. |
| D35 | Default | Buildless ES modules, IndexedDB event/state transactions, app-scoped offline cache, no external CDN. |
| D36 | Default | Exact BigInt XP serialized as decimal strings; fixed hundredths for credits. |
| D37 | Default | Three calendar months with end-of-month clamping; profile time zone retained. |
| D38 | Default | Character composite gateways prevent one skill's exponential XP from determining all life mastery. |
| D39 | Default | Attributes: Strength, Dexterity, Endurance, Intellect, Wisdom, Charisma, Discipline. |
| D40 | Default | Backdated work cannot reclaim expired quest bonuses/stakes; corrections leave an audit record. |
| D41 | Default | Every rule/data catalog version is retained in events/backups where needed; no recalculating old rewards under a new price silently. |
| D42 | Accepted | Research ranking evidence across the entire skill catalog, not only net worth and BMI. |
| D43 | Default | Distinguish population studies, participant ranks, competition results, qualifications, records and related context; publish a per-skill source/gap register. |
| D44 | Default | Begin with 204 skills in 14 categories; 53 researched skill sources, plus body/wealth tables. Only explicitly listed calculators produce numerical comparisons. |
| D45 | Default | Character gear affects all skill activities; ordinary skill gear affects its named skill. Active duration 24 hours, item/slot lock 30 days. |
| D46 | Default | Audited quest-completion correction returns bonus credits and removes bonus XP; insufficient available credits blocks correction without debt. Previously returned stakes remain returned. |
| D47 | Default | New quests require activity difficulty of at least quest rank minus one; accepted older quests preserve their recorded terms. |
| D48 | Default, 0.1.1 | Normal full backups use uncompressed, unencrypted ZIP with original photo bytes, a JSON manifest, per-photo SHA-256 and a manifest checksum. Archive format version is 1, separate from app/schema versions. |
| D49 | Default, 0.1.1 | Normal limits: 1 GiB ZIP, 64 MiB metadata, 10,000 photos, 12 MiB per photo. Reserve 66 MiB for metadata/ZIP structure when adding photos. Browser quota and memory can impose lower limits. |
| D50 | Default, 0.1.1 | Read 0.1.0 JSON backups and retain 100 MiB legacy JSON export for rollback. Existing photo records are untouched; new immutable Blob records and their references save in one transaction. Downgrading requires a legacy export/restore, not direct use of new Blob records. |
| D51 | Default, 0.1.1 | Raw emergency recovery ZIP preserves current and pre-restore records with original-ID mappings, up to 2 GiB / 20,000 photos / 128 MiB metadata. It is a repair bundle, not a normal import. No automatic reset, compression or photo deletion. |
| D52 | Default, 0.1.1 | Prepared exports expose a persistent explicit download link. Status says ready/prepared; the browser cannot confirm OS-level file saving. Original-photo downloads use the same mechanism. |
| D53 | Default, 0.1.2 | Twenty skills across fourteen categories have 29 concrete objectives each; upper ranks use discipline-specific evidence context with editorial achievement milestones. The other 184 built-in skills retain general frameworks. Publish full coverage and reference limitations. |
| D54 | Default, 0.1.2 | Freeze the complete challenge definition, selected approach and edition when a new attempt starts. Pending/passed attempts read their saved definition. Attempts without snapshots retain the exact legacy generator; no migration or rewritten terms. |
| D55 | Default, 0.1.2 | A read-only fifty-level roadmap shows objectives, safety, evidence scope and prospective XP/gear/purchase permissions. It grants nothing and does not reveal scoring criteria. Existing reward values and suggestions stay frozen. |
| D56 | Default, 0.1.2 | Three approaches retain equal rank standing: core demonstration, practical brief, changed conditions without added hazard. External qualifications/rankings inform context, never automatic RPG levels. New snapshot-bearing attempts should be reviewed in 0.1.2+; backups remain schema/archive version 1. |

## Work sequencing

Sequencing decision, 2026-10-28: pause Human RPG after preserving the unfinished 0.1.3 content revision. The owner will finish the 1000 Steps book in its separate repository, then return to use its results as input for relevant skill trees. Do not work on the book here. This changes work order, not the accepted progression, preservation or ranking rules.

## Superseded proposals (do not reintroduce)

- 1.12x level scaling -> 2x.
- About ten skill ranks -> fifty, with historic world-best meaning at fifty.
- Three equipment slots -> comprehensive ten-slot layout.
- Never lose skill levels -> current-XP decay and three-month demotion intervals.
- Fixed -5 XP/day -> minimum positive base task award at current level.
- Unbounded XP drain behind grace -> floor at start of the next lower level.
- Rubric before first attempt -> reveal on first claimed completion (safety instructions still visible).
- No rewards for legendary effective ranks -> combined ranks DO grant rewards.
- Forbid legendary cascades -> allow them, with one non-stacking legendary bonus per target skill.
- Monthly discretionary reward budget -> income-based rank reward scale, no budget cap.
- One smooth L1-L50 reward exponential -> specified L10/L20/L30/L40 inflection points.
- Salary only -> total annual personal income.
- Cosmetic-only gear -> meaningful gameplay effects.
- Native/mobile account synchronization now -> manual backup transfer now.

## Implementation defaults to evaluate, not reopen as permission gates

Pick sensible initial XP task weights, item bonus caps, ordinary versus commitment quest duration, available classes, appearance, and source coverage. Keep adjustable constants and evidence in source. User delegated these choices. Do not pretend the catalog's upper-rank editorial standards are externally verified. A missing credible percentile is a data gap, not a reason to fabricate one.
