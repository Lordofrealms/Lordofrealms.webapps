/* Pad Grade v0.8.6 DEV — comparison presentation parity.
 *
 * The temporary comparison map keeps its averaged rectangular geometry, but its
 * point styling and legend now match the normal project presentation: labeled
 * points with categorical CUT / GRADE / FILL colors and a color key below the map.
 */
(function installPadGrade086ComparePresentation(){
  'use strict';

  const COMPARE_MAP_ID='pgCompareMap';
  const POINT_SOURCE='pg-compare-points';
  const POINT_LAYER='pg-compare-point-layer';
  const LABEL_LAYER='pg-compare-label-layer';
  const LEGEND_ID='pgCompareLegendV086';
  const GRADE='#4f8f3a';
  const CUT='#e67e2d';
  const FILL='#3689cd';

  function compareMap(){return window.__padGradeCompareMapInstance||null;}
  function pointStatus(delta,tol){
    const d=Number(delta),t=Math.max(0,Number(tol)||0);
    if(!Number.isFinite(d))return 'empty';
    if(Math.abs(d)<=t)return 'grade';
    return d<0?'cut':'fill';
  }
  function formatDelta(delta){
    const d=Number(delta);if(!Number.isFinite(d))return '';
    try{
      if(typeof window.pgFmtGrade==='function')return window.pgFmtGrade(Math.abs(d),1);
    }catch(e){}
    return `${Math.abs(d).toFixed(1)}″`;
  }

  function enhancePointSource(map){
    if(!map)return false;
    let src=null;try{src=map.getSource(POINT_SOURCE);}catch(e){}
    if(!src)return false;

    // Comparison core exposes its last completed comparison so presentation can
    // be rebuilt without touching the active project or recomputing the delta.
    const result=window.__padGradeLastComparisonResult||window.PadGradeProjectCompare?.lastResult||null;
    const points=result?.points||result?.gridPoints||null;
    if(!Array.isArray(points)||!points.length)return false;
    const tol=Math.max(0,Number(result?.toleranceIn??result?.tol??0.5)||0.5);
    const features=[];
    for(const p of points){
      const lon=Number(p.lon??p.longitude),lat=Number(p.lat??p.latitude),delta=Number(p.deltaIn??p.delta??p.value);
      if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
      const label=String(p.label??p.name??'');
      const status=pointStatus(delta,tol);
      features.push({
        type:'Feature',
        properties:{label,status,deltaIn:delta,deltaText:formatDelta(delta)},
        geometry:{type:'Point',coordinates:[lon,lat]}
      });
    }
    if(!features.length)return false;
    try{src.setData({type:'FeatureCollection',features});}catch(e){return false;}
    return true;
  }

  function stylePoints(map){
    if(!map)return false;
    try{
      if(map.getLayer(POINT_LAYER)){
        map.setPaintProperty(POINT_LAYER,'circle-radius',5);
        map.setPaintProperty(POINT_LAYER,'circle-color',['match',['get','status'],'cut',CUT,'grade',GRADE,'fill',FILL,'#6f7a86']);
        map.setPaintProperty(POINT_LAYER,'circle-stroke-color','#ffffff');
        map.setPaintProperty(POINT_LAYER,'circle-stroke-width',1.4);
        map.setPaintProperty(POINT_LAYER,'circle-opacity',.98);
      }
      if(!map.getLayer(LABEL_LAYER)&&map.getSource(POINT_SOURCE)){
        map.addLayer({
          id:LABEL_LAYER,
          type:'symbol',
          source:POINT_SOURCE,
          layout:{
            'text-field':['get','label'],
            'text-size':11,
            'text-offset':[0,-1.15],
            'text-anchor':'bottom',
            'text-allow-overlap':true,
            'text-ignore-placement':true
          },
          paint:{
            'text-color':'#ffffff',
            'text-halo-color':'#111820',
            'text-halo-width':1.5,
            'text-halo-blur':.3
          }
        });
      }
      if(map.getLayer(LABEL_LAYER))map.moveLayer(LABEL_LAYER);
      if(map.getLayer(POINT_LAYER))map.moveLayer(POINT_LAYER);
      if(map.getLayer(LABEL_LAYER))map.moveLayer(LABEL_LAYER);
      return true;
    }catch(e){return false;}
  }

  function ensureLegend(){
    const mapEl=document.getElementById(COMPARE_MAP_ID);if(!mapEl)return false;
    const host=mapEl.parentElement||mapEl;
    let legend=document.getElementById(LEGEND_ID);
    if(!legend){
      legend=document.createElement('div');legend.id=LEGEND_ID;legend.className='pgCompareLegendV086';
      legend.innerHTML=`
        <div class="pgCompareLegendBar" aria-label="Comparison change color key">
          <span class="cut"></span><span class="grade"></span><span class="fill"></span>
        </div>
        <div class="pgCompareLegendLabels"><span>CUT</span><span>GRADE</span><span>FILL</span></div>`;
      host.insertAdjacentElement('afterend',legend);
    }
    return true;
  }

  function installStyle(){
    if(document.getElementById('pgComparePresentationStyleV086'))return;
    const style=document.createElement('style');style.id='pgComparePresentationStyleV086';style.textContent=`
      .pgCompareLegendV086{padding:8px 14px 10px;background:#10161d;border-top:1px solid #2d3947}
      .pgCompareLegendBar{height:10px;display:grid;grid-template-columns:1fr .22fr 1fr;border-radius:6px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
      .pgCompareLegendBar .cut{background:linear-gradient(90deg,#b42d23,#e67e2d,#f7c45c)}
      .pgCompareLegendBar .grade{background:${GRADE}}
      .pgCompareLegendBar .fill{background:linear-gradient(90deg,#67cddc,#3689cd,#2850c8)}
      .pgCompareLegendLabels{display:grid;grid-template-columns:1fr auto 1fr;margin-top:4px;font-size:10px;font-weight:800;letter-spacing:.08em;color:#c9d1da}
      .pgCompareLegendLabels span:nth-child(2){text-align:center}.pgCompareLegendLabels span:last-child{text-align:right}
    `;document.head.appendChild(style);
  }

  function apply(){
    installStyle();ensureLegend();
    const map=compareMap();if(!map)return false;
    enhancePointSource(map);stylePoints(map);
    return true;
  }

  function observeCompare(){
    let attempts=0;
    const timer=setInterval(()=>{
      const mapEl=document.getElementById(COMPARE_MAP_ID);
      if(!mapEl){if(++attempts>120)clearInterval(timer);return;}
      apply();
      if(compareMap())clearInterval(timer);
    },100);
  }

  window.addEventListener('padgrade-comparison-opened',()=>setTimeout(apply,0));
  window.addEventListener('padgrade-comparison-rendered',()=>setTimeout(apply,0));
  const originalOpen=window.PadGradeProjectCompare?.open;
  if(typeof originalOpen==='function'&&!originalOpen.__v086Presentation){
    const wrapped=function(){const out=originalOpen.apply(this,arguments);setTimeout(observeCompare,0);return out;};
    wrapped.__v086Presentation=true;window.PadGradeProjectCompare.open=wrapped;
  }
  observeCompare();
  window.__padGradeComparePresentationV086='normal-point-colors-labels-and-key';
})();
