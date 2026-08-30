/* Pad Grade v0.9.9 DEV — grading target calculation optimization.
 *
 * Preserves the existing 90-resolution equal-area sample grid and global IDW²
 * interpolation. The Delaunay-union coverage test is replaced by the equivalent
 * convex-hull coverage test, and the target-independent sampled surface/sorted
 * elevations are cached until measured points or pad/grid geometry actually change.
 */
(function installPadGrade099GradeCalcOptimization(){
  'use strict';

  const CALC_RESOLUTION=90;
  let cache={key:'',surface:null,values:null,sorted:null,neutral:NaN};

  function now(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function diagStart(name,details){try{return window.PadGradeDiag?.start?.(name,details)||null;}catch(e){return null;}}
  function diagEnd(token,details){try{if(token)window.PadGradeDiag?.end?.(token,details);}catch(e){}}
  function cross(o,a,b){return (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);}
  function convexHull(points){
    const unique=[],seen=new Set();
    for(const p of points){
      const key=`${p.x},${p.y}`;
      if(!seen.has(key)){seen.add(key);unique.push({x:+p.x,y:+p.y});}
    }
    if(unique.length<3)return [];
    unique.sort((a,b)=>a.x-b.x||a.y-b.y);
    const lower=[];
    for(const p of unique){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
    const upper=[];
    for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
    lower.pop();upper.pop();
    const hull=lower.concat(upper);
    if(hull.length<3)return [];
    let area2=0;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];area2+=a.x*b.y-b.x*a.y;}
    return Math.abs(area2)>1e-8?hull:[];
  }
  function pointInConvex(x,y,hull){
    let sign=0;
    for(let i=0;i<hull.length;i++){
      const a=hull[i],b=hull[(i+1)%hull.length],z=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
      if(Math.abs(z)<=1e-9)continue;
      const s=z>0?1:-1;
      if(!sign)sign=s;else if(sign!==s)return false;
    }
    return true;
  }
  function surfaceKey(s,points,resolution){
    return JSON.stringify({resolution,width:s.width,length:s.length,rows:s.rows,cols:s.cols,points:points.map(p=>[p.r,p.c,p.v])});
  }
  function buildSurface(s,points,resolution){
    const hull=convexHull(points);
    if(hull.length<3)return{pts:points,hull,samples:[],coveredFt2:0};
    const nx=Math.max(24,Math.min(resolution,120)),ny=Math.max(24,Math.round(nx*s.length/Math.max(s.width,1))),area=s.width*s.length/(nx*ny),samples=[];
    for(let iy=0;iy<ny;iy++){
      const y=(iy+.5)/ny*s.length;
      for(let ix=0;ix<nx;ix++){
        const x=(ix+.5)/nx*s.width;
        if(!pointInConvex(x,y,hull))continue;
        const v=pgIdw2(x,y,points);
        if(Number.isFinite(v))samples.push({x,y,v,areaFt2:area});
      }
    }
    return{pts:points,hull,samples,coveredFt2:samples.length*area};
  }
  function surfaceEntry(resolution=CALC_RESOLUTION){
    const s=cfg(),points=pgMeasuredSurfacePoints(),key=surfaceKey(s,points,resolution);
    if(cache.key===key&&cache.surface&&cache.values&&cache.sorted)return{...cache,cacheHit:true};
    const surface=buildSurface(s,points,resolution),values=surface.samples.map(p=>p.v),neutral=values.length?values.reduce((a,b)=>a+b,0)/values.length:NaN,sorted=[...values].sort((a,b)=>a-b);
    cache={key,surface,values,sorted,neutral};
    return{...cache,cacheHit:false};
  }

  window.pgCalculateTargets=function(){
    const totalToken=diagStart('grading-calc.total',{resolution:CALC_RESOLUTION});
    const surfaceToken=diagStart('grading-calc.surface',{resolution:CALC_RESOLUTION});
    const surfaceStarted=now(),entry=surfaceEntry(CALC_RESOLUTION),surface=entry.surface;
    diagEnd(surfaceToken,{cacheHit:entry.cacheHit,pointCount:surface.pts.length,sampleCount:surface.samples.length,elapsedMs:+(now()-surfaceStarted).toFixed(1)});
    if(surface.samples.length<3){
      const result={error:'At least three non-collinear measured points are required before the surface can be interpolated.'};
      diagEnd(totalToken,{cacheHit:entry.cacheHit,pointCount:surface.pts.length,sampleCount:surface.samples.length,error:true});
      return result;
    }

    const targetToken=diagStart('grading-calc.min-area',{cacheHit:entry.cacheHit,sampleCount:entry.sorted.length});
    const neutral=entry.neutral,tol=cfg().tol,sorted=entry.sorted;
    let bestCount=0,bestTarget=neutral;
    for(let i=0,j=0;i<sorted.length;i++){
      if(j<i)j=i;
      while(j<sorted.length&&sorted[j]-sorted[i]<=2*tol+1e-9)j++;
      const count=j-i;
      if(count>bestCount){bestCount=count;bestTarget=(sorted[i]+sorted[j-1])/2;}
      else if(count===bestCount&&count>0){const candidate=(sorted[i]+sorted[j-1])/2;if(Math.abs(candidate-neutral)<Math.abs(bestTarget-neutral))bestTarget=candidate;}
    }
    diagEnd(targetToken,{cacheHit:entry.cacheHit,sampleCount:sorted.length,bestCount});

    const earthworkToken=diagStart('grading-calc.earthwork',{sampleCount:surface.samples.length});
    const neutralWork=pgEarthworkAt(neutral,surface,tol),minWork=pgEarthworkAt(bestTarget,surface,tol);
    diagEnd(earthworkToken,{sampleCount:surface.samples.length});
    const result={surface,neutral,neutralWork,minAreaTarget:bestTarget,minAreaWork:minWork,coveredFt2:surface.coveredFt2,tolerance:tol};
    diagEnd(totalToken,{cacheHit:entry.cacheHit,pointCount:surface.pts.length,sampleCount:surface.samples.length});
    return result;
  };

  window.pgApplySuggestedTarget=function(targetIn){
    $('target').value=pgRoundInput(pgRodInToInput(targetIn),pgUnitMode()==='metric'?3:2);
    saveLocal();renderGrid();updateGpsUI();
    // Target elevation does not change the sampled ground surface or either
    // suggested target. Keep the result that was just calculated instead of
    // immediately rebuilding/re-scanning the same surface a second time.
    pgRenderCalc();
    try{window.PadGradeDiag?.mark?.('grading-calc.apply-reused-result',{cachedResult:true});}catch(e){}
  };

  window.__padGradeGradeCalcOptimizationV099={
    version:'0.9.9',resolution:CALC_RESOLUTION,
    policy:'same-90-grid-same-global-idw2-convex-hull-coverage-single-surface-cache-no-apply-recalc',
    clearCache(){cache={key:'',surface:null,values:null,sorted:null,neutral:NaN};}
  };
})();
