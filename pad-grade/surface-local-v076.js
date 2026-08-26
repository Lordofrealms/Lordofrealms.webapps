/* Pad Grade v0.7.6 DEV — authoritative local 3-point surface interpolation.
 *
 * Every interpolated sample is owned by the smallest-area measured-point triangle
 * that contains it. IDW² uses only that triangle's three readings. If multiple
 * minimum-area triangles tie (for example on a shared diagonal), their independent
 * IDW² results are averaged.
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
  const AREA_REL_TOL=1e-9;

  function area2(a,b,c){
    return Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  }

  function areaTied(a,b){
    if(!Number.isFinite(a)||!Number.isFinite(b))return a===b;
    return Math.abs(a-b)<=Math.max(AREA_EPS,Math.max(Math.abs(a),Math.abs(b))*AREA_REL_TOL);
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
      if(d2<1e-12)return p.v;
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

  function interpolateAt(x,y,input,includeTriangles=false){
    x=+x;y=+y;
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    const points=normalizedPoints(input);
    if(points.length<3)return null;

    let bestArea=Infinity,sum=0,count=0,bestTriangles=includeTriangles?[]:null;
    for(let i=0;i<points.length-2;i++){
      const a=points[i];
      for(let j=i+1;j<points.length-1;j++){
        const b=points[j];
        for(let k=j+1;k<points.length;k++){
          const c=points[k],ar=area2(a,b,c);
          if(ar<=AREA_EPS)continue;
          if(x<Math.min(a.x,b.x,c.x)-CONTAIN_EPS||x>Math.max(a.x,b.x,c.x)+CONTAIN_EPS||
             y<Math.min(a.y,b.y,c.y)-CONTAIN_EPS||y>Math.max(a.y,b.y,c.y)+CONTAIN_EPS)continue;
          if(!pointInTriangle(x,y,a,b,c))continue;
          if(ar<bestArea&&!areaTied(ar,bestArea)){
            const v=idw2Triangle(x,y,a,b,c);if(!Number.isFinite(v))continue;
            bestArea=ar;sum=v;count=1;
            if(bestTriangles)bestTriangles=[[a.index,b.index,c.index]];
          }else if(areaTied(ar,bestArea)){
            const v=idw2Triangle(x,y,a,b,c);if(!Number.isFinite(v))continue;
            sum+=v;count++;
            if(bestTriangles)bestTriangles.push([a.index,b.index,c.index]);
          }
        }
      }
    }
    if(!count)return null;
    return {value:sum/count,triangleArea2:bestArea,tieCount:count,triangles:bestTriangles,points};
  }

  function convexHull(input){
    const pts=normalizedPoints(input).map(p=>({x:p.x,y:p.y}));
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

  function triangleRecord(a,b,c){
    const ar=area2(a,b,c);if(ar<=AREA_EPS)return null;
    return {
      a,b,c,area:ar,
      minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),
      minY:Math.min(a.y,b.y,c.y),maxY:Math.max(a.y,b.y,c.y)
    };
  }

  function buildTriangles(points){
    const out=[];
    for(let i=0;i<points.length-2;i++)for(let j=i+1;j<points.length-1;j++)for(let k=j+1;k<points.length;k++){
      const t=triangleRecord(points[i],points[j],points[k]);if(t)out.push(t);
    }
    out.sort((a,b)=>a.area-b.area||a.a.index-b.a.index||a.b.index-b.b.index||a.c.index-b.c.index);
    return out;
  }

  function pixelRange(min,max,size,span,flip){
    if(!flip){
      return [Math.max(0,Math.ceil(min/span*size-.5)),Math.min(size-1,Math.floor(max/span*size-.5))];
    }
    return [Math.max(0,Math.ceil((1-max/span)*size-.5)),Math.min(size-1,Math.floor((1-min/span)*size-.5))];
  }

  function rasterize(opts){
    const nx=Math.max(2,+opts.nx|0),ny=Math.max(2,+opts.ny|0),width=Math.max(.001,+opts.width||1),length=Math.max(.001,+opts.length||1);
    const flipY=opts.flipY!==false;
    const points=normalizedPoints(opts.points),hull=convexHull(points);
    const values=new Float64Array(nx*ny),bestArea=new Float64Array(nx*ny),counts=new Uint16Array(nx*ny),mask=new Uint8Array(nx*ny);
    bestArea.fill(Infinity);values.fill(NaN);
    if(points.length<3||hull.length<3)return {nx,ny,values,counts,mask,cells:0,points,hull};

    let hullCells=0;
    for(let iy=0;iy<ny;iy++){
      const y=flipY?length-(iy+.5)/ny*length:(iy+.5)/ny*length;
      for(let ix=0;ix<nx;ix++){
        const x=(ix+.5)/nx*width,o=iy*nx+ix;
        if(pointInConvex(x,y,hull)){mask[o]=1;hullCells++;}
      }
    }

    const triangles=buildTriangles(points);
    let assigned=0,groupStart=0;
    while(groupStart<triangles.length){
      const groupArea=triangles[groupStart].area;
      let groupEnd=groupStart+1;while(groupEnd<triangles.length&&areaTied(triangles[groupEnd].area,groupArea))groupEnd++;
      for(let ti=groupStart;ti<groupEnd;ti++){
        const t=triangles[ti];
        const xr=pixelRange(t.minX,t.maxX,nx,width,false),yr=pixelRange(t.minY,t.maxY,ny,length,flipY);
        if(xr[0]>xr[1]||yr[0]>yr[1])continue;
        for(let iy=yr[0];iy<=yr[1];iy++){
          const y=flipY?length-(iy+.5)/ny*length:(iy+.5)/ny*length;
          for(let ix=xr[0];ix<=xr[1];ix++){
            const o=iy*nx+ix;if(!mask[o])continue;
            const current=bestArea[o];if(Number.isFinite(current)&&current<groupArea&&!areaTied(current,groupArea))continue;
            const x=(ix+.5)/nx*width;if(!pointInTriangle(x,y,t.a,t.b,t.c))continue;
            const v=idw2Triangle(x,y,t.a,t.b,t.c);if(!Number.isFinite(v))continue;
            if(!Number.isFinite(current)){
              bestArea[o]=groupArea;values[o]=v;counts[o]=1;assigned++;
            }else if(areaTied(current,groupArea)){
              const n=counts[o];values[o]=(values[o]*n+v)/(n+1);counts[o]=Math.min(65535,n+1);
            }
          }
        }
      }
      groupStart=groupEnd;
      if(assigned>=hullCells)break;
    }

    return {nx,ny,values,counts,mask,cells:assigned,points,hull};
  }

  return {AREA_EPS,CONTAIN_EPS,area2,areaTied,pointInTriangle,idw2Triangle,interpolateAt,convexHull,pointInConvex,rasterize};
});
