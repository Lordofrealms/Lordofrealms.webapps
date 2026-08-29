/* Pad Grade v0.5.2 — make project rename authoritative across live and saved state. */
(function installPadGradeV052(){
  'use strict';

  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREFIX='padGradeProjectV5:';
  const $=id=>document.getElementById(id);
  const nowIso=()=>new Date().toISOString();

  function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value==null?fallback:value;}catch(e){return fallback;}}
  function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function projectKey(id){return PREFIX+id;}

  function durableWrite(project){
    try{
      if(!window.PadGradeNative||typeof PadGradeNative.hasProjectFolder!=='function'||!PadGradeNative.hasProjectFolder())return;
      if(typeof PadGradeNative.isProjectFolderIndexReady==='function'&&!PadGradeNative.isProjectFolderIndexReady())return;
      const filename=`${project.fileId?`${project.fileId}-`:''}${project.id}.padgrade`,text=JSON.stringify(project);
      if(window.PadGradeFiles?.write){window.PadGradeFiles.write(filename,text);return;}
      if(typeof PadGradeNative.writeProjectFile==='function')PadGradeNative.writeProjectFile(filename,text);
    }catch(e){}
  }

  function renameProject(id){
    id=String(id||'');if(!id)return false;
    const project=readJson(projectKey(id),null),index=readJson(INDEX_KEY,[]);if(!project||!Array.isArray(index))return false;
    const item=index.find(x=>x.id===id);if(!item)return false;
    const oldName=project.settings?.name||item.name||'Pad',entered=prompt('Project name',oldName);if(entered===null)return true;
    const name=entered.trim();if(!name)return true;
    const stamp=nowIso();project.settings=project.settings||{};project.settings.name=name;project.modifiedAt=stamp;item.name=name;item.modifiedAt=stamp;item.status=(project.status||item.status)==='archived'?'archived':'open';project.status=item.status;
    writeJson(projectKey(id),project);writeJson(INDEX_KEY,index);durableWrite(project);
    if(localStorage.getItem(ACTIVE_KEY)===id){if($('projectName'))$('projectName').value=name;if($('v040ProjectName'))$('v040ProjectName').textContent=name;try{window.__padGradeRefreshProjectIndex?.();}catch(e){}try{updateStats();}catch(e){}}
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
    try{window.dispatchEvent(new CustomEvent('padgrade-project-renamed',{detail:{id,name}}));}catch(e){}
    return true;
  }

  function installRenameInterceptor(){
    const dlg=$('projectsDlg');if(!dlg||dlg.dataset.v052Rename==='1')return;dlg.dataset.v052Rename='1';
    dlg.addEventListener('click',event=>{
      const button=event.target?.closest?.('button[data-act="rename"]');if(!button||!dlg.contains(button))return;
      const row=button.closest('[data-id]');if(!row)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();renameProject(row.dataset.id);
    },true);
  }

  function boot(){document.title='Pad Grade Mapper v0.9.6 DEV';installRenameInterceptor();}
  window.__padGradeRenameProject=renameProject;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})();
