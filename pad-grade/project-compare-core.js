/* Pad Grade project comparison math — pure/shared helpers for browser UI and tests. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PadGradeProjectCompareCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const FT_PER_M=3.280839895;
  const EARTH_M=6378137;
  const CORNERS=['SW','SE','NE','NW'];

  function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
  function settings(project){return project&&project.settings&&typeof project.settings==='object'?project.settings:{};}
  function readingKey(r,c){return `${r},${c}`;}

  function isFullyFilled(project){
    const s=settings(project),rows=Math.trunc(Number(s.rows)),cols=Math.trunc(Number(s.cols));
    if(rows<2||cols<2||!project||!project.readings||typeof project.readings!=='object')return false;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(!Number.isFinite(Number(project.readings[readingKey(r,c)])))return false;
    return true;
  }

  function sameLogicalGrid(first,second){
    const a=settings(first),b=settings(second);
    return Math.trunc(Number(a.rows))===Math.trunc(Number(b.rows))&&Math.trunc(Number(a.cols))===Math.trunc(Number(b.cols));
  }

  // Normalize each survey so its configured target plane is elevation zero.
  // A smaller rod reading means the ground is above target; a larger reading
  // means the ground is below target.
  function normalizedElevation(targetRodIn,readingIn){
    const t=Number(targetRodIn),r=Number(readingIn);
    return Number.isFinite(t)&&Number.isFinite(r)?t-r:NaN;
  }

  function deltaAt(firstTarget,firstReading,secondTarget,secondReading){
    return normalizedElevation(secondTarget,secondReading)-normalizedElevation(firstTarget,firstReading);
  }

  function buildComparison(first,second){
    if(!isFullyFilled(first)||!isFullyFilled(second))throw new Error('Both projects must have a reading at every grid point.');
    if(!sameLogicalGrid(first,second))throw new Error('Projects must use the same row and column count so points can be matched by grid location.');
    const a=settings(first),b=settings(second),rows=Math.trunc(Number(a.rows)),cols=Math.trunc(Number(a.cols));
    const width=(Number(a.width)+Number(b.width))/2,length=(Number(a.length)+Number(b.length))/2;
    if(!Number.isFinite(width)||width<=0||!Number.isFinite(length)||length<=0)throw new Error('Both projects need valid pad dimensions.');
    const firstTarget=Number(a.target),secondTarget=Number(b.target);
    if(!Number.isFinite(firstTarget)||!Number.isFinite(secondTarget))throw new Error('Both projects need a valid target rod value.');

    const readings={},points=[];let maxCut=0,maxFill=0,sum=0;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const key=readingKey(r,c),v=deltaAt(firstTarget,first.readings[key],secondTarget,second.readings[key]);
      if(!Number.isFinite(v))throw new Error(`Invalid reading at ${key}.`);
      readings[key]=v;sum+=v;
      if(v<0)maxCut=Math.max(maxCut,-v);else maxFill=Math.max(maxFill,v);
      points.push({r,c,x:c*width/(cols-1),y:r*length/(rows-1),v});
    }
    return {
      rows,cols,width,length,target:0,
      tolerance:Math.max(0.05,Math.min(Number(a.tol)||0.5,Number(b.tol)||0.5)),
      readings,points,maxCut,maxFill,meanDelta:sum/(rows*cols),
      firstTarget,secondTarget,
      dimensionsDiffer:Math.abs(Number(a.width)-Number(b.width))>1e-6||Math.abs(Number(a.length)-Number(b.length))>1e-6
    };
  }

  function hasFourGpsCorners(project){
    const corners=project&&project.gps&&project.gps.corners;
    return !!(corners&&CORNERS.every(name=>{
      const c=corners[name];return c&&Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lon));
    }));
  }

  function averageGpsCorners(first,second){
    if(!hasFourGpsCorners(first)||!hasFourGpsCorners(second))throw new Error('Both projects need four-corner GPS calibration for the comparison map.');
    const out={};
    for(const name of CORNERS){
      const a=first.gps.corners[name],b=second.gps.corners[name];
      const aa=num(a.accuracy),ba=num(b.accuracy),as=num(a.spreadFt),bs=num(b.spreadFt),am=num(a.medianAccuracyFt),bm=num(b.medianAccuracyFt);
      out[name]={
        lat:(Number(a.lat)+Number(b.lat))/2,
        lon:(Number(a.lon)+Number(b.lon))/2,
        accuracy:aa!==null&&ba!==null?(aa+ba)/2:(aa!==null?aa:ba),
        spreadFt:as!==null&&bs!==null?(as+bs)/2:(as!==null?as:bs),
        medianAccuracyFt:am!==null&&bm!==null?(am+bm)/2:(am!==null?am:bm)
      };
    }
    return out;
  }

  function localDeltaFeet(fromLat,fromLon,toLat,toLon){
    const lat0=((Number(fromLat)+Number(toLat))/2)*Math.PI/180;
    const northM=(Number(toLat)-Number(fromLat))*Math.PI/180*EARTH_M;
    const eastM=(Number(toLon)-Number(fromLon))*Math.PI/180*EARTH_M*Math.cos(lat0);
    const east=eastM*FT_PER_M,north=northM*FT_PER_M;
    return {east,north,distance:Math.hypot(east,north)};
  }

  function latLonFromLocalFeet(originLat,originLon,eastFt,northFt){
    const northM=Number(northFt)/FT_PER_M,eastM=Number(eastFt)/FT_PER_M,latRad=Number(originLat)*Math.PI/180;
    return {
      lat:Number(originLat)+(northM/EARTH_M)*180/Math.PI,
      lon:Number(originLon)+(eastM/(EARTH_M*Math.cos(latRad)))*180/Math.PI
    };
  }

  function cornerXY(name,width,length){return {SW:{x:0,y:0},SE:{x:width,y:0},NE:{x:width,y:length},NW:{x:0,y:length}}[name];}
  function uncertaintyFt(corner){
    if(!corner)return 20;
    const reported=Number.isFinite(Number(corner.medianAccuracyFt))?Number(corner.medianAccuracyFt):(Number.isFinite(Number(corner.accuracy))?Number(corner.accuracy)*FT_PER_M:20);
    const spread=Number.isFinite(Number(corner.spreadFt))?Number(corner.spreadFt):0;
    return Math.max(2,reported,spread*2);
  }

  function solveSharedRectangle(corners,width,length){
    width=Number(width);length=Number(length);
    if(!corners||!CORNERS.every(n=>corners[n])||!(width>0)||!(length>0))return null;
    const originLat=CORNERS.reduce((s,n)=>s+Number(corners[n].lat),0)/4;
    const originLon=CORNERS.reduce((s,n)=>s+Number(corners[n].lon),0)/4;
    const obs=CORNERS.map(name=>{
      const c=corners[name],p=localDeltaFeet(originLat,originLon,c.lat,c.lon),q=cornerXY(name,width,length),u=uncertaintyFt(c);
      return {name,c,px:p.east,py:p.north,qx:q.x,qy:q.y,w:1/Math.pow(Math.max(2,u),2)};
    });
    const sw=obs.reduce((s,o)=>s+o.w,0);
    const pbar={x:obs.reduce((s,o)=>s+o.w*o.px,0)/sw,y:obs.reduce((s,o)=>s+o.w*o.py,0)/sw};
    const qbar={x:obs.reduce((s,o)=>s+o.w*o.qx,0)/sw,y:obs.reduce((s,o)=>s+o.w*o.qy,0)/sw};
    let a=0,b=0;
    for(const o of obs){
      const qx=o.qx-qbar.x,qy=o.qy-qbar.y,px=o.px-pbar.x,py=o.py-pbar.y;
      a+=o.w*(qx*px+qy*py);b+=o.w*(qx*py-qy*px);
    }
    const theta=Math.atan2(b,a),ct=Math.cos(theta),st=Math.sin(theta);
    const tx=pbar.x-(ct*qbar.x-st*qbar.y),ty=pbar.y-(st*qbar.x+ct*qbar.y);
    let wrss=0,worst=0;const residuals={};
    for(const o of obs){
      const fx=tx+ct*o.qx-st*o.qy,fy=ty+st*o.qx+ct*o.qy,r=Math.hypot(o.px-fx,o.py-fy);
      residuals[o.name]=r;worst=Math.max(worst,r);wrss+=o.w*r*r;
    }
    return {originLat,originLon,theta,tx,ty,rmsFt:Math.sqrt(wrss/sw),worstFt:worst,residuals};
  }

  function fitPointLatLon(fit,x,y){
    if(!fit)return null;
    const ct=Math.cos(fit.theta),st=Math.sin(fit.theta),east=fit.tx+ct*Number(x)-st*Number(y),north=fit.ty+st*Number(x)+ct*Number(y);
    return latLonFromLocalFeet(fit.originLat,fit.originLon,east,north);
  }

  function padXYFromLatLon(fit,lat,lon){
    if(!fit)return null;
    const d=localDeltaFeet(fit.originLat,fit.originLon,Number(lat),Number(lon)),ex=d.east-fit.tx,ny=d.north-fit.ty,ct=Math.cos(fit.theta),st=Math.sin(fit.theta);
    return {x:ct*ex+st*ny,y:-st*ex+ct*ny};
  }

  function buildSharedGeometry(first,second,comparison){
    const cmp=comparison||buildComparison(first,second),corners=averageGpsCorners(first,second),fit=solveSharedRectangle(corners,cmp.width,cmp.length);
    if(!fit)throw new Error('Could not fit the shared GPS comparison grid.');
    return {corners,fit,width:cmp.width,length:cmp.length};
  }

  return {
    CORNERS,FT_PER_M,EARTH_M,readingKey,isFullyFilled,sameLogicalGrid,normalizedElevation,deltaAt,
    buildComparison,hasFourGpsCorners,averageGpsCorners,localDeltaFeet,latLonFromLocalFeet,
    solveSharedRectangle,fitPointLatLon,padXYFromLatLon,buildSharedGeometry
  };
});
