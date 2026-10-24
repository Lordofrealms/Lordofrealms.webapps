# Human RPG product contract

Design baseline: 2026-10-22. Source: the owner's complete design conversation. This document precedes implementation. `DECISIONS.md` separates approved behavior from adjustable implementation defaults.

## 1. Product and platform

Create a new app in `Lordofrealms/Lordofrealms.webapps`, under `/human-rpg/`, suited to desktop and mobile browsers with a modern game-style dashboard. Initial delivery is a static app compatible with the repository's GitHub Pages project path. Do not create an unrelated hosted Site.

Local browser persistence uses a lightweight database, following the other webapps' local-data approach. Track the full catalog at all times. Interests are editable filters, never a deletion instruction. Store character, skills, classes, measurements, activities, quest state, XP, credits, equipment, cooldowns, achievement history, photos, and reward permissions. Backups must include the whole character and photo attachments and can be restored from a local file. User normally maintains one platform; automatic synchronization/accounts are out of initial scope.

Request persistent browser storage when available and show save/backup status. Persistence requests cannot protect against clearing site data or device loss. Never hide save failures. Use a database, keys, and service worker scope confined to this app. Browser origin storage is shared with the other Pages apps, so never use an origin-wide clear/reset.

## 2. Character and onboarding

Offer Quick Start and Full Assessment. Quick Start starts all skills and character at level 0; unknown ability is not represented as a verified deficiency. Full Assessment lets the user choose experience categories and answer a small set of questions to estimate current skill levels. They can assess additional skills later. Ordinary established experience is generally around level 10 if answers support it; advanced placement must correspond to demonstrated accomplishments. Assessment also establishes a composite starting character level. Assessed levels are labeled and are not population percentiles.

Assessment grants baseline XP/levels, not spendable credit windfalls. Equipment associated with starting levels requires a validation challenge. Passing a level-5 validation grants the level 1-5 gear/rewards once. Preserve all class/skill history on class changes. Primary class is the current job or role, with meaningful related XP bonuses, themed quests, and equipment. All skills remain available to any class.

## 3. Skill taxonomy and rank meanings

Categories summarize progress. Substantial individual skills each have 50 levels; specialties provide additional challenges/equipment rather than automatically creating another 50-level ladder. Support custom skills and goals. The catalog should cover physical capability, health/self-care, thinking/learning, communication/languages, relationships/community, career/leadership, finance, business, computing, science/engineering, trades/repair, home/daily life, creative arts, and outdoors/agriculture.

| Level | Intended achievement |
|---|---|
| 0-9 | Unassessed or foundational development |
| 10-19 | Established working proficiency |
| 20-29 | Fully capable; accomplished amateur or practitioner; realistic lifetime range for many |
| 30-39 | Expert; substantive local/regional competition wins or domain-equivalent achievements |
| 40-49 | Among leading national/international practitioners |
| 50 | Historic, sustained world-champion caliber; best-in-world achievement or defensible domain equivalent |

Level 50 is substantially stronger than ordinary expertise. A lifetime of amateur running can appropriately remain in the twenties. Age-group achievements are relevant and rewarded, but maxing a skill requires the highest standard regardless of age group, within the relevant discipline/competitive division. Do not invent objective world rankings in fields without them; distinguish self-attested standards and editorial templates from sourced competitive criteria.

## 4. XP, activity, and character progression

Skill promotion cost initially doubles: `100 * 2^L` for current level L to L+1. Cumulative threshold for level L is `100 * (2^L - 1)`. Character thresholds use the same curve at 50 times skill thresholds. Use exact integer arithmetic; total skill XP at 50 is 112589990684262300.

Harder tasks award substantially more XP. Difficulty describes the activity/accomplishment, not merely the user's current level. Routine familiar work earns modest base XP; meaningful outcomes get their additional task/quest awards. Answering ordinary work emails does not become an extraordinary accomplishment through volume alone. Qualifying sales, completed projects, and other actual outcomes can be counted by documented units. Support ordinary work and deliberate practice. Allocate an activity's skill XP explicitly and count its character contribution once; avoid duplicate base awards when a quest also recognizes it. Completion bonuses are explicit.

Overall character level should describe composite life achievement, rather than just a single skill. Major composite gateways are a proposed implementation safeguard for breadth/depth; their exact content must remain visible in the plan rather than being invented as accepted scientific standards.

Every five character levels grants one freely assignable attribute point, once per milestone. Assessed baseline character levels count, and recovery never repeats the grant.

## 5. Promotion challenges and milestone photos

Every ordinary skill promotion requires enough XP AND a skill challenge. Publish the challenge objective, necessary constraints, and safety instructions before the attempt. Keep the scoring rubric concealed until the user first says they completed the challenge. Then reveal the rubric for self-assessment. Keep it available for retries. Do not conceal safety requirements as a surprise test.

Offer equivalent challenge choices where feasible. Examples in the conversation (spaghetti, cake, creme brulee, lobster bisque) were illustrative, not a mandated sequence. Challenges should test actual increasingly sophisticated capabilities and breadth. Upper ranks need meaningful accomplishments beyond accumulating practice. Photo(s), notes, and dates document attempts and milestones; photos are optional and remain local. Do not present self-assessed completion as externally verified.

Preserve passed gateways permanently. Rebuilding XP after decay restores a previously achieved level without repeating its gateway. Initial assessment needs validation for associated gear. When a new challenge validates rank N, award unclaimed prerequisite level gear/rewards once, subject to the reward rules below.

## 6. Decay and late entry

Current skill XP decays each elapsed day by the smallest positive base XP award for an ordinary task at the current skill level. Exclude class/equipment boosts, one-off promotion awards, and zero-XP actions from that rate. Recalculate when the current level changes. Neither lifetime character XP nor spendable credits decay.

Demotion requires BOTH XP below the current rank threshold AND a full three-month inactivity interval since qualifying skill XP (or the previous inactivity demotion). Drop only one level, then start a new three-month interval. Process long absences chronologically: nine inactive months can cause three demotions if XP conditions were met. Simply opening the app does not reset inactivity. Genuine newly earned skill XP resets it.

During a protected interval, current XP may drain only to the starting threshold of the next lower level. This agreed floor prevents hidden multi-level XP debt behind a protected displayed level. XP never becomes negative. Preserve peak achieved ranks, gateways, photos, earned gear, and reward history.

Allow backdated entries at HALF base XP and NO class, equipment, ability, or quest-completion bonuses. Credit their actual activity date when rebuilding the timeline; timely logging is part of the discipline. They do not retroactively recover forfeited commitment stakes or deadline bonuses. Calendar-day cutoffs and three-calendar-month arithmetic use the profile time zone, with chronological events retained for deterministic replay. Corrections/voids must be explicit and recoverable, never erase history silently.

## 7. RPG attributes

Proposed attributes: Strength, Dexterity, Endurance, Intellect, Wisdom, Charisma, Discipline. They derive primarily from related known/trained skills, plus the freely assigned point every five character levels, plus clearly displayed equipment/legendary effects. Game attributes are not medical measurements or psychometric IQ. Keep measured observations and population comparisons separate.

## 8. Equipment, abilities, and legendary rewards

Use ten modern equivalents of classic RPG equipment slots: head, torso, hands, feet, waist, neck, two rings, main hand, off hand. Every equippable item has a meaningful stat/effect. Offer a choice among deliberately designed variants. Inventory persists independently of equipped slots. Possible powers include conditional/all-day XP, skill-specific boosts, controlled decay reduction, active abilities, and set effects. Never modify a reported population percentile through an item.

Example approved concept: Quality Hiking Boots earned for a 20-mile hiking day grant 5% more XP from EVERYTHING on days with at least five miles hiked. Exact catalog/item numbers are implementation balancing, not prescribed throughout. Daily conditions must be calculated without recursively rewarding themselves; later same-day eligible activity can satisfy the day's condition. Backdated activity remains half base XP with no bonus.

An active ability may last a day and have a month-long cooldown. Activating it locks that item in its slot for the ENTIRE cooldown; loadout/class changes cannot remove, replace, delete, or reset it. Warn and obtain in-app confirmation BEFORE activation, explicitly showing effect duration and lock release. Other slots can be used unless separately locked. Persist locks and cooldowns through reload and backup/restore. Gameplay remains local and self-reported, not tamper-proof commercial verification.

Legendary achievement rewards may include very large effects such as +10 to all Charisma-related skills. Distinguish earned/assessed rank from effective combined rank. Combined rank qualifies for corresponding level rewards, including rewards that can extend to other skills. A particular skill can have ONLY ONE legendary bonus applied; never sum multiple legendary sources on the same skill. Use the strongest applicable source, deterministically, capped at effective reward rank 50. Newly earned legendary bonuses may affect skills not covered by the first source. Resolve reward cascades to a finite fixed point; award each reward ID once. Never mint XP, free attribute points, or duplicate credits just by recomputing bonus levels. The reward is not proof that the user actually won a world championship in a bonus-boosted skill.

Temporary buffs are separately identified. Newly acquired legendary sources do not repeatedly replay previously granted rewards. Level recovery/reassessment cannot farm rewards. See `DECISIONS.md` for adjustable stacking defaults.

## 9. Reward Credits and purchase permissions

Maintain separate current skill XP, permanent character/lifetime XP, and spendable Reward Credits. Approximately one credit maps to one US dollar of self-funded purchase permission. Credits are game accounting, not money supplied by the app. Store purchases consume credits, never earned levels. Virtual items cost an amount appropriate to their power. Credits earned and unspent persist.

Use TOTAL ANNUAL PERSONAL INCOME, including relevant non-salary personal income, as the reward reference. Do NOT use a monthly reward budget or earning cap; the owner explicitly rejected that approach. Users may provide an explicit reference when ordinary income is absent/variable; never silently assume a salary. Values can be unpriced while income is unavailable.

Accepted monetary reward inflection points, expressed as fractions of annual personal income I:

| Level | Fraction of I | Example when I=$100,000 |
|---|---|---|
| 1 | illustrative starting value 0.00005 | $5, an ice-cream-scale treat |
| 10 | 0.002 | $200 |
| 20 | 0.01 | $1,000 |
| 30 | 0.10 | $10,000 |
| 40 | 0.50 | $50,000 |
| 50 | 1.00 | $100,000, one year's income |

Use monotone geometric interpolation BETWEEN these points, not the superseded single exponential. Level-1 ratio is an implementation default from the prior illustrative $5 treat. Apply the ratios to the user's income, not fixed dollar amounts for everyone. Store money/credits in integer cents/hundredths. Freeze a priced permission at the time it is awarded. No automatic payment or purchase.

Passing a promotion grants its related virtual gear and a direct permission to buy a skill-related reward, IN ADDITION to the credit store. No extra credit charge for using a promotion permission. Describe this as earned permission, not an inventory item supposedly owned or an externally funded coupon. Record unused/used/passed-over status. Reward suggestions should fit the skill tree and its tier; allow substitutions. Income/net-worth observations may inform relevant suggestions but do not themselves mint XP by editing a field.

## 10. Quests and commitments

Offer strength-focused, weakness-focused, and balanced suggestions. Users can accept, decline, replace, pause, and create quests. Missing data is not a weakness. Goals adapt to interests, ability, time, equipment, and available resources. Long financial/achievement quests have intermediate milestones. Numerical examples from the conversation are illustrative until supported by real benchmark data.

Support open quests, timed quests, and explicit commitment quests. Ordinary expiration forfeits the completion bonus; completed activity keeps its appropriate XP. Commitment quests additionally carry a disclosed stake/penalty agreed before acceptance. Initial proposed implementation reserves a user-selected credit stake, returns it on timely success, and forfeits it on failure. Never create an undisclosed debt or silently charge real money. Timely completion and logging are required for deadline bonuses. Record actual work separately from outcome bonuses.

## 11. Measurements and comparison evidence

Initially target US adults. Track income, net worth, body measurements/BMI, fitness outcomes, and optional standardized cognitive results as private observations with dates/units. Show estimated population position or directional comparisons only where defensible data exists. Every comparison needs the source, year, reference population, method, and limitations. Use age and sex/gender stratification only where the source supports it. Let a user choose the supported reference cohort; do not infer one.

Federal Reserve SCF uses family financial units; do not mislabel family wealth as an individual-age/sex percentile. Census personal income differs from household income and earnings. NHANES body distributions do not convert BMI into a health ranking; lower BMI is not universally better. An athlete sample is not the general population. Unknown/unsupported percentiles must remain unknown. Do not invent top-1% thresholds from medians. IQ requires appropriate test norms; reasoning practice is not an IQ test.

Sources researched during design include Federal Reserve SCF (https://www.federalreserve.gov/econres/scfindex.htm), Census CPS personal income (https://www.census.gov/data/tables/time-series/demo/income-poverty/cps-pinc.html), CDC NHANES anthropometry (https://stacks.cdc.gov/view/cdc/174595), CDC BMI categories (https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html), and O*NET (https://www.onetcenter.org/database.html). These are candidate sources, not a claim that all distributions are already implemented or licensed/processed.

## 12. Future partnerships

Eventually support company/device tracking, verified activity, challenge campaigns, and sponsored rewards (e.g. gym attendance leading to a smoothie). Preserve activity provenance now: manual, device, partner. Actual sponsored redemption needs agreements, accounts/consent, server-side verification, anti-duplicate redemption, and integration work. Do not imply any partnership already exists. No current connector uploads or synchronization.

## 13. Delivery, testing, and continuity

Document decisions and implementation plan in the repository BEFORE source implementation. Keep project state and handoff current after each checkpoint. Build without disturbing existing apps. Keep software version 0.1.0 initially, then follow single-digit X.Y.Z rules.

Validate exact XP arithmetic, late-entry accounting, monthly decay through long absences, changing rates/floors, reward idempotence, non-stacking legendary fixed points, ability locks, stake reservation/forfeiture, backup roundtrip with photos, invalid import rejection, and multi-tab/save failure behavior. Check desktop/mobile layout, keyboard use, reload persistence, offline assets, and main workflows. Record any unverified source coverage or browser limitation honestly. Protect data before migrations/restores and provide a recoverable snapshot.

## 14. Ranking research expansion (2026-10-22)

The owner explicitly required research for every skill with available ranking data. docs/RANKINGS.md records the complete catalog, source types, cohort limits, implemented calculations, and remaining research gaps. Rankings include sports, mind games, languages, technical fields, professional standards, trades, arts, and outdoors. A related framework is not evidence of a population percentile. Keep this register synchronized using node scripts/write-ranking-register.mjs.
