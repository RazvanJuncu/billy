/* Billy Perspective Engine  -  dependency-free, on-device geometry and pixels.
   Corners are ordered [top-left, top-right, bottom-right, bottom-left].
   All geometry is normalized to 0..1 unless stated otherwise. */
(function (root) {
  "use strict";

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function defaultCorners() {
    return [{x:.08,y:.09},{x:.92,y:.09},{x:.92,y:.91},{x:.08,y:.91}];
  }

  function quadArea(corners) {
    return Math.abs(corners.reduce((s,p,i) => {
      const q = corners[(i+1)%4];
      return s + p.x*q.y - q.x*p.y;
    },0)) / 2;
  }

  function validCorners(points) {
    if (!Array.isArray(points) || points.length !== 4 || !points.every(p =>
      Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1
    )) return false;
    if (quadArea(points) < .015) return false;
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if (Math.abs(cross)<1e-6 || (sign && cross*sign<0)) return false;
      sign = Math.sign(cross);
    }
    return true;
  }

  function solveLinear(matrix, vector) {
    const n=vector.length;
    const a=matrix.map((row,i)=>[...row,vector[i]]);
    for (let k=0;k<n;k++) {
      let pivot=k;
      for(let r=k+1;r<n;r++) if(Math.abs(a[r][k])>Math.abs(a[pivot][k])) pivot=r;
      if(Math.abs(a[pivot][k])<1e-12) throw new Error("Degenerate crop. Move the four corners apart.");
      [a[k],a[pivot]]=[a[pivot],a[k]];
      const divisor=a[k][k];
      for(let j=k;j<=n;j++) a[k][j]/=divisor;
      for(let i=0;i<n;i++) {
        if(i===k) continue;
        const f=a[i][k];
        if(f===0) continue;
        for(let j=k;j<=n;j++) a[i][j]-=f*a[k][j];
      }
    }
    return a.map(row=>row[n]);
  }

  // Maps coordinates in output image to original source image.
  function homography(from, to) {
    if(from.length!==4||to.length!==4) throw new Error("Exactly four point pairs required.");
    const m=[],v=[];
    for(let i=0;i<4;i++) {
      const {x,y}=from[i],X=to[i].x,Y=to[i].y;
      m.push([x,y,1,0,0,0,-x*X,-y*X]); v.push(X);
      m.push([0,0,0,x,y,1,-x*Y,-y*Y]); v.push(Y);
    }
    return [...solveLinear(m,v),1];
  }

  function applyHomography(h,x,y) {
    const d=h[6]*x+h[7]*y+1;
    if(!Number.isFinite(d) || Math.abs(d)<1e-9) return {x:NaN,y:NaN};
    return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d};
  }

  function dimensions(width,height,corners,maxSide=2200) {
    const pixel = corners.map(p=>({x:p.x*width,y:p.y*height}));
    let w=Math.max(distance(pixel[0],pixel[1]), distance(pixel[3],pixel[2]));
    let h=Math.max(distance(pixel[0],pixel[3]), distance(pixel[1],pixel[2]));
    const scale=Math.min(1,maxSide/Math.max(w,h),Math.sqrt(4_800_000/(w*h)));
    return {width:Math.max(2,Math.round(w*scale)),height:Math.max(2,Math.round(h*scale))};
  }

  function warpImageData(image, corners, maxSide=2200) {
    if(!validCorners(corners)) throw new Error("Invalid or crossing corners. Adjust the crop handles.");
    if(!image||!image.data||!image.width||!image.height) throw new Error("Invalid image data.");
    const srcW=image.width,srcH=image.height;
    const {width:dstW,height:dstH}=dimensions(srcW,srcH,corners,maxSide);
    const points=corners.map(p=>({x:p.x*(srcW-1),y:p.y*(srcH-1)}));
    const h=homography([
      {x:0,y:0},{x:dstW-1,y:0},{x:dstW-1,y:dstH-1},{x:0,y:dstH-1}
    ],points);
    const data=new Uint8ClampedArray(dstW*dstH*4);
    const src=image.data;
    for(let y=0;y<dstH;y++) {
      for(let x=0;x<dstW;x++) {
        const denom=h[6]*x+h[7]*y+1;
        let sx=(h[0]*x+h[1]*y+h[2])/denom;
        let sy=(h[3]*x+h[4]*y+h[5])/denom;
        const k=(y*dstW+x)*4;
        if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<0||sy<0||sx>srcW-1||sy>srcH-1) {
          data[k]=data[k+1]=data[k+2]=255;data[k+3]=255;continue;
        }
        const x0=Math.floor(sx),y0=Math.floor(sy);
        const x1=Math.min(x0+1,srcW-1),y1=Math.min(y0+1,srcH-1);
        const wx=sx-x0,wy=sy-y0;
        const a=(y0*srcW+x0)*4,b=(y0*srcW+x1)*4;
        const c=(y1*srcW+x0)*4,d=(y1*srcW+x1)*4;
        for(let channel=0;channel<3;channel++){
          data[k+channel]=src[a+channel]*(1-wx)*(1-wy)+src[b+channel]*wx*(1-wy)+src[c+channel]*(1-wx)*wy+src[d+channel]*wx*wy;
        }
        data[k+3]=255;
      }
    }
    return {width:dstW,height:dstH,data};
  }

  function rgbBrightness(data,index) {
    return (data[index]*.299+data[index+1]*.587+data[index+2]*.114);
  }

  // Best-effort detector of a light paper sheet against a darker background.
  // Returns detected=false when the contrast is too low; manual corners always work.
  function detectDocumentCorners(image) {
    const {width:w,height:h,data}=image;
    if(w<16||h<16||!data) return {corners:defaultCorners(),detected:false};
    const n=w*h,light=new Uint8Array(n);
    const border=[];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      if(x<Math.max(2,w*.05)||x>w*.95||y<Math.max(2,h*.05)||y>h*.95)
        border.push(rgbBrightness(data,(y*w+x)*4));
    }
    border.sort((a,b)=>a-b);
    const median=border[Math.floor(border.length/2)]||0;
    const brightnessThreshold=Math.max(145,Math.min(242,median+27));
    for(let i=0;i<n;i++) {
      const k=i*4,bright=rgbBrightness(data,k);
      const mx=Math.max(data[k],data[k+1],data[k+2]);
      const mn=Math.min(data[k],data[k+1],data[k+2]);
      // Require neutral-ish bright paper; saturated reflections and colored objects rejected.
      light[i]=(bright>=brightnessThreshold && mx-mn<75)?1:0;
    }
    const visited=new Uint8Array(n), stack=new Int32Array(n);
    let best=null;
    const minCount=Math.max(50,Math.round(n*.095));
    for(let start=0;start<n;start++) {
      if(!light[start]||visited[start]) continue;
      let top=0,size=0,touches=0;
      stack[top++]=start;visited[start]=1;
      const extrema=[
        {score:Infinity,x:0,y:0},
        {score:-Infinity,x:0,y:0},
        {score:-Infinity,x:0,y:0},
        {score:Infinity,x:0,y:0}
      ];
      while(top) {
        const pos=stack[--top],x=pos%w,y=Math.floor(pos/w);
        size++;
        if(x===0||y===0||x===w-1||y===h-1) touches++;
        const vals=[x+y,x-y,x+y,x-y];
        for(let k=0;k<4;k++) {
          if((k===0||k===3) ? vals[k]<extrema[k].score : vals[k]>extrema[k].score) {
            extrema[k]={score:vals[k],x,y};
          }
        }
        const neighbours=[pos-1,pos+1,pos-w,pos+w];
        for(let k=0;k<4;k++) {
          if(k===0&&x===0||k===1&&x===w-1||k===2&&y===0||k===3&&y===h-1) continue;
          const next=neighbours[k];
          if(light[next]&&!visited[next]) {visited[next]=1;stack[top++]=next;}
        }
      }
      if(size>=minCount && touches<n*.025 && (!best||size>best.size)) best={size,extrema};
    }
    if(!best) return {corners:defaultCorners(),detected:false};
    const corners=best.extrema.map((p,i)=>{
      const margin=.006;
      return {x:clamp((p.x+(i===0||i===3?-1:1)*margin*w)/(w-1),0,1),
              y:clamp((p.y+(i<2?-1:1)*margin*h)/(h-1),0,1)};
    });
    if(!validCorners(corners) || quadArea(corners)<.12 || quadArea(corners)>.96) {
      return {corners:defaultCorners(),detected:false};
    }
    return {corners,detected:true};
  }

  const api={defaultCorners,validCorners,quadArea,homography,applyHomography,dimensions,warpImageData,detectDocumentCorners};
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  root.BillyPerspective=api;
})(typeof window!=="undefined"?window:globalThis);
