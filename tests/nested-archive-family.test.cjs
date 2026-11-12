const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const index=read("site/documents-index.js");
const simple=read("site/simple.js");
const backend=read("supabase/functions/billy-vision/index.ts");
const transition=read("site/nested-transition.js");
const css=read("site/simple.css");
const ctx={window:{},Math,Map,Set,Date};
vm.runInNewContext(index,ctx);
const group=ctx.window.BillyDocumentsIndex.groupFamilies;
const node=(id,parent,metadata)=>({
  __billyRecordId:id,__billyParentId:parent,
  __billyDocument:{title:"Payment Slip",aircraft:"Unassigned",airport:"Unassigned",
    vendor:"Unassigned",service:"Unassigned",date:0,...metadata}
});
test("Parent and child become one family regardless of order, without duplicate standalone receipt",()=>{
  const parent=node("p1",null,{title:"Handling Invoice",airport:"LRBS",vendor:"Handler",service:"Handling",aircraft:"YR-DDN"});
  const slip=node("c1","p1",{title:"Payment Slip",airport:"Unassigned",vendor:"Bank",service:"Other"});
  const result=Array.from(group([slip,parent]));
  assert.equal(result.length,1);
  assert.equal(result[0].root,parent);
  assert.equal(result[0].children.length,1);
  assert.equal(result[0].children[0],slip);
  assert.equal(result[0].root.__billyDocument.airport,"LRBS");
  assert.equal(result[0].root.__billyDocument.vendor,"Handler");
  assert.equal(result[0].root.__billyDocument.service,"Handling");
  assert.equal(result[0].root.__billyDocument.aircraft,"YR-DDN");
  assert.match(index,/Category is defined by the parent, never by its payment evidence/);
  assert.match(index,/groupFamilies\(state\.records\)/);
  assert.match(index,/nodes\.some\(node=>/);
  assert.match(index,/family\.root\.__billyDocument\[groupKey\]/);
});
test("Unrelated documents remain separate; a missing parent cannot appear as independent invoice",()=>{
  const unrelated=node("p2",null,{title:"Fuel Release"});
  const missing=node("c2","not-in-page",{title:"Payment Slip"});
  const units=Array.from(group([unrelated,missing]));
  assert.equal(units.length,2);
  assert.equal(units.find(u=>u.root===missing).missingParent,true);
  assert.match(index,/Parent document unavailable/);
  assert.match(index,/billy-doc-family-missing/);
});
test("Backend supplies only referenced parents when paginated child appears without parent",()=>{
  assert.match(backend,/const missing=\[\.\.\.new Set\(page\.map\(record=>record\.parent_document_id\)/);
  assert.match(backend,/id:"in\."\+"\("\+missing\.join\(","\)\+"\)"/);
  assert.match(backend,/organization_id:"eq\."\+principal\.organization_id/);
  assert.match(backend,/parent_records:parents\.map\(visible\)/);
  assert.match(simple,/const extra=Array\.isArray\(result\.parent_records\)/);
  assert.match(simple,/record\.nested_parent=byId\.get\(record\.parent_document_id\)/);
});
test("Shared grey family container and receipt glyph preserve distinct source semantics",()=>{
  assert.match(index,/Receipt:\[/);
  assert.match(index,/serviceIcon\(node\.__billyParentId\?"Receipt":node\.__billyDocument\.service\)/);
  assert.match(index,/billy-doc-family-children/);
  assert.match(index,/billy-doc-nested-connector/);
  assert.match(css,/\.billy-doc-family\{[^}]*background:#292c2f/);
  assert.match(css,/\.billy-doc-family-children\{/);
  assert.match(css,/\.billy-doc-nested-connector::after/);
  assert.match(read("site/document-preview.js"),/openParent\.addEventListener\("click",\(\)=>open\(parent\)\)/);
});
test("After original archive, animated child emerges and scales into focus",()=>{
  assert.match(transition,/Preparing nested document/);
  assert.match(transition,/billy-nested-transition-parent/);
  assert.match(transition,/billy-nested-transition-child/);
  assert.match(transition,/billy-nested-transition-path/);
  assert.match(css,/@keyframes billy-child-emerge/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  const flow=read("site/nested-documents.js");
  assert.match(flow,/window\.BillyNestedTransition\?\.play\?\.\(label\)/);
  assert.match(flow,/window\.BillyNestedTransition\?\.stop\?\.\(\)/);
  assert.match(flow,/transition\?1450:150/);
  assert.match(read("site/index.html"),/nested-transition\.js\?v=1\.0\.0/);
  assert.match(read("site/sw.js"),/nested-transition\.js/);
});
