// Published weighted survey percentiles, not an invented continuous distribution.
export const SOURCES = {
 nhanes:{name:'CDC / NCHS · NHANES 2021–2023',year:'August 2021–August 2023',url:'https://www.cdc.gov/nchs/data/series/sr_03/sr03-050.pdf',method:'Tables 10 and 12. Published weighted percentiles for the US civilian noninstitutionalized population age 20+. Pregnant females are excluded. Source uses male/female sex cohorts; select the reference that is relevant to you.',limitation:'A distribution of body measurements, not a ranking of health or ability. Values between published points are shown as a percentile interval; tails are not extrapolated.'},
 scf:{name:'Federal Reserve · 2025 Survey of Consumer Finances',year:'2025 survey; published October 2026',url:'https://www.federalreserve.gov/publications/files/scf26.pdf',method:'Table 2. Median family net worth by age of the family reference person, in 2025 US dollars. Net worth is assets minus liabilities. SCF families are primary economic units, not necessarily everyone sharing a home.',limitation:'Directional comparison to a family median only. No individual, sex-specific, top-10%, or top-1% wealth percentile is inferred. Current dollars are compared directly with the published 2025 values; no inflation adjustment is applied.'}
};
export const PERCENTILES=[5,10,15,25,50,75,85,90,95];
const BMI={male:[
 [18.9,19.9,21.6,23.3,27,31.1,34.2,36.1,39.6],
 [21.2,22.7,23.3,24.9,27.8,33,35.6,38,42.5],
 [22.2,23.3,24.1,25.7,28.9,33.5,35.8,39.2,45],
 [21.6,23,24.1,25.5,29,33.3,36.6,38.9,44.6],
 [21.2,22.7,23.9,25.2,28.3,32.1,34.1,36,39.9],
 [21.6,22.9,23.9,25.6,28.8,32.3,34.6,36.5,39.2],
 [21.1,22.8,24.2,24.6,27.2,30.2,32.1,32.6,34.8]],female:[
 [18.6,19.9,21,22.2,25.5,31.6,36.6,39.7,45.6],
 [19.7,21.3,22.3,24.2,28.6,35.2,40.4,42.1,47.4],
 [19.7,21.9,23,24.6,28.5,35.1,38.8,41,45.6],
 [20.8,22.3,23.4,24.9,30,36.5,40.2,42.4,45.9],
 [20,22,23.1,24.8,28.8,34.5,37.9,40,42.5],
 [20.7,22,23.2,24.7,28,33.4,36.5,38.3,42.2],
 [19.2,21.1,22,23.6,26.9,31.3,33.3,34.7,36.3]]};
const WAIST={male:[
 [71.3,75.7,77.9,82.6,93.4,106.1,112.6,117.8,124.4],
 [80.3,82.6,85.9,90,98.6,109.9,118.9,123.1,130.5],
 [83.7,86.6,88.3,92.2,101.5,114,120.7,127.7,139.6],
 [83.2,88.2,90.5,94.2,104.3,114.8,123.4,128.4,137],
 [84.2,87.4,90.2,95.5,104.5,113.1,119.5,123.4,132.2],
 [84.6,88.6,92.8,97.3,106.6,117.1,122.6,126.5,131.3],
 [84.5,89.6,92.8,95.3,102.6,111.4,117,120.5,126]],female:[
 [68.5,72.3,74.5,77.2,85.3,98.5,112.3,118.6,127.3],
 [72.6,75.6,78.2,83.9,93.1,108.8,121.6,126.6,133.6],
 [75.3,77,81.3,85.2,95.7,109.2,115.9,121.6,130.8],
 [77.7,81.5,84,88.4,100.8,112.6,119.3,122,130.8],
 [77.1,81.7,83.6,88.8,99.6,110.4,117.1,120.7,125.5],
 [76.7,81.2,84.6,89.1,98.9,108.4,115.3,119.3,123.7],
 [76.4,79.3,84.1,88.8,94.4,107.2,110.5,111.9,119.1]]};
export function bodyComparison(metric,value,age,sex){
 if(!Number.isFinite(value)||!Number.isInteger(age)||age<20||age>120||!['male','female'].includes(sex)||!['bmi','waist'].includes(metric))return null;
 const i=Math.min(6,Math.floor(age/10)-2),row=(metric==='bmi'?BMI:WAIST)[sex][i];
 let low=0,high=100;
 for(let j=0;j<row.length;j++){if(value===row[j]){low=high=PERCENTILES[j];break;}if(value>row[j])low=PERCENTILES[j];else{high=PERCENTILES[j];break;}}
 const label=low===high?`Around the ${low}th percentile`:low===0?'Below the 5th percentile':high===100?'Above the 95th percentile':`${low}th–${high}th percentile range`;
 return {low,high,label,median:row[4],cohort:`US ${sex} reference, age ${i===6?'80+':`${20+i*10}–${29+i*10}`}`,source:'nhanes'};
}
export function wealthComparison(value,referenceAge){
 if(!Number.isFinite(value)||!Number.isInteger(referenceAge)||referenceAge<18||referenceAge>120)return null;
 const rows=[[35,33000,'Under 35'],[45,155600,'35–44'],[55,253700,'45–54'],[65,411900,'55–64'],[75,431300,'65–74'],[121,504900,'75+']];
 const [,median,age]=rows.find(([upper])=>referenceAge<upper);
 return {median,difference:value-median,label:value===median?'At the published median':`${value>median?'Above':'Below'} the published family median`,cohort:`US families · reference person age ${age}`,source:'scf'};
}
export const METRICS=[{id:'bmi',name:'Body mass index',unit:'kg/m²',min:5,max:150},{id:'waist',name:'Waist circumference',unit:'cm',min:20,max:400},{id:'personal-income',name:'Total annual personal income',unit:'USD / year',min:0,max:1e12},{id:'personal-net-worth',name:'Personal net worth',unit:'USD',min:-1e12,max:1e12},{id:'family-net-worth',name:'Family net worth (SCF unit)',unit:'USD',min:-1e12,max:1e12},{id:'running-5k',name:'5 km running time',unit:'minutes',min:1,max:1000},{id:'bench-press',name:'Bench press',unit:'lb',min:0,max:2000},{id:'cognitive-score',name:'Standardized cognitive test score',unit:'test points',min:0,max:300}];
export function comparisonFor(m){return ['bmi','waist'].includes(m.metric)?bodyComparison(m.metric,m.value,m.age,m.sex):m.metric==='family-net-worth'?wealthComparison(m.value,m.age):null;}
