/* Pad Grade v0.7.9 DEV — locality-first IDW² with edge-locked local elements.
 *
 * Support selection remains unchanged from v0.7.8:
 *   1) nearest farthest triangle vertex,
 *   2) then smallest total sample-to-vertex distance,
 *   3) then smallest triangle area,
 *   4) promote a winning 3-corner grid triangle to its measured 4th rectangle corner.
 *
 * Interpolation is now value-continuous at element edges. Within the nearest 1/6
 * of an element's depth/altitude, the ordinary 3- or 4-point IDW² result is
 * smoothly corrected so the boundary itself is exactly the 2-point IDW² result
 * of that edge's measured endpoints. The correction fades to zero at 1/6 depth,
 * leaving the element interior as ordinary local IDW².
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
  const EDGE_BAND_FRACTION=1/6;

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

  function idw2Points(x,y,support){
    let sw=0,sv=0;
    for(const p of support){
      const dx=p.x-x,dy=p.y-y,d2=dx*dx+dy*dy;
      if(d2<EXACT_D2)return p.v;
      const w=1/d2;sw+=w;sv+=w*p.v;
    }
    return sw?sv/sw:NaN;
  }

  function idw2Triangle(x,y,a,b,c){return idw2Points(x,y,[a,b,c]);}

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
  function gridKey(r,c){return `${r},${c}`;}

  function gridPointMap(points){
    const out=new Map();
    for(const p of points){
      if(!Number.isInteger(p.r)||!Number.isInteger(p.c))continue;
      out.set(gridKey(p.r,p.c),p);
    }
    return out;
  }

  function promoteTriangleToRectangle(triangle,pointMap){
    if(!triangle||triangle.length!==3||!pointMap||!pointMap.size)return null;
    if(triangle.some(p=>!Number.isInteger(p.r)||!Number.isInteger(p.c)))return null;
    const rows=[...new Set(triangle.map(p=>p.r))].sort((a,b)=>a-b);
    const cols=[...new Set(triangle.map(p=>p.c))].sort((a,b)=>a-b);
    if(rows.length!==2||cols.length!==2)return null;
    const triangleKeys=new Set(triangle.map(p=>gridKey(p.r,p.c)));
    let missing=null;
    for(const r of rows)for(const c of cols){
      const key=gridKey(r,c);
      if(triangleKeys.has(key))continue;
      if(missing)return null;
      missing=pointMap.get(key)||null;
    }
    if(!missing)return null;
    const support=triangle.concat(missing);
    const unique=new Set(support.map(p=>p.index));
    return unique.size===4?support:null;
  }

  function supportKey(support){return support.map(p=>p.index).sort((a,b)=>a-b).join(',');}

  function reverseSmoothstep(fraction){
    if(!(fraction>0))return 1;
    if(fraction>=EDGE_BAND_FRACTION)return 0;
    const q=Math.max(0,Math.min(1,fraction/EDGE_BAND_FRACTION));
    const smooth=q*q*(3-2*q);
    return 1-smooth;
  }

  function lineDistance(x,y,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<=AREA_EPS)return Infinity;
    return Math.abs(dx*(y-a.y)-dy*(x-a.x))/len;
  }

  function projectToSegment(x,y,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
    if(len2<=AREA_EPS)return {x:a.x,y:a.y};
    let t=((x-a.x)*dx+(y-a.y)*dy)/len2;
    t=Math.max(0,Math.min(1,t));
    return {x:a.x+t*dx,y:a.y+t*dy};
  }

  function edgeCorrection(x,y,support,a,b,opposite){
    const altitude=lineDistance(opposite.x,opposite.y,a,b);
    if(!Number.isFinite(altitude)||altitude<=AREA_EPS)return 0;
    const fraction=lineDistance(x,y,a,b)/altitude;
    const taper=reverseSmoothstep(fraction);
    if(!(taper>0))return 0;
    const edgePoint=projectToSegment(x,y,a,b);
    const required=idw2Points(edgePoint.x,edgePoint.y,[a,b]);
    const uncorrected=idw2Points(edgePoint.x,edgePoint.y,support);
    if(!Number.isFinite(required)||!Number.isFinite(uncorrected))return 0;
    return taper*(required-uncorrected);
  }

  function rectangleEdges(support){
    if(!support||support.length!==4||support.some(p=>!Number.isInteger(p.r)||!Number.isInteger(p.c)))return null;
    const rows=[...new Set(support.map(p=>p.r))].sort((a,b)=>a-b);
    const cols=[...new Set(support.map(p=>p.c))].sort((a,b)=>a-b);
    if(rows.length!==2||cols.length!==2)return null;
    const map=new Map(support.map(p=>[gridKey(p.r,p.c),p]));
    const p00=map.get(gridKey(rows[0],cols[0])),p01=map.get(gridKey(rows[0],cols[1]));
    const p10=map.get(gridKey(rows[1],cols[0])),p11=map.get(gridKey(rows[1],cols[1]));
    if(!p00||!p01||!p10||!p11)return null;
    return [
      [p00,p01,p10],
      [p10,p11,p00],
      [p00,p10,p01],
      [p01,p11,p00]
    ];
  }

  function barycentric(x,y,a,b,c){
    const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
    if(Math.abs(den)<=AREA_EPS)return null;
    const wa=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den;
    const wb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den;
    const wc=1-wa-wb;
    return [wa,wb,wc];
  }

  function triangleEdgeCorrection(x,y,support,a,b,wa,wb,wOpp){
    const taper=reverseSmoothstep(Math.max(0,wOpp));
    if(!(taper>0))return 0;
    const sum=wa+wb;
    if(!(sum>AREA_EPS))return 0;
    const ta=Math.max(0,wa)/sum,tb=Math.max(0,wb)/sum;
    const edgePoint={x:ta*a.x+tb*b.x,y:ta*a.y+tb*b.y};
    const required=idw2Points(edgePoint.x,edgePoint.y,[a,b]);
    const uncorrected=idw2Points(edgePoint.x,edgePoint.y,support);
    if(!Number.isFinite(required)||!Number.isFinite(uncorrected))return 0;
    return taper*(required-uncorrected);
  }

  function edgeLockedSupportValue(x,y,support,type){
    const base=idw2Points(x,y,support);
    if(!Number.isFinite(base))return base;
    let correction=0;
    if(type==='rectangle4'){
      const edges=rectangleEdges(support);
      if(!edges)return base;
      for(const [a,b,opposite] of edges)correction+=edgeCorrection(x,y,support,a,b,opposite);
      return base+correction;
    }
    if(type==='triangle3'&&support.length===3){
      const [a,b,c]=support,weights=barycentric(x,y,a,b,c);
      if(!weights)return base;
      const [wa,wb,wc]=weights;
      correction+=triangleEdgeCorrection(x,y,support,a,b,wa,wb,wc);
      correction+=triangleEdgeCorrection(x,y,support,b,c,wb,wc,wa);
      correction+=triangleEdgeCorrection(x,y,support,c,a,wc,wa,wb);
      return base+correction;
    }
    return base;
  }

  function interpolateNormalized(x,y,points,includeTriangles=false){
    if(points.length<3)return null;
    const records=distanceRecords(x,y,points);
    if(records[0]&&records[0].d2<EXACT_D2){
      const p=records[0].p;
      return {
        value:p.v,tieCount:1,triangles:includeTriangles?[[p.index]]:null,supports:includeTriangles?[[p.index]]:null,points,
        exact:true,score:{maxDistance:0,totalDistance:0,triangleArea2:0},supportTypes:['exact']
      };
    }

    const pointMap=gridPointMap(points);
    let start=0;
    while(start<records.length){
      const radiusD2=records[start].d2;
      let end=start+1;
      while(end<records.length&&metricTied(records[end].d2,radiusD2))end++;
      if(end>=3){
        let bestSum=Infinity,bestArea=Infinity;
        const winningTriangles=[];
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
              if(betterMetric(total,bestSum)){
                bestSum=total;bestArea=ar;winningTriangles.length=0;
                winningTriangles.push([A.p,B.p,C.p]);
                continue;
              }
              if(!metricTied(total,bestSum))continue;
              if(betterMetric(ar,bestArea)){
                bestArea=ar;winningTriangles.length=0;
                winningTriangles.push([A.p,B.p,C.p]);
                continue;
              }
              if(!metricTied(ar,bestArea))continue;
              winningTriangles.push([A.p,B.p,C.p]);
            }
          }
        }
        if(winningTriangles.length){
          const uniqueSupports=new Map();
          for(const triangle of winningTriangles){
            const promoted=promoteTriangleToRectangle(triangle,pointMap);
            const support=promoted||triangle;
            const key=supportKey(support);
            if(!uniqueSupports.has(key))uniqueSupports.set(key,{support,type:promoted?'rectangle4':'triangle3'});
          }
          let sumValue=0,count=0;
          const refs=includeTriangles?[]:null;
          const types=[];
          for(const entry of uniqueSupports.values()){
            const v=edgeLockedSupportValue(x,y,entry.support,entry.type);if(!Number.isFinite(v))continue;
            sumValue+=v;count++;types.push(entry.type);
            if(refs)refs.push(entry.support.map(p=>p.index));
          }
          if(count){
            return {
              value:sumValue/count,tieCount:count,triangles:refs,supports:refs,points,exact:false,supportTypes:types,
              score:{maxDistance:Math.sqrt(radiusD2),totalDistance:bestSum,triangleArea2:bestArea}
            };
          }
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
    AREA_EPS,CONTAIN_EPS,SCORE_REL_TOL,EDGE_BAND_FRACTION,area2,metricTied,pointInTriangle,
    idw2Points,idw2Triangle,reverseSmoothstep,lineDistance,projectToSegment,barycentric,edgeLockedSupportValue,
    promoteTriangleToRectangle,interpolateAt,convexHull,pointInConvex,rasterize
  };
});
