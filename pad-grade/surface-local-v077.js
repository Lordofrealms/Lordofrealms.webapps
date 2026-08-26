/* Pad Grade v0.7.7 DEV — authoritative locality-based 3-point surface interpolation.
 *
 * Every interpolated sample chooses the containing measured-point triangle by:
 *   1) nearest farthest vertex to the sample,
 *   2) then smallest total sample-to-vertex distance,
 *   3) then smallest triangle area.
 * Only triangles tied on the complete locality score are averaged. IDW² uses only
 * the selected triangle's three readings. Exact measured locations return that
 * measured reading directly.
 *
 * Pure module: safe in Window, Web Worker, and Node validation contexts.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PadGradeLocalSurface=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const AREA_EPS=1e-10;
  const CONTAIN_EPS=1e-9;
  const SCORE_REL_TOL=1e-9;
  const SCORE_ABS_TOL=1e-10;
  const EXACT_D2=1e-12;

  function area2(a,b,c){
    return Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  }

  function metricTied(a,b){
    if(!Number.isFinite(a)||!Number.isFinite(b))return a===b;
    return Math.abs(a-b)<=Math.max(SCORE_ABS_TOL,Math.max(Math.abs(a),Math.abs(b))*SCORE_REL_TOL);
  }

  function pointInTriangle(x,y,a,b,c){
    const ab=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
    const bc=(c.x-b.x)*(y-b.y)-(c.y-b.y)*(x-b.x);
    const ca=(a.x-c.x)*(y-c.y)-(a.y-c.y)*(x-c.x);
    const hasNeg=ab < -CONTAIN_EPS || bc < -CONTAIN_EPS || ca < -CONTAIN_EPS;
    const hasPos=ab > CONTAIN_EPS || bc > CONTAIN_EPS || ca > CONTAIN_EPS;
    return !(hasNeg&&hasPos);
  }

  function idw2Triangle(x,y,a,b,c){
    let sw=0,sv=0;
    for(const p of [a,b,c]){
      const dx=p.x-x,dy=p.y-y,d2=dx*dx+dy*dy;
      if(d2<EXACT_D2)return p.v;
      const w=1/d2;sw+=w;sv+=w*p.v;
    }
    return sw?sv/sw:NaN;
  }

  function normalizedPoints(input){
    return (input||[]).map((p,index)=>({
      x:+p.x,y:+p.y,v:+p.v,
      r:Number.isFinite(+p.r)?+p.r:null,
      c:Number.isFinite(+p.c)?+p.c:null,
      label:p.label!=null?String(p.label):null,
      index
    })).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.v));
  }

  function distanceRecords(x,y,points){
    const out=new Array(points.length);
    for(let i=0;i<points.length;i++){
      const p=points[i],dx=p.x-x,dy=p.y-y,d2=dx*dx+dy*dy;
      out[i]={p,d2,d:Math.sqrt(d2)};
    }
    out.sort((a,b)=>a.d2-b.d2||a.p.index-b.p.index);
    return out;
  }

  function betterMetric(a,b){return a<b&&!metricTied(a,b);}

  function interpolateNormalized(x,y,points,includeTriangles=false){
    if(points.length<3)return null;
    const records=distanceRecords(x,y,points);
    if(records[0]&&records[0].d2<EXACT_D2){
      const p=records[0].p;
      return {
        value:p.v,tieCount:1,triangles:includeTriangles?[[p.index]]:null,points,
        exact:true,score:{maxDistance:0,totalDistance:0,triangleArea2:0}
      };
    }

    let start=0;
    while(start<records.length){
      const radiusD2=records[start].d2;
      let end=start+1;
      while(end<records.length&&metricTied(records[end].d2,radiusD2))end++;
      if(end>=3){
        let bestSum=Infinity,bestArea=Infinity,sumValue=0,count=0;
        const bestTriangles=includeTriangles?[]:null;
        for(let i=0;i<end-2;i++){
          const A=records[i];
          for(let j=i+1;j<end-1;j++){
            const B=records[j];
            for(let k=j+1;k<end;k++){
              const C=records[k];
              const maxD2=Math.max(A.d2,B.d2,C.d2);
              if(!metricTied(maxD2,radiusD2))continue;
              const ar=area2(A.p,B.p,C.p);if(ar<=AREA_EPS)continue;
              if(x<Math.min(A.p.x,B.p.x,C.p.x)-CONTAIN_EPS||x>Math.max(A.p.x,B.p.x,C.p.x)+CONTAIN_EPS||
                 y<Math.min(A.p.y,B.p.y,C.p.y)-CONTAIN_EPS||y>Math.max(A.p.y,B.p.y,C.p.y)+CONTAIN_EPS)continue;
              if(!pointInTriangle(x,y,A.p,B.p,C.p))continue;

              const total=A.d+B.d+C.d;
              const v=idw2Triangle(x,y,A.p,B.p,C.p);if(!Number.isFinite(v))continue;
              if(betterMetric(total,bestSum)){
                bestSum=total;bestArea=ar;sumValue=v;count=1;
                if(bestTriangles){bestTriangles.length=0;bestTriangles.push([A.p.index,B.p.index,C.p.index]);}
                continue;
              }
              if(!metricTied(total,bestSum))continue;
              if(betterMetric(ar,bestArea)){
                bestArea=ar;sumValue=v;count=1;
                if(bestTriangles){bestTriangles.length=0;bestTriangles.push([A.p.index,B.p.index,C.p.index]);}
                continue;
              }
              if(!metricTied(ar,bestArea))continue;
              sumValue+=v;count++;
              if(bestTriangles)bestTriangles.push([A.p.index,B.p.index,C.p.index]);
            }
          }
        }
        if(count){
          return {
            value:sumValue/count,tieCount:count,triangles:bestTriangles,points,exact:false,
            score:{maxDistance:Math.sqrt(radiusD2),totalDistance:bestSum,triangleArea2:bestArea}
          };
        }
      }
      start=end;
    }
    return null;
  }

  function interpolateAt(x,y,input,includeTriangles=false){
    x=+x;y=+y;
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    return interpolateNormalized(x,y,normalizedPoints(input),includeTriangles);
  }

  function convexHull(input){
    const pts=(Array.isArray(input)&&input.length&&input[0]&&Number.isInteger(input[0].index)?input:normalizedPoints(input)).map(p=>({x:p.x,y:p.y}));
    const unique=[],seen=new Set();
    for(const p of pts){const key=`${p.x},${p.y}`;if(!seen.has(key)){seen.add(key);unique.push(p);}}
    if(unique.length<3)return [];
    unique.sort((a,b)=>a.x-b.x||a.y-b.y);
    const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
    const lower=[];for(const p of unique){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
    const upper=[];for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
    lower.pop();upper.pop();
    const hull=lower.concat(upper);
    if(hull.length<3)return [];
    let ar=0;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];ar+=a.x*b.y-b.x*a.y;}
    return Math.abs(ar)>AREA_EPS?hull:[];
  }

  function pointInConvex(x,y,hull){
    let sign=0;
    for(let i=0;i<hull.length;i++){
      const a=hull[i],b=hull[(i+1)%hull.length];
      const z=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
      if(Math.abs(z)<=CONTAIN_EPS)continue;
      const s=z>0?1:-1;if(!sign)sign=s;else if(sign!==s)return false;
    }
    return true;
  }

  function rasterize(opts){
    const nx=Math.max(2,+opts.nx|0),ny=Math.max(2,+opts.ny|0),width=Math.max(.001,+opts.width||1),length=Math.max(.001,+opts.length||1);
    const flipY=opts.flipY!==false;
    const points=normalizedPoints(opts.points),hull=convexHull(points);
    const values=new Float64Array(nx*ny),counts=new Uint16Array(nx*ny),mask=new Uint8Array(nx*ny);
    values.fill(NaN);
    if(points.length<3||hull.length<3)return {nx,ny,values,counts,mask,cells:0,points,hull};

    let cells=0;
    for(let iy=0;iy<ny;iy++){
      const y=flipY?length-(iy+.5)/ny*length:(iy+.5)/ny*length;
      for(let ix=0;ix<nx;ix++){
        const x=(ix+.5)/nx*width,o=iy*nx+ix;
        if(!pointInConvex(x,y,hull))continue;
        mask[o]=1;
        const result=interpolateNormalized(x,y,points,false);
        if(!result||!Number.isFinite(result.value))continue;
        values[o]=result.value;counts[o]=Math.max(1,Math.min(65535,result.tieCount||1));cells++;
      }
    }
    return {nx,ny,values,counts,mask,cells,points,hull};
  }

  return {
    AREA_EPS,CONTAIN_EPS,SCORE_REL_TOL,area2,metricTied,pointInTriangle,idw2Triangle,
    interpolateAt,convexHull,pointInConvex,rasterize
  };
});
