import {writeFile} from 'node:fs/promises';
import {CATEGORIES,SKILLS} from '../catalog.js';
import {RANKING_SOURCES,TYPES,coverageFor,coverageSummary,ROWING_SNAPSHOT,SWIM_TABLE} from '../rankings.js';
const summary=coverageSummary();
const lines=[
 '# Rankings and evidence register','',
 'Reviewed 2026-10-22. Generated from the app catalog with: node scripts/write-ranking-register.mjs. This maintained register covers every catalog category; it does not assert that every available dataset worldwide has been discovered or integrated.','',
 `There are **${summary.skills} skills**, **${summary.sources} external skill references**, **${summary.mapped} skills with at least one relevant source**, and **${summary.skills-summary.mapped} explicit gaps**. Some mappings cover a narrow specialty, a qualification, or related context only. This count is **not** the number of skills with automated percentiles. Body and wealth sources are additional.`,'',
 '## Implemented numerical comparisons','',
 '| Measure | Source / edition | Calculation and scope |','|---|---|---|',
 '| BMI and waist | [CDC NHANES 2021–2023, tables 10/12](https://www.cdc.gov/nchs/data/series/sr_03/sr03-050.pdf) | Published weighted percentile bands for US adults, by ten-year age band and source sex cohort. No interpolation or tail extrapolation; body size is not a health rank. |',
 '| Family net worth | [Federal Reserve 2025 SCF, table 2](https://www.federalreserve.gov/publications/files/scf26.pdf) | Above/below age-specific family median, in 2025 dollars. No personal or sex-specific percentile. |',
 `| RowErg 2,000 m | [Concept2 2026 snapshot](${ROWING_SNAPSHOT.url}) | ${ROWING_SNAPSHOT.people} participants; all ages, genders, weights, countries; non-adaptive and all verification statuses. Published percentile bands only. |`,
 `| Swimming | [World Aquatics ${SWIM_TABLE.edition}](${SWIM_TABLE.url}) | 18 individual events, men/women, 25 m pool. floor(1000 × (base time / result time)^3). Valid ${SWIM_TABLE.from} to ${SWIM_TABLE.to}. Performance points, not percentiles. |`,'',
 'The rowing snapshot has 90th/75th/50th/25th participant-percentile boundaries at 410.8/439.3/475/528.8 seconds. Faster is higher in this distribution. The snapshot is frozen; no live participant records are downloaded. Swimming base times are stored in rankings.js. Calculator results become editable self-recorded evidence entries, not provider-certified results.','',
 '## Interpretation rules','',
 '- Population studies need the actual instrument, reference population, weighting, date and supported demographics.',
 '- Participant ranks describe the eligible field. A competition position, handicap, Elo rating, grade, performance point score, symptom score and population percentile are different quantities.',
 '- Preserve event, discipline, age/sex division, team versus individual result, season and scoring edition. Do not turn team/country rankings into individual ranks.',
 '- O*NET scales describe occupations, not a person. SFIA and CEFR are frameworks, not distributions. Health questionnaires describe a domain, not human worth or skill mastery.',
 '- No external standard automatically maps to the RPG’s 50 ranks. Advanced milestones need specific achievement evidence. Level 50 is open-age historic mastery; legendary effective ranks do not certify titles.',
 '- Sources open only when chosen. No personal results, measurements or photos are uploaded, and no live ranking requests or hidden tracking occur.','',
 '## Source register','',
 '| ID / source | Kind | Reference group | Limits / implementation |','|---|---|---|---|',
 ...RANKING_SOURCES.map(s=>`| ${s.id} · [${s.name}](${s.url}) | ${TYPES[s.type]} | ${s.cohort} | ${s.limitation} **${s.status}.** |`),'',
 '## Complete skill coverage',''
];
for(const c of CATEGORIES){
 lines.push(`### ${c.name}`,'','| Skill | Relevant source IDs | Evidence status |','|---|---|---|');
 for(const skill of SKILLS.filter(s=>s.category===c.id)){
  const coverage=coverageFor(skill);
  lines.push(`| ${skill.name} | ${coverage.sources.map(s=>s.id).join(', ')||'Research gap'} | ${coverage.note} |`);
 }
 lines.push('');
}
lines.push('## Next data work','',
 '1. Add licensed or public-use datasets with cohort fixtures. Sources above support manual result records unless a local calculator is explicitly stated.',
 '2. [Census CPS PINC](https://www.census.gov/data/tables/time-series/demo/income-poverty/cps-pinc.html) provides personal-income tables; ingest weighted age/sex tables before showing income percentiles. Do not substitute household income or full-time earnings.',
 '3. Detailed SCF wealth percentiles require weighted distributions and correct family definitions. The current median comparison cannot answer top-1% thresholds.',
 '4. Add demographic Concept2 cohorts, USGA handicap distributions, competition datasets and standardized test norms with the applicable license and edition. Preserve selection-bias labels.',
 '5. Curate discipline-specific 30–50 milestone standards and review specialty mappings (e.g. chemistry laboratory work versus all chemistry; mechanical CAD versus all mechanical engineering). Broad mappings state this limitation.',
 '6. Review the ten gaps with practitioners and primary research. “No comparable ranking identified” is a result of this review, not proof of nonexistence.','',
 '## Reuse and attribution','',
 'This register links primary publishers and contains original short summaries. No third-party rubric or bulk competition database is copied. Review licensing before future imports; public availability does not grant unrestricted redistribution. Numerical table changes need source date, exact units, cohort and regression fixtures.','');
await writeFile(new URL('../docs/RANKINGS.md',import.meta.url),lines.join('\n'));
console.log(summary);
