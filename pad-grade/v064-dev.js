/* Pad Grade v0.6.3 DEV — first-class project notes UI. */
(function installPadGrade064Notes(){
  'use strict';
  const $=id=>document.getElementById(id);
  let saveTimer=null;

  function saveNotesSoon(){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      try{saveLocal();}catch(e){}
      try{pgUpdateNotesSummary();}catch(e){}
    },120);
  }

  function install(){
    const textarea=$('projectNotes');
    const settings=$('settingsBtn');
    if(!textarea||!settings||$('notesBtn'))return;

    const oldField=textarea.closest('.field');
    const dlg=document.createElement('dialog');
    dlg.id='projectNotesDlg';
    dlg.innerHTML='<div class="modal"><h2>Project Notes</h2><div id="projectNotesFieldHost"></div><div class="small">Benchmarks, laser setup, site conditions, assumptions, or anything else you want saved with this project.</div><div class="modalActions"><button id="notesCloseBtn" class="primary" type="button">Done</button></div></div>';
    document.body.appendChild(dlg);
    const host=$('projectNotesFieldHost');
    if(oldField)host.appendChild(oldField);
    else host.appendChild(textarea);

    const btn=document.createElement('button');
    btn.id='notesBtn';btn.type='button';btn.textContent='Notes';
    settings.parentElement.insertBefore(btn,settings);
    btn.onclick=()=>{try{dlg.showModal();textarea.focus();}catch(e){}};
    $('notesCloseBtn').onclick=()=>{try{saveLocal();}catch(e){}try{pgUpdateNotesSummary();}catch(e){}dlg.close();};
    textarea.addEventListener('input',saveNotesSoon);
    dlg.addEventListener('close',()=>{try{saveLocal();}catch(e){}try{pgUpdateNotesSummary();}catch(e){}});

    // Keep Settings about configuration only; notes live behind their own button.
    try{pgUpdateNotesSummary();}catch(e){}
    window.__padGradeNotesUi='top-level-dialog';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
