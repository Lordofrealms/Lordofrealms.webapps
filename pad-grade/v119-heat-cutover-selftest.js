const fs=require('fs');
const html=fs.readFileSync('pad-grade/index.html','utf8');
const js=fs.readFileSync('pad-grade/v119-dev.js','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');
function ok(v,m){if(!v)throw new Error(m);}
function semverAtLeast(v,f){const a=String(v).split('.').map(Number),b=String(f).split('.').map(Number);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}return true;}
const title=(html.match(/Pad Grade Mapper v([0-9]+\.[0-9]+\.[0-9]+) DEV/)||[])[1];
const version=(gradle.match(/versionName = "([0-9]+\.[0-9]+\.[0-9]+)"/)||[])[1];
const code=Number((gradle.match(/versionCode = ([0-9]+)/)||[])[1]);
ok(title&&semverAtLeast(title,'1.1.9'),'current DEV title regressed below 1.1.9');
ok(!html.includes('<script src="v119-dev.js'),'superseded v119 runtime must not be executable');
ok(js.includes("source.updateImage({image:frame.image,coordinates:coords})"),'historical v119 direct-image behavior unexpectedly changed');
ok(js.includes('heatmap.v119-image-committed'),'historical v119 diagnostics missing');
ok(version&&semverAtLeast(version,'1.1.9')&&code>=91,'Android version/build regressed below v1.1.9');
console.log('Pad Grade v1.1.9 historical carry-forward self-test passed');
