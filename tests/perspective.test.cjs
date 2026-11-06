const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = require("../site/perspective.js");

const rect = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];

function mockImage(width,height,isPaper) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const k=(y*width+x)*4;
    const value=isPaper(x,y)?245:36;
    data[k]=value;data[k+1]=value;data[k+2]=value;data[k+3]=255;
  }
  return {width,height,data};
}

test("corners reject self-intersections and collapsed crops",()=>{
  assert.equal(P.validCorners(rect),true);
  assert.equal(P.validCorners([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]),false);
  assert.equal(P.validCorners(Array(4).fill({x:0,y:0})),false);
});

test("homography maps each destination corner to source corner",()=>{
  const source=[{x:4,y:5},{x:94,y:12},{x:85,y:108},{x:12,y:90}];
  const dst=[{x:0,y:0},{x:200,y:0},{x:200,y:250},{x:0,y:250}];
  const h=P.homography(dst,source);
  for(let i=0;i<4;i++){
    const result=P.applyHomography(h,dst[i].x,dst[i].y);
    assert.ok(Math.abs(result.x-source[i].x)<1e-6);
    assert.ok(Math.abs(result.y-source[i].y)<1e-6);
  }
});

test("an identity crop keeps colors and dimensions",()=>{
  const image=mockImage(5,5,(x,y)=>x>1&&y>1);
  const result=P.warpImageData(image,rect,100);
  assert.equal(result.width,5);
  assert.equal(result.height,5);
  assert.deepEqual([...result.data], [...image.data]);
});

test("auto detection can identify a bright sheet on a dark surface",()=>{
  const im=mockImage(100,120,(x,y)=>x>=18&&x<=84&&y>=12&&y<=107);
  const result=P.detectDocumentCorners(im);
  assert.equal(result.detected,true);
  assert.equal(result.corners.length,4);
  assert.ok(P.validCorners(result.corners));
  assert.ok(Math.abs(result.corners[0].x-.18)<.07);
  assert.ok(Math.abs(result.corners[0].y-.1)<.07);
});

test("auto detector falls back to manual initial corners without contrast",()=>{
  const image=mockImage(100,120,()=>true);
  const result=P.detectDocumentCorners(image);
  assert.equal(result.detected,false);
  assert.equal(P.validCorners(result.corners),true);
});

test("warp uses white outside source image and produces opaque pixels",()=>{
  const image=mockImage(15,20,()=>true);
  const corners=[{x:.2,y:.1},{x:.85,y:.06},{x:.93,y:.92},{x:.11,y:.85}];
  const result=P.warpImageData(image,corners,120);
  assert.ok(result.width>2 && result.height>2);
  for(let i=3;i<result.data.length;i+=4) assert.equal(result.data[i],255);
});

test("PWA includes mobile camera, offline worker and proper PNG assets",()=>{
  const html=fs.readFileSync(path.join(__dirname,"../site/index.html"),"utf8");
  assert.match(html,/id="scanOpenCamera"/);
  assert.match(html,/id="scanCanvas"/);
  assert.match(html,/manifest.webmanifest/);
  assert.match(html,/apple-touch-icon/);
  assert.ok(html.indexOf('src="./perspective.js"') < html.indexOf('src="./scanner.js"'));
  assert.ok(html.indexOf('src="./scanner.js"') < html.indexOf('src="./app.js"'));
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"../site/manifest.webmanifest"),"utf8"));
  assert.equal(manifest.display,"standalone");
  for(const icon of ["icon-192.png","icon-512.png"]) {
    const buf=fs.readFileSync(path.join(__dirname,"../site",icon));
    assert.equal(buf.readUInt32BE(0),0x89504e47);
    assert.equal(buf.toString("ascii",1,4),"PNG");
  }
});
