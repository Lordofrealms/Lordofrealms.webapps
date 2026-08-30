/* Pad Grade v0.8.6 DEV — comparison presentation parity.
 *
 * The temporary comparison map keeps its averaged rectangular geometry, while
 * point styling/labels match the normal GPS project map and the heat-map color
 * key is shown below the comparison map.
 */
(function installPadGrade086ComparePresentation(){
  'use strict';

  const COMPARE_MAP_ID='pgCompareMap';
  const POINT_SOURCE='pg-compare-points';
  const POINT_LAYER='pg-compare-point-layer';
  const LABEL_LAYER='pg-compare-label-layer';
  const LEGEND_ID='pgCompareLegendV086';
  const CUT='#a83a2b',GRADE='#4f8f3a',FILL='#315fa8';
  let lastScale={tol:.5,maxCut:0,maxFill:0};

  function compareMap(){return window.__padGradeCompareMapInstance||null;}
  function selectedTolerance(){
    try{
      const ids=[document.getElementById('projectCompareFirst')?.value,document.getElementById('projectCompareSecond')?.value].filter(Boolean);
      const vals=[];
      for(const id of ids){const p=JSON.parse(localStorage.getItem(`padGradeProjectV5:${id}`)||'null');const t=Number(p?.settings?.tol);if(Number.isFinite(t))vals.push(t);}
      return Math.max(.05,vals.length?Math.min(...vals):.5);
    }catch(e){return .5;}
  }
  function pointStatus(delta,tol){const d=Number(delta);if(!Number.isFinite(d))return 'empty';if(Math.abs(d)<=tol)return 'grade';return d<0?'cut':'fill';}
  function pointLabel(r,c){
    try{if(typeof window.label==='function')return String(window.label(Number(r),Number(c)));}catch(e){}
    const col=Number(c),row=Number(r);return Number.isInteger(col)&&Number.isInteger(row)?`${String.fromCharCode(65+Math.max(0,Math.min(25,col)))}${row+1}`:'';
  }
  function fmt(v){
    const n=Number(v);if(!Number.isFinite(n))return '—';
    try{if(typeof window.pgFmtGrade==='function')return window.pgFmtGrade(Math.abs(n),1);}catch(e){}
    return `${Math.abs(n).toFixed(1)}″`;
  }

  function enhancePointSource(map){
    if(!map)return false;
    let src=null,queried=[];
    try{src=map.getSource(POINT_SOURCE);queried=map.querySourceFeatures(POINT_SOURCE)||[];}catch(e){return false;}
    if(!src||!queried.length)return false;
    const tol=selectedTolerance(),seen=new Set(),features=[];let maxCut=0,maxFill=0;
    for(const feature of queried){
      const p=feature?.properties||{},r=Number(p.r),c=Number(p.c),delta=Number(p.delta);
      const coords=feature?.geometry?.coordinates;if(!Array.isArray(coords)||coords.length<2||!Number.isFinite(+coords[0])||!Number.isFinite(+coords[1]))continue;
      const key=`${r},${c}`;if(seen.has(key))continue;seen.add(key);
      if(delta<0)maxCut=Math.max(maxCut,-delta);else if(delta>0)maxFill=Math.max(maxFill,delta);
      features.push({type:'Feature',properties:{r,c,delta,label:pointLabel(r,c),status:pointStatus(delta,tol)},geometry:{type:'Point',coordinates:[+coords[0],+coords[1]]}});
    }
    if(!features.length)return false;
    lastScale={tol,maxCut,maxFill};
    try{src.setData({type:'FeatureCollection',features});}catch(e){return false;}
    return true;
  }

  function stylePoints(map){
    if(!map)return false;
    try{
      if(map.getLayer(POINT_LAYER)){
        map.setPaintProperty(POINT_LAYER,'circle-radius',6);
        map.setPaintProperty(POINT_LAYER,'circle-color',['match',['get','status'],'cut',CUT,'fill',FILL,'grade',GRADE,'#66717d']);
        map.setPaintProperty(POINT_LAYER,'circle-stroke-color','#ffffff');
        map.setPaintProperty(POINT_LAYER,'circle-stroke-width',1);
        map.setPaintProperty(POINT_LAYER,'circle-opacity',1);
      }
      if(!map.getLayer(LABEL_LAYER)&&map.getSource(POINT_SOURCE)){
        map.addLayer({id:LABEL_LAYER,type:'symbol',source:POINT_SOURCE,minzoom:18,layout:{'text-field':['get','label'],'text-size':10,'text-offset':[0,1.2],'text-anchor':'top'},paint:{'text-color':'#ffffff','text-halo-color':'#111820','text-halo-width':1.5}});
      }
      // Same foreground order as the normal project map: points, then labels.
      if(map.getLayer(POINT_LAYER))map.moveLayer(POINT_LAYER);
      if(map.getLayer(LABEL_LAYER))map.moveLayer(LABEL_LAYER);
      return !!map.getLayer(POINT_LAYER);
    }catch(e){return false;}
  }

  function ensureLegend(){
    const mapEl=document.getElementById(COMPARE_MAP_ID);if(!mapEl)return false;
    const mapWrap=mapEl.parentElement;if(!mapWrap)return false;
    let legend=document.getElementById(LEGEND_ID);
    if(!legend){
      legend=document.createElement('div');legend.id=LEGEND_ID;legend.className='pgCompareLegendV086';
      mapWrap.insertAdjacentElement('afterend',legend);
    }
    legend.innerHTML=`<div class="pgCompareLegendBar" aria-label="Comparison heat-map color key"><span class="cut"></span><span class="grade"></span><span class="fill"></span></div><div class="pgCompareLegendLabels"><span>CUT ${fmt(lastScale.maxCut)}</span><span>GRADE ±${fmt(lastScale.tol)}</span><span>FILL ${fmt(lastScale.maxFill)}</span></div>`;
    return true;
  }

  function installStyle(){
    if(document.getElementById('pgComparePresentationStyleV086'))return;
    const style=document.createElement('style');style.id='pgComparePresentationStyleV086';style.textContent=`
      .pgCompareOverlay{grid-template-rows:auto minmax(0,1fr) auto!important}
      .pgCompareLegend{display:none!important}
      .pgCompareLegendV086{padding:8px 14px 10px;background:#10161d;border-top:1px solid #2d3947}
      .pgCompareLegendBar{height:10px;display:grid;grid-template-columns:1fr .18fr 1fr;border-radius:6px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
      .pgCompareLegendBar .cut{background:linear-gradient(90deg,#b42d23 0%,#e67e2d 55%,#f7c45c 100%)}
      .pgCompareLegendBar .grade{background:#4f8f3a}
      .pgCompareLegendBar .fill{background:linear-gradient(90deg,#67cddc 0%,#3689cd 55%,#2850c8 100%)}
      .pgCompareLegendLabels{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;margin-top:4px;font-size:10px;font-weight:800;color:#c9d1da}
      .pgCompareLegendLabels span:nth-child(2){text-align:center;white-space:nowrap}.pgCompareLegendLabels span:last-child{text-align:right}
    `;document.head.appendChild(style);
  }

  function apply(){
    if(window.__padGradeCompareFastV107)return false;
    installStyle();
    const map=compareMap();if(!map)return false;
    const enriched=enhancePointSource(map),styled=stylePoints(map);
    if(enriched||styled)ensureLegend();
    return enriched&&styled;
  }

  function observeCompare(){
    let attempts=0;
    const timer=setInterval(()=>{
      if(window.__padGradeCompareFastV107){clearInterval(timer);window.__padGradeComparePresentationV086='superseded-by-v107-authoritative-renderer';return;}
      const mapEl=document.getElementById(COMPARE_MAP_ID);
      if(!mapEl){if(++attempts>180)clearInterval(timer);return;}
      if(apply())clearInterval(timer);
      else if(++attempts>180)clearInterval(timer);
    },100);
  }

  const originalOpen=window.PadGradeProjectCompare?.open;
  if(typeof originalOpen==='function'&&!originalOpen.__v086Presentation){
    const wrapped=function(){const out=originalOpen.apply(this,arguments);setTimeout(observeCompare,0);return out;};
    wrapped.__v086Presentation=true;window.PadGradeProjectCompare.open=wrapped;
  }
  document.addEventListener('click',event=>{if(event.target?.id==='projectCompareStart')setTimeout(observeCompare,50);});
  observeCompare();
  window.__padGradeComparePresentationV086='normal-point-colors-labels-and-key';
})();
