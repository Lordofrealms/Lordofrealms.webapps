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
  const DEFAULT_MAX_CORNER_DISTANCE_FT=20;
  const DIMENSION_EPS_FT=1e-6;

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

  function validDimensions(project){
    const s=settings(project),width=Number(s.width),length=Number(s.length);
    return Number.isFinite(width)&&width>0&&Number.isFinite(length)&&length>0;
  }

  function samePhysicalSize(first,second,epsilonFt=DIMENSION_EPS_FT){
    if(!validDimensions(first)||!validDimensions(second))return false;
    const a=settings(first),b=settings(second),eps=Math.max(0,Number(epsilonFt)||0);
    return Math.abs(Number(a.width)-Number(b.width))<=eps&&Math.abs(Number(a.length)-Number(b.length))<=eps;
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

  function hasFourGpsCorners(project){
    const corners=project&&project.gps&&project.gps.corners;
    return !!(corners&&CORNERS.every(name=>{
      const c=corners[name];return c&&Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lon));
    }));
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

  function midpointLatLonLocal(first,second){
    const d=localDeltaFeet(first.lat,first.lon,second.lat,second.lon);
    return latLonFromLocalFeet(first.lat,first.lon,d.east/2,d.north/2);
  }

  function correspondingCornerDistances(first,second){
    if(!hasFourGpsCorners(first)||!hasFourGpsCorners(second))return null;
    const out={};
    for(const name of CORNERS){
      const a=first.gps.corners[name],b=second.gps.corners[name];
      out[name]=localDeltaFeet(a.lat,a.lon,b.lat,b.lon).distance;
    }
    return out;
  }

  function maxCorrespondingCornerDistance(first,second){
    const distances=correspondingCornerDistances(first,second);
    if(!distances)return NaN;
    return Math.max(...CORNERS.map(name=>Number(distances[name])));
  }

  function comparisonEligibility(first,second,maxCornerDistanceFt=DEFAULT_MAX_CORNER_DISTANCE_FT){
    if(!first||!second)return {ok:false,reason:'Choose two projects.'};
    if(first.id&&second.id&&first.id===second.id)return {ok:false,reason:'First and Second must be different projects.'};
    if(!isFullyFilled(first)||!isFullyFilled(second))return {ok:false,reason:'Both projects must have a reading at every grid point.'};
    if(!sameLogicalGrid(first,second))return {ok:false,reason:'Projects must use the same row and column count so points can be matched by grid location.'};
    if(!samePhysicalSize(first,second))return {ok:false,reason:'Projects must use the same pad width and length.'};
    if(!hasFourGpsCorners(first)||!hasFourGpsCorners(second))return {ok:false,reason:'Both projects need four-corner GPS calibration for the comparison map.'};
    const cornerDistancesFt=correspondingCornerDistances(first,second),limit=Math.max(0,Number(maxCornerDistanceFt)||0);
    const far=CORNERS.find(name=>Number(cornerDistancesFt[name])>limit);
    if(far)return {ok:false,reason:`Projects are not in the same location: ${far} corners are ${cornerDistancesFt[far].toFixed(1)} ft apart (maximum ${limit.toFixed(0)} ft).`,cornerDistancesFt,maxCornerDistanceFt:limit};
    return {ok:true,reason:'Ready.',cornerDistancesFt,maxCornerDistanceFt:limit,maxCornerSeparationFt:Math.max(...Object.values(cornerDistancesFt))};
  }

  function buildComparison(first,second){
    const eligibility=comparisonEligibility(first,second);
    if(!eligibility.ok)throw new Error(eligibility.reason);
    const a=settings(first),b=settings(second),rows=Math.trunc(Number(a.rows)),cols=Math.trunc(Number(a.cols));
    const width=Number(a.width),length=Number(a.length);
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
      dimensionsDiffer:false,
      maxCornerSeparationFt:eligibility.maxCornerSeparationFt,
      cornerDistancesFt:eligibility.cornerDistancesFt
    };
  }

  // Retained for compatibility/debugging. Comparison geometry no longer uses
  // raw averaged corners as its primary spatial model; it averages the two
  // already-rectangular project grid transforms point-for-point instead.
  function averageGpsCorners(first,second){
    if(!hasFourGpsCorners(first)||!hasFourGpsCorners(second))throw new Error('Both projects need four-corner GPS calibration for the comparison map.');
    const out={};
    for(const name of CORNERS){
      const a=first.gps.corners[name],b=second.gps.corners[name],mid=midpointLatLonLocal(a,b);
      const aa=num(a.accuracy),ba=num(b.accuracy),as=num(a.spreadFt),bs=num(b.spreadFt),am=num(a.medianAccuracyFt),bm=num(b.medianAccuracyFt);
      out[name]={
        lat:mid.lat,lon:mid.lon,
        accuracy:aa!==null&&ba!==null?(aa+ba)/2:(aa!==null?aa:ba),
        spreadFt:as!==null&&bs!==null?(as+bs)/2:(as!==null?as:bs),
        medianAccuracyFt:am!==null&&bm!==null?(am+bm)/2:(am!==null?am:bm)
      };
    }
    return out;
  }

  function cornerXY(name,width,length){return {SW:{x:0,y:0},SE:{x:width,y:0},NE:{x:width,y:length},NW:{x:0,y:length}}[name];}
  function uncertaintyFt(corner){
    if(!corner)return 20;
    const reported=Number.isFinite(Number(corner.medianAccuracyFt))?Number(corner.medianAccuracyFt):(Number.isFinite(Number(corner.accuracy))?Number(corner.accuracy)*FT_PER_M:20);
    const spread=Number.isFinite(Number(corner.spreadFt))?Number(corner.spreadFt):0;
    return Math.max(2,reported,spread*2);
  }

  function solveSharedRectangle(corners,width,length,originOverride=null){
    width=Number(width);length=Number(length);
    if(!corners||!CORNERS.every(n=>corners[n])||!(width>0)||!(length>0))return null;
    const overrideLat=Number(originOverride&&originOverride.lat),overrideLon=Number(originOverride&&originOverride.lon);
    const originLat=Number.isFinite(overrideLat)?overrideLat:CORNERS.reduce((s,n)=>s+Number(corners[n].lat),0)/4;
    const originLon=Number.isFinite(overrideLon)?overrideLon:CORNERS.reduce((s,n)=>s+Number(corners[n].lon),0)/4;
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
    return {originLat,originLon,theta,scale:1,tx,ty,rmsFt:Math.sqrt(wrss/sw),worstFt:worst,residuals};
  }

  function fitPointLatLon(fit,x,y){
    if(!fit)return null;
    const scale=Number.isFinite(Number(fit.scale))?Number(fit.scale):1,ct=Math.cos(fit.theta),st=Math.sin(fit.theta);
    const east=fit.tx+scale*(ct*Number(x)-st*Number(y)),north=fit.ty+scale*(st*Number(x)+ct*Number(y));
    return latLonFromLocalFeet(fit.originLat,fit.originLon,east,north);
  }

  function padXYFromLatLon(fit,lat,lon){
    if(!fit)return null;
    const scale=Number.isFinite(Number(fit.scale))&&Math.abs(Number(fit.scale))>1e-12?Number(fit.scale):1;
    const d=localDeltaFeet(fit.originLat,fit.originLon,Number(lat),Number(lon)),ex=d.east-fit.tx,ny=d.north-fit.ty,ct=Math.cos(fit.theta),st=Math.sin(fit.theta);
    return {x:(ct*ex+st*ny)/scale,y:(-st*ex+ct*ny)/scale};
  }

  function commonOrigin(first,second){
    const all=[];
    for(const project of [first,second])for(const name of CORNERS)all.push(project.gps.corners[name]);
    return {
      lat:all.reduce((sum,c)=>sum+Number(c.lat),0)/all.length,
      lon:all.reduce((sum,c)=>sum+Number(c.lon),0)/all.length
    };
  }

  function averageRigidFits(firstFit,secondFit){
    if(!firstFit||!secondFit)throw new Error('Could not fit both project GPS grids.');
    if(Math.abs(firstFit.originLat-secondFit.originLat)>1e-12||Math.abs(firstFit.originLon-secondFit.originLon)>1e-12)throw new Error('Project GPS fits must share one local reference frame before averaging.');
    const a=(Math.cos(firstFit.theta)+Math.cos(secondFit.theta))/2;
    const b=(Math.sin(firstFit.theta)+Math.sin(secondFit.theta))/2;
    const scale=Math.hypot(a,b);
    if(!(scale>1e-9))throw new Error('Project GPS grids point in incompatible directions.');
    return {
      originLat:firstFit.originLat,
      originLon:firstFit.originLon,
      theta:Math.atan2(b,a),
      scale,
      tx:(Number(firstFit.tx)+Number(secondFit.tx))/2,
      ty:(Number(firstFit.ty)+Number(secondFit.ty))/2,
      source:'pointwise-average-of-rectangular-project-grids'
    };
  }

  function buildSharedGeometry(first,second,comparison){
    const cmp=comparison||buildComparison(first,second),eligibility=comparisonEligibility(first,second);
    if(!eligibility.ok)throw new Error(eligibility.reason);
    const origin=commonOrigin(first,second);
    const firstFit=solveSharedRectangle(first.gps.corners,cmp.width,cmp.length,origin);
    const secondFit=solveSharedRectangle(second.gps.corners,cmp.width,cmp.length,origin);
    if(!firstFit||!secondFit)throw new Error('Could not fit both rectangular GPS project grids.');
    const fit=averageRigidFits(firstFit,secondFit);
    const pointLocations=cmp.points.map(p=>{
      const firstLocation=fitPointLatLon(firstFit,p.x,p.y),secondLocation=fitPointLatLon(secondFit,p.x,p.y),averagedLocation=fitPointLatLon(fit,p.x,p.y);
      return {r:p.r,c:p.c,x:p.x,y:p.y,first:firstLocation,second:secondLocation,average:averagedLocation};
    });
    const corners={};
    for(const name of CORNERS){
      const q=cornerXY(name,cmp.width,cmp.length);corners[name]=fitPointLatLon(fit,q.x,q.y);
    }
    return {
      corners,fit,width:cmp.width,length:cmp.length,
      firstFit,secondFit,pointLocations,
      cornerDistancesFt:eligibility.cornerDistancesFt,
      maxCornerSeparationFt:eligibility.maxCornerSeparationFt,
      averagingMethod:'logical-point midpoint in common local east/north frame'
    };
  }

  return {
    CORNERS,FT_PER_M,EARTH_M,DEFAULT_MAX_CORNER_DISTANCE_FT,DIMENSION_EPS_FT,
    readingKey,isFullyFilled,sameLogicalGrid,validDimensions,samePhysicalSize,normalizedElevation,deltaAt,
    hasFourGpsCorners,localDeltaFeet,latLonFromLocalFeet,midpointLatLonLocal,correspondingCornerDistances,
    maxCorrespondingCornerDistance,comparisonEligibility,buildComparison,averageGpsCorners,
    solveSharedRectangle,fitPointLatLon,padXYFromLatLon,averageRigidFits,buildSharedGeometry
  };
});
