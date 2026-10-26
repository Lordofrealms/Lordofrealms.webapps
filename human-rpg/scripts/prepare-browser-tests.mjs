import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),dest=new URL('../dist/qa/',import.meta.url);
await mkdir(dest,{recursive:true});
const source=await readFile(new URL('storage.js',root),'utf8');
// Production storage functions, isolated database name and adjusted relative imports only.
await writeFile(new URL('storage-under-test.js',dest),source.replace("'human-rpg-local-v1'","'human-rpg-isolated-test-'+Date.now()").replaceAll("from './","from '../"));
await copyFile(new URL('tests/browser-storage.mjs',root),new URL('browser-storage.mjs',dest));
await copyFile(new URL('tests/browser-photo-ui.mjs',root),new URL('browser-photo-ui.mjs',dest));
const app=await readFile(new URL('app.js',root),'utf8');
await writeFile(new URL('app-under-test.js',dest),app.replaceAll("from './","from '../").replace("from '../storage.js'","from './storage-under-test.js'").replace("'human-rpg-character'","'human-rpg-isolated-ui-'+Date.now()"));
const html=await readFile(new URL('index.html',root),'utf8');
await writeFile(new URL('photo-ui.html',dest),html.replaceAll('href="./','href="../').replace('src="./app.js"','src="./browser-photo-ui.mjs"'));
await writeFile(new URL('storage.html',dest),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Human RPG storage verification</title><style>body{font:16px system-ui;background:#0b1521;color:#e7edf4;padding:32px}li{margin:12px 0}.pass{color:#76dcc0}.fail{color:#ff9e9e}</style><h1>Isolated storage verification</h1><p>Generated synthetic records only. The app’s character database is untouched. No files are uploaded.</p><button id="run">Run persistence checks</button> <button id="large" disabled>Run 108 MiB photo check</button> <button id="download-large" disabled>Download synthetic large ZIP</button><ol id="results"></ol><script type="module" src="./browser-storage.mjs"></script></html>');
await writeFile(new URL('mobile.html',dest),'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Human RPG 390 px viewport</title><style>body{margin:0;background:#03090f;display:flex;justify-content:center}iframe{border:0;width:390px;height:900px;max-width:100vw}</style><iframe title="Human RPG at 390 pixels" src="../index.html"></iframe></html>');
console.log('Prepared isolated storage, photo UI and mobile fixtures in dist/qa; none is part of the app delivery.');
