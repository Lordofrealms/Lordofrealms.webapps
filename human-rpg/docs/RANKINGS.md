# Rankings and evidence register

Reviewed 2026-10-22. Generated from the app catalog with: node scripts/write-ranking-register.mjs. This maintained register covers every catalog category; it does not assert that every available dataset worldwide has been discovered or integrated.

There are **204 skills**, **53 external skill references**, **194 skills with at least one relevant source**, and **10 explicit gaps**. Some mappings cover a narrow specialty, a qualification, or related context only. This count is **not** the number of skills with automated percentiles. Body and wealth sources are additional.

## Implemented numerical comparisons

| Measure | Source / edition | Calculation and scope |
|---|---|---|
| BMI and waist | [CDC NHANES 2021–2023, tables 10/12](https://www.cdc.gov/nchs/data/series/sr_03/sr03-050.pdf) | Published weighted percentile bands for US adults, by ten-year age band and source sex cohort. No interpolation or tail extrapolation; body size is not a health rank. |
| Family net worth | [Federal Reserve 2025 SCF, table 2](https://www.federalreserve.gov/publications/files/scf26.pdf) | Above/below age-specific family median, in 2025 dollars. No personal or sex-specific percentile. |
| RowErg 2,000 m | [Concept2 2026 snapshot](https://log.concept2.com/rankings/2026/rower/2000) | 10197 participants; all ages, genders, weights, countries; non-adaptive and all verification statuses. Published percentile bands only. |
| Swimming | [World Aquatics SCM 2026](https://resources.fina.org/fina/document/2026/09/05/9b48fb98-233c-4ce9-b67b-bc6163319bbd/Points-Base-times-SCM-and-LCM-2026_09.2026.pdf) | 18 individual events, men/women, 25 m pool. floor(1000 × (base time / result time)^3). Valid 2026-09-01 to 2027-08-31. Performance points, not percentiles. |

The rowing snapshot has 90th/75th/50th/25th participant-percentile boundaries at 410.8/439.3/475/528.8 seconds. Faster is higher in this distribution. The snapshot is frozen; no live participant records are downloaded. Swimming base times are stored in rankings.js. Calculator results become editable self-recorded evidence entries, not provider-certified results.

## Interpretation rules

- Population studies need the actual instrument, reference population, weighting, date and supported demographics.
- Participant ranks describe the eligible field. A competition position, handicap, Elo rating, grade, performance point score, symptom score and population percentile are different quantities.
- Preserve event, discipline, age/sex division, team versus individual result, season and scoring edition. Do not turn team/country rankings into individual ranks.
- O*NET scales describe occupations, not a person. SFIA and CEFR are frameworks, not distributions. Health questionnaires describe a domain, not human worth or skill mastery.
- No external standard automatically maps to the RPG’s 50 ranks. Advanced milestones need specific achievement evidence. Level 50 is open-age historic mastery; legendary effective ranks do not certify titles.
- Sources open only when chosen. No personal results, measurements or photos are uploaded, and no live ranking requests or hidden tracking occur.

## Source register

| ID / source | Kind | Reference group | Limits / implementation |
|---|---|---|---|
| athletics · [World Athletics](https://worldathletics.org/world-ranking-rules/basics) | Competition results | Event, sex division, season; race walking only for distance walking. | Performance and placing contribute to rankings. Ordinary walking and casual runners are outside this ranked field. **Reference + manual result.** |
| concept2 · [Concept2 Logbook](https://log.concept2.com/rankings/2026/rower/2000) | Participant ranking | RowErg; fixed event, season, age, gender, weight, adaptive and verification filters. | Self-selected submissions, not all people or all rowers. Local 2,000 m snapshot uses the combined non-adaptive field. **Local calculator + original source.** |
| aquatics · [World Aquatics points](https://www.worldaquatics.com/swimming/points) | Competition results | Pool length, stroke, distance, sex division and table edition. | Performance points are not percentiles. Local calculator supports the listed individual short-course events only. **Local calculator + original source.** |
| ipf · [International Powerlifting Federation](https://www.powerlifting.sport/) | Competition results | Federation, meet, weight, sex, age, equipment, tested division and lift rules. | Use official results and GL points with matching rules. A casual bench press is not a verified meet total or a population rank. **Reference + manual result.** |
| iwf · [International Weightlifting Federation](https://iwf.sport/results/ranking-list/) | Competition results | Weight category, sex division, age, date and rules edition. | Rankings and records concern eligible competition results; category changes require separate comparisons. **Reference + manual result.** |
| uci · [Union Cycliste Internationale](https://www.uci.org/disciplines/all/2tLnZMo6WrUBplRXDxyEi7?tab=rankings) | Competition results | Discipline, season, sex and competition category. | Road, track, mountain-bike and other disciplines have separate systems. Points are not an all-population percentile. **Reference + manual result.** |
| climbing · [World Climbing](https://www.worldclimbing.com/) | Competition results | Boulder, lead, speed or para-climbing; division and season. | Competition results do not directly rank outdoor route grades or all recreational climbers. **Reference + manual result.** |
| triathlon · [World Triathlon](https://triathlon.org/world-rankings/championship-series) | Competition results | Series, distance, age/sex or elite division and season. | Series rankings are distinct from age-group results and from the general population. **Reference + manual result.** |
| gymnastics · [FIG ranking archive](https://www.gymnastics.sport/site/rankings/archives.php) | Competition results | Discipline, apparatus, division and season. | Keep apparatus and scoring-code editions separate; a single medal is not historic sustained mastery. **Reference + manual result.** |
| archery · [World Archery](https://www.worldarchery.sport/ranking/world-ranking) | Competition results | Bow type, division, event and ranking date. | Competitive ranking, not an all-person precision percentile. **Reference + manual result.** |
| fis · [FIS points lists](https://www.fis-ski.com/DB/alpine-skiing/fis-points-lists.html) | Competition results | Alpine discipline, sex division and points-list edition. | This source covers alpine skiing; other ski disciplines need their own list. Lower points can indicate stronger results. **Reference + manual result.** |
| isu · [ISU world standings](https://isu-skating.com/figure-skating/world-standings/) | Competition results | Figure-skating discipline, division and season. | Figure skating only; speed skating and recreational skating require different measures. **Reference + manual result.** |
| usga · [USGA World Handicap System statistics](https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/whs-stats.html) | Participant ranking | Registered handicap holders, jurisdiction, sex and reporting year. | Handicap distributions describe participating golfers. Course/slope and handicap methodology matter; no local percentile table ingested yet. **Reference + manual result.** |
| wtn · [ITF World Tennis Number](https://worldtennisnumber.com/) | Participant ranking | Singles/doubles, rating date and confidence/activity context. | The 40-to-1 rating scale is not a percentage; smaller numbers indicate stronger play. **Reference + manual result.** |
| ijf · [International Judo Federation](https://www.ijf.org/wrl?category=all) | Competition results | Judo weight, sex and age division; ranking date. | Judo only. Martial-arts styles cannot share a single rank. **Reference + manual result.** |
| wkf · [World Karate Federation](https://www.wkf.net/ranking) | Competition results | Karate discipline, weight, age and sex division. | Karate competition evidence only, not a universal martial-arts proficiency scale. **Reference + manual result.** |
| wswcf · [World Street Workout and Calisthenics Federation](https://wswcf.org/) | Competition results | Event rules, discipline, division and date. | Event results are relevant to the specific competitive format, not every bodyweight exercise. **Reference + manual result.** |
| nba · [NBA player statistics](https://www.nba.com/stats/players) | Competition results | NBA players, season and statistic. | League-specific performance; not a general-population rank. **Reference + manual result.** |
| mlb · [MLB Statcast](https://baseballsavant.mlb.com/) | Participant ranking | MLB season, player role, statistic and qualification threshold. | Statcast percentiles apply to eligible players for that statistic, not all baseball ability. **Reference + manual result.** |
| pl · [Premier League player statistics](https://www.premierleague.com/en/stats) | Competition results | League, season, position and statistic. | Team context, minutes and role matter. These statistics cannot rank every footballer or the population. **Reference + manual result.** |
| norceca · [NORCECA beach volleyball rankings](https://norceca.net/Ranking/Beach/2025/2025-Beach%20Volleyball%20Ranking%20Pages.htm) | Competition results | Regional beach pairs, gender division and 2025 season. | A pair ranking is not an individual indoor-volleyball ranking. Other formats remain separate. **Reference + manual result.** |
| fkt · [Fastest Known Time](https://fastestknowntime.com/athletes) | Record / achievement | Exact route, direction, support style, sex category and date. | Route records are selective achievements, not representative hiker percentiles. **Reference + manual result.** |
| fide · [FIDE ratings](https://ratings.fide.com/download_lists.phtml) | Participant ranking | Standard, rapid or blitz; published list date and active/registered population. | An Elo rating is not an IQ score or a general-population percentile. **Reference + manual result.** |
| wca · [World Cube Association](https://www.worldcubeassociation.org/) | Competition results | Puzzle event; official single or average; competition date and region. | Official competitor results only. Different puzzles and single/average results are separate. **Reference + manual result.** |
| memory · [Memory League](https://memoryleague.com/) | Participant ranking | Rated discipline, ranking date and active participants. | Trained task performance does not establish general intelligence or everyday memory health. **Reference + manual result.** |
| piaac · [OECD Survey of Adult Skills](https://www.oecd.org/en/about/programmes/piaac.html) | Population study | Country, survey cycle, age 16–65 and assessed domain. | Literacy, numeracy and adaptive problem solving use standardized instruments and survey weights. No self-report-to-percentile conversion or local microdata calculator. **Reference + manual result.** |
| cefr · [Council of Europe CEFR](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions) | Proficiency standard | Language, assessed modality, exam/provider and date. | A1–C2 describe language proficiency, not population percentiles. Translation and listening mappings concern language components only. **Reference + manual result.** |
| aslpi · [Gallaudet ASLPI](https://gallaudet.edu/american-sign-language-proficiency-interview-aslpi/) | Proficiency standard | Official interview result, 0–5 with qualifying plus levels. | ASL communication proficiency is evaluated by trained raters; not a percentile or RPG rank. **Reference + manual result.** |
| gre · [ETS GRE Subject Tests](https://www.ets.org/gre/test-takers/subject-tests/scores/understand-scores.html) | Participant ranking | Test subject, edition, score type and published reference period. | Use a genuine score report and matching norm table. Percent-correct subsections are not percentiles. **Reference + manual result.** |
| toastmasters · [Toastmasters speech championship](https://www.toastmasters.org/events/world-championship-of-public-speaking) | Competition results | Speech contest, round, division, year and eligibility. | Competition evidence in a particular speech format; not a universal communication ranking. **Reference + manual result.** |
| debate · [World Universities Debating Championships](https://www.worlddebating.org/) | Competition results | Tournament, language category, team/speaker result and year. | University eligibility and team results limit generalization; not an open-population ranking. **Reference + manual result.** |
| codeforces · [Codeforces ratings and API](https://codeforces.com/apiHelp/methods) | Participant ranking | Rated contest format, date, activity status and eligible users. | Competitive algorithms are one specialty. Ratings do not measure all software engineering or general intelligence. **Reference + manual result.** |
| kaggle · [Kaggle rankings](https://www.kaggle.com/rankings) | Participant ranking | Competitions, datasets, notebooks or discussions; snapshot date. | Track-specific rankings and tiers describe platform participation, not all practitioners. **Reference + manual result.** |
| worldskills · [WorldSkills standards and results](https://worldskills.org/skills/) | Proficiency standard | Specific competition skill, standards edition and event eligibility. | Relevant specialties, not exact equivalence to every broad skill. Events often have youth age limits. Standards and results are not population percentiles. **Reference + manual result.** |
| sfia · [SFIA 9](https://sfia-online.org/en/sfia-9/skills/all-skills-a-z) | Proficiency standard | Named professional skill, responsibility level and evidence of work. | Seven responsibility levels are professional descriptors, not competitive or population ranks. Read original licensed definitions before claiming a formal mapping. **Reference + manual result.** |
| onet · [US Department of Labor O*NET](https://www.onetonline.org/help/online/scales) | Related context | Occupation and knowledge/skill scale. | Importance and level scores describe occupations, not the user. These are task references only; never display an O*NET score as a personal percentile. **Reference + manual result.** |
| ncees · [NCEES engineering and surveying exams](https://ncees.org/exams/exam-scoring/) | Proficiency standard | Exam discipline, jurisdiction, edition and verified result. | Pass/fail credential evidence, not a published individual population rank; no invented passing percentage. **Reference + manual result.** |
| cfpb · [CFPB financial well-being scale](https://www.consumerfinance.gov/consumer-tools/financial-well-being/) | Related context | Original questionnaire, scoring procedure and comparison sample. | Financial well-being is not income, net worth or pure financial skill. No local questionnaire scoring implemented; use a documented official result. **Reference + manual result.** |
| promis · [PROMIS / HealthMeasures](https://healthmeasures.net/promis-basics/) | Related context | Specific instrument/version, scoring method and reference population. | T-scores depend on the instrument and domain. Symptoms are not skill rankings; no normal-distribution percentile or diagnosis is inferred. **Reference + manual result.** |
| redcross · [American Red Cross training](https://www.redcross.org/take-a-class) | Proficiency standard | Course, delivery mode, practical assessment, certificate and expiry. | Course completion is a bounded credential, not a license for every emergency task or a population percentile. **Reference + manual result.** |
| abrsm · [ABRSM music assessments](https://www.abrsm.org/en-gb/piano) | Proficiency standard | Instrument or theory specialty, syllabus, grade/diploma, exam route and date. | Graded qualifications support proficiency evidence; Grade 8 is not equivalent to historic best-in-world. Composition mapping is limited to related theory evidence. **Reference + manual result.** |
| trinity-music · [Trinity drum kit and percussion](https://www.trinitycollege.com/qualifications/music/grade-exams/percussion) | Proficiency standard | Instrument, syllabus, exam grade and date. | Graded practical qualifications support proficiency evidence, not population ranking. **Reference + manual result.** |
| trinity · [Trinity College London drama](https://www.trinitycollege.com/qualifications/drama/grades) | Proficiency standard | Acting/speech syllabus, assessment route and grade. | Exam achievement, not a population percentile or a world ranking. **Reference + manual result.** |
| wdsf · [World DanceSport Federation](https://www.worlddancesport.org/Ranking/World) | Competition results | Style, age division, season and individual/pair competition. | License-based competition rankings cover specified styles; a pair result is not an individual all-dance rank. **Reference + manual result.** |
| wpc · [World Photographic Cup](https://worldphotographiccup.org/) | Competition results | Image category, year, individual placing and national-team result. | Judged selected images and team standings are distinct; neither is an all-photographer percentile. **Reference + manual result.** |
| iof · [International Orienteering Federation](https://ranking.orienteering.org/?ohow=M) | Competition results | Foot, mountain-bike, ski or trail discipline, division and date. | Orienteering is a navigation specialty, not every field-navigation context. **Reference + manual result.** |
| igfa · [International Game Fish Association records](https://igfa.org/world-records/) | Record / achievement | Species, tackle/line class, division and verified catch. | A record catch is not a population ranking of anglers. **Reference + manual result.** |
| bbka · [British Beekeepers Association assessments](https://www.bbka.org.uk/pages/category/education-and-exams) | Proficiency standard | Practical assessment or written module, syllabus and date. | Credential progression supports knowledge evidence; not a world rank. **Reference + manual result.** |
| ebird · [Cornell eBird Top 100](https://ebird.org/top100) | Participant ranking | Region, year, species/checklist measure and observation effort. | Counts reflect effort, access and reporting as well as identification; no inference of accuracy or global skill percentile. **Reference + manual result.** |
| wx · [WxChallenge](https://www.wxchallenge.com/cumulative_results.php) | Competition results | Contest season, forecast variable and eligible participant division. | College forecast competition; prediction errors do not rank all meteorologists or weather observers. **Reference + manual result.** |
| ncga · [NCGA yield contest](https://www.ncga.com/get-involved/yield-contest) | Competition results | Crop, region, production class, season and verified yield. | Land, resources, weather and category affect yield. Contest placement is not a pure farmer-ability percentile. **Reference + manual result.** |
| isa · [International Society of Arboriculture](https://www.isa-arbor.com/Credentials/Types-of-Credentials) | Proficiency standard | Arboriculture credential, eligibility, examination and currency. | Tree-care specialty credentials do not establish broad forestry or conservation ranking. **Reference + manual result.** |
| aavsb · [AAVSB veterinary technician examination](https://aavsb.org/wp-content/uploads/2025/02/AAVSB-CandidateInformationHandbook-1.pdf) | Proficiency standard | Eligible veterinary technician examination and jurisdiction. | A specialist professional credential, not a general pet-care rank or permission to practise outside applicable rules. **Reference + manual result.** |

## Complete skill coverage

### Physical capability

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Running | athletics, fkt | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Hiking | fkt | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Strength training | ipf | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Swimming | aquatics | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Cycling | uci | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Rowing | concept2 | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Climbing | climbing | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Gymnastics | gymnastics | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Balance | Research gap | Fitness and clinical balance tests depend on protocol and population. No suitable cross-population skill ranking ingested. |
| Mobility | promis | Related context only. No individual skill percentile is provided by these sources. |
| Sprinting | athletics | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Distance walking | athletics | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Triathlon | triathlon | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Powerlifting | ipf | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Olympic weightlifting | iwf | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Calisthenics | wswcf | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Basketball | nba | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Soccer | pl | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Tennis | wtn | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Golf | usga | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Baseball | mlb | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Volleyball | norceca | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Martial arts | ijf, wkf | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Archery | archery | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Skating | isu | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Skiing | fis | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Health & self-care

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Meal planning | Research gap | Nutrition outcomes depend on context and resources; no representative planning-skill percentile identified. |
| Sleep routines | promis | Related context only. No individual skill percentile is provided by these sources. |
| Stress management | promis | Related context only. No individual skill percentile is provided by these sources. |
| Meditation | Research gap | Practice and tradition-specific attainments are not interchangeable population ranks. |
| First aid | redcross | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Emergency response | redcross | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Personal care | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Health literacy | promis | Related context only. No individual skill percentile is provided by these sources. |
| Recovery practices | promis | Related context only. No individual skill percentile is provided by these sources. |
| Mindful eating | Research gap | Questionnaires measure behaviors or experiences, not universal skill mastery. |

### Thinking & learning

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Chess | fide | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Speedcubing | wca | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Reading | piaac | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Mathematics | piaac, gre | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Logic | codeforces | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Critical thinking | onet | Related context only. No individual skill percentile is provided by these sources. |
| Research | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Learning techniques | Research gap | Study outcomes are context dependent. PIAAC and memory contests assess narrower domains. |
| Memory techniques | memory | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Statistical reasoning | kaggle | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Scientific reasoning | onet | Related context only. No individual skill percentile is provided by these sources. |
| Problem solving | piaac, codeforces | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Information literacy | piaac | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Systems thinking | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Decision analysis | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Communication & languages

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Public speaking | toastmasters, trinity | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Writing | onet | Related context only. No individual skill percentile is provided by these sources. |
| Listening | cefr | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Negotiation | onet | Related context only. No individual skill percentile is provided by these sources. |
| Storytelling | toastmasters, trinity | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Debate | debate | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Technical writing | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Interviewing | onet | Related context only. No individual skill percentile is provided by these sources. |
| Presentation design | onet | Related context only. No individual skill percentile is provided by these sources. |
| Spanish | cefr | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| French | cefr | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| German | cefr | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Mandarin | cefr | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Japanese | cefr | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| American Sign Language | aslpi | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Translation | cefr | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Relationships & community

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Conflict resolution | onet | Related context only. No individual skill percentile is provided by these sources. |
| Mentoring | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Caregiving | worldskills, redcross | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Parenting | Research gap | No defensible universal ranking of parenting quality identified; retain personal milestones and context. |
| Community organizing | onet | Related context only. No individual skill percentile is provided by these sources. |
| Volunteering | Research gap | Hours and awards document contribution, not population ability or human worth. |
| Coaching | onet | Related context only. No individual skill percentile is provided by these sources. |
| Facilitation | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Collaboration | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Cross-cultural communication | Research gap | Language frameworks assess only part of this skill; no universal interpersonal percentile identified. |

### Career & leadership

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Project management | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Team leadership | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Delegation | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Teaching | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Strategic planning | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Operations management | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Hiring | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Career development | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Change management | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Quality management | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Time management | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Meeting facilitation | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Personal finance

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Budgeting | cfpb | Related context only. No individual skill percentile is provided by these sources. |
| Saving | cfpb | Related context only. No individual skill percentile is provided by these sources. |
| Debt management | cfpb | Related context only. No individual skill percentile is provided by these sources. |
| Financial analysis | onet | Related context only. No individual skill percentile is provided by these sources. |
| Investment literacy | cfpb | Related context only. No individual skill percentile is provided by these sources. |
| Tax literacy | onet | Related context only. No individual skill percentile is provided by these sources. |
| Retirement planning | cfpb | Related context only. No individual skill percentile is provided by these sources. |
| Insurance literacy | onet | Related context only. No individual skill percentile is provided by these sources. |
| Bookkeeping | onet | Related context only. No individual skill percentile is provided by these sources. |
| Financial recordkeeping | onet | Related context only. No individual skill percentile is provided by these sources. |

### Business & enterprise

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Sales | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Marketing | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Entrepreneurship | onet | Related context only. No individual skill percentile is provided by these sources. |
| Customer service | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Product management | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Business planning | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Market research | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Procurement | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Supply-chain management | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Business analytics | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Pricing | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Account management | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| E-commerce | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Business development | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Computing & technology

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Programming | codeforces, worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Web development | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Mobile development | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Cybersecurity | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Networking | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Database administration | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Data analysis | kaggle, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Machine learning | kaggle, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Cloud computing | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Systems administration | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Software testing | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| User-experience design | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Automation | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Technical support | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Game development | worldskills, sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Digital accessibility | sfia | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Science & engineering

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Physics | gre | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Chemistry | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Biology | onet | Related context only. No individual skill percentile is provided by these sources. |
| Astronomy | onet | Related context only. No individual skill percentile is provided by these sources. |
| Geology | onet | Related context only. No individual skill percentile is provided by these sources. |
| Ecology | onet | Related context only. No individual skill percentile is provided by these sources. |
| Mechanical engineering | worldskills, ncees | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Electrical engineering | ncees | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Civil engineering | ncees | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Electronics | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| CAD | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Robotics | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Materials science | onet | Related context only. No individual skill percentile is provided by these sources. |
| Environmental science | onet | Related context only. No individual skill percentile is provided by these sources. |

### Trades & repair

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Carpentry | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Welding | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Plumbing | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Electrical work | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Automotive repair | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Machining | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Masonry | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| HVAC maintenance | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Small-engine repair | onet | Related context only. No individual skill percentile is provided by these sources. |
| Woodworking | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Metalworking | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Appliance repair | onet | Related context only. No individual skill percentile is provided by these sources. |
| Painting & finishing | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Construction planning | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Surveying | ncees | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Home & daily life

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Cooking | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Baking | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Food preservation | onet | Related context only. No individual skill percentile is provided by these sources. |
| Home organization | Research gap | Individual needs and household context limit comparison; no suitable representative rank identified. |
| Cleaning | onet | Related context only. No individual skill percentile is provided by these sources. |
| Sewing | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Clothing repair | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Laundry care | onet | Related context only. No individual skill percentile is provided by these sources. |
| Household maintenance | onet | Related context only. No individual skill percentile is provided by these sources. |
| Event planning | onet | Related context only. No individual skill percentile is provided by these sources. |
| Personal administration | onet | Related context only. No individual skill percentile is provided by these sources. |
| Home safety | redcross | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Creative arts

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Drawing | onet | Related context only. No individual skill percentile is provided by these sources. |
| Painting | onet | Related context only. No individual skill percentile is provided by these sources. |
| Photography | wpc | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Filmmaking | onet | Related context only. No individual skill percentile is provided by these sources. |
| Graphic design | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Sculpture | onet | Related context only. No individual skill percentile is provided by these sources. |
| Pottery | onet | Related context only. No individual skill percentile is provided by these sources. |
| Illustration | onet | Related context only. No individual skill percentile is provided by these sources. |
| Creative writing | onet | Related context only. No individual skill percentile is provided by these sources. |
| Music composition | abrsm | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Singing | abrsm | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Piano | abrsm | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Guitar | abrsm | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Drums | trinity-music | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Violin | abrsm | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Dance | wdsf | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Acting | trinity | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Audio production | onet | Related context only. No individual skill percentile is provided by these sources. |
| Animation | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |

### Outdoors & agriculture

| Skill | Relevant source IDs | Evidence status |
|---|---|---|
| Navigation | iof | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Camping | Research gap | Outdoor training and route achievements are contextual; no universal camping percentile identified. |
| Gardening | worldskills | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Horticulture | worldskills, isa | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Animal care | aavsb | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Agronomy | ncga | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Forestry | isa | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Conservation | isa | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Fishing | igfa | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Bird identification | ebird | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Weather observation | wx | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Outdoor leadership | onet | Related context only. No individual skill percentile is provided by these sources. |
| Beekeeping | bbka | Keep the specific discipline and reference group with the result. No automatic conversion to RPG levels. |
| Soil management | onet | Related context only. No individual skill percentile is provided by these sources. |
| Tractor operation | onet | Related context only. No individual skill percentile is provided by these sources. |

## Next data work

1. Add licensed or public-use datasets with cohort fixtures. Sources above support manual result records unless a local calculator is explicitly stated.
2. [Census CPS PINC](https://www.census.gov/data/tables/time-series/demo/income-poverty/cps-pinc.html) provides personal-income tables; ingest weighted age/sex tables before showing income percentiles. Do not substitute household income or full-time earnings.
3. Detailed SCF wealth percentiles require weighted distributions and correct family definitions. The current median comparison cannot answer top-1% thresholds.
4. Add demographic Concept2 cohorts, USGA handicap distributions, competition datasets and standardized test norms with the applicable license and edition. Preserve selection-bias labels.
5. Curate discipline-specific 30–50 milestone standards and review specialty mappings (e.g. chemistry laboratory work versus all chemistry; mechanical CAD versus all mechanical engineering). Broad mappings state this limitation.
6. Review the ten gaps with practitioners and primary research. “No comparable ranking identified” is a result of this review, not proof of nonexistence.

## Reuse and attribution

This register links primary publishers and contains original short summaries. No third-party rubric or bulk competition database is copied. Review licensing before future imports; public availability does not grant unrestricted redistribution. Numerical table changes need source date, exact units, cohort and regression fixtures.
