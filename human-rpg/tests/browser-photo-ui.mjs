// Synthetic fixture for production UI testing without a file picker or uploads.
import * as DB from './storage-under-test.js';
import * as E from '../engine.js';
const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8c8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const photo=DB.preparePhoto(new File([bytes],'synthetic-pixel.png',{type:'image/png'})),state=E.createState({name:'Photo QA fixture',timeZone:'America/Chicago'});
E.logActivity(state,{skillId:'cooking',title:'Synthetic photo example',photos:[photo.id]});
await DB.saveState(state,0,[photo]);
await import('./app-under-test.js');
