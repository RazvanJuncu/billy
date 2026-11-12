const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const app=read("site/app.js");
const pdf=read("site/pdf-separation.js");
test("PDF document map classifies independent page groups and every page's physical overlays",()=>{
  assert.match(edge,/const PDF_PAGE_MAP_SCHEMA/);
  assert.match(edge,/page_overlays:\{type:"array",maxItems:30/);
  assert.match(edge,/inspect EVERY page VISUALLY/);
  assert.match(edge,/physically separate paper overlays the background/);
  assert.match(edge,/return json\(\{groups,overlay_pages:overlays/);
  assert.match(edge,/\/api\/vision\/document-map/);
  const start=edge.indexOf("function validatedPageGroups(");
  const end=edge.indexOf("async function mapPdfDocuments(",start);
  assert.ok(start>0&&end>start);
  const ctx={Number,Math,Set,Array};
  vm.runInNewContext(edge.slice(start,end)+"\nthis.groups=validatedPageGroups;this.overlays=validatedOverlays;",ctx);
  const groups=[
    {first_page:1,last_page:1,title:"Handling sheet",confident:true},
    {first_page:2,last_page:2,title:"Fuel certificate",confident:true}
  ];
  assert.equal(ctx.groups(groups,2).length,2);
  assert.equal(ctx.groups([{first_page:1,last_page:2,title:"Two-page invoice",confident:true}],2).length,1);
  assert.equal(ctx.groups([{first_page:1,last_page:1,title:"Only first",confident:true}],2),null);
  assert.equal(ctx.groups([{first_page:1,last_page:2,title:"Uncertain",confident:false}],2),null);
  assert.deepEqual(Array.from(ctx.overlays([
    {page:1,attached:true,confident:true},
    {page:2,attached:false,confident:true}
  ],2)),[1]);
  assert.equal(ctx.overlays([{page:1,attached:true,confident:true}],2),null);
  assert.equal(ctx.overlays([{page:1,attached:false,confident:false},
    {page:2,attached:false,confident:true}],2),null);
});
test("Cross-document overlap is not created from adjacent rectangles",()=>{
  const start=edge.indexOf("function validDocumentBox(");
  const end=edge.indexOf("// Classifier sees only",start);
  const ctx={Math,Number};
  vm.runInNewContext(edge.slice(start,end)+"\nthis.infer=nestedFromPhysicalBoxes;",ctx);
  const box=(x1,y1,x2,y2)=>({label:"Paper",x1,y1,x2,y2});
  const parent=box(0,0,1000,1000),slip=box(20,40,250,420);
  assert.equal(ctx.infer([parent,slip]).length,1);
  assert.equal(ctx.infer([box(0,0,400,1000),box(500,0,1000,1000)]).length,0);
  assert.equal(ctx.infer([parent]).length,0);
  assert.equal(ctx.infer([parent,box(50,70,1000,980)]).length,0);
});
test("A visual overlay hint triggers a focused Gemini check and never silently ignores the child",()=>{
  assert.match(edge,/async function classifyDocument\(bytes,mime,forceNestedCheck=false\)/);
  assert.match(edge,/forceNestedCheck\|\|!classification\.nested_documents\.length/);
  assert.match(edge,/classification\.nested_documents=focused\.boxes/);
  assert.match(edge,/if\(focused\.boxes\.length\)classification\.multiple_documents_visible=true/);
  assert.match(edge,/if\(forceNestedCheck&&!classification\.nested_documents\.length\)/);
  assert.match(edge,/classification\.multiple_documents_visible=true;/);
  assert.match(edge,/form\.get\("layout_overlay_hint"\)==="true"/);
  assert.match(pdf,/form\.set\("layout_overlay_hint","true"\)/);
  assert.match(app,/BillyPdfSeparator\?\.prepare\?\.\(form,currentFile\)/);
});
test("PDF automatically advances after approval and archived nested children, not mere PDF page selection",()=>{
  assert.match(pdf,/\/api\/vision\/document-map/);
  assert.match(pdf,/await renderPage\(output\)/);
  assert.match(pdf,/window\.BillyNested\?\.active\?\.\(\)/);
  assert.match(pdf,/billy:nested-complete/);
  assert.match(pdf,/billy:original-archived/);
  assert.match(pdf,/void advanceAutomatic\(\)/);
  assert.match(read("site/nested-documents.js"),/window\.dispatchEvent\(new CustomEvent\("billy:nested-complete"\)\)/);
  assert.match(read("site/simple.js"),/window\.BillyPdfSeparator\?\.fileLoaded\?\.\(file\)/);
});
