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
test("Reopening archive never duplicates a payment slip after stale and fresh rows overlap",()=>{
  const oldParent=node("parent",null,{title:"Handling Invoice"});
  const oldChild=node("slip","parent",{title:"Payment Slip"});
  const freshParent=node("parent",null,{title:"Handling Invoice"});
  const freshChild=node("slip","parent",{title:"Payment Slip"});
  const units=Array.from(group([oldParent,oldChild,freshParent,freshChild]));
  assert.equal(units.length,1);
  assert.equal(units[0].root,freshParent);
  assert.equal(units[0].children.length,1);
  assert.equal(units[0].children[0],freshChild);
  assert.ok(index.includes("state.records=[];"));
  assert.ok(index.includes("state.navigation=null;"));
  assert.ok(simple.includes("const renderVersion=++uploadedRenderVersion;"));
  assert.ok(simple.includes('renderVersion!==uploadedRenderVersion||body.dataset.billyScreen!=="uploaded"'));
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
  assert.ok(backend.includes('id:"in.("+missing.join(",")+")"'));
  assert.match(backend,/organization_id:"eq\."\+principal\.organization_id/);
  assert.match(backend,/parent_records:parents\.map\(visible\)/);
  assert.match(simple,/const extra=Array\.isArray\(result\.parent_records\)/);
  assert.match(simple,/record\.nested_parent=byId\.get\(record\.parent_document_id\)/);
});
test("Nested family shell matches standalone archive rows and preserves receipt semantics",()=>{
  assert.match(index,/Receipt:\[/);
  assert.match(index,/serviceIcon\(node\.__billyParentId\?"Receipt":node\.__billyDocument\.service\)/);
  assert.match(index,/billy-doc-family-children/);
  assert.match(index,/billy-doc-nested-connector/);
  assert.match(css,/\.billy-doc-family\{[^}]*background:#191b1d/);
  assert.match(css,/#simpleUploaded \.billy-doc-family\{[^}]*background:#191b1d!important/);
  assert.match(css,/body\[data-billy-screen="uploaded"\] \.simple-document-item\{[^}]*background:#191b1d!important/);
  assert.match(css,/#simpleUploaded \.billy-doc-family-parent,[\s\S]*?#simpleUploaded \.billy-doc-family \.simple-document-item:focus-visible\{\s*background:transparent!important/);
  assert.doesNotMatch(css,/#simpleUploaded \.billy-doc-family\{[^}]*background:#242629/);
  assert.doesNotMatch(css,/#simpleUploaded \.billy-doc-family \.simple-document-item:hover\{[^}]*background:#303337/);
  assert.match(css,/\.billy-doc-family-children\{/);
  assert.match(css,/\.billy-doc-nested-connector::after/);
  assert.match(read("site/document-preview.js"),/openParent\.addEventListener\("click",\(\)=>open\(parent\)\)/);
});
test("Nested archive and previews use one color, one line and borderless links",()=>{
  const preview=read("site/document-preview.js");
  assert.match(css,/#simpleUploaded \.billy-doc-family \.simple-document-item:hover/);
  assert.match(css,/#simpleUploaded \.billy-doc-nested-connector::after\{content:none!important/);
  assert.match(css,/\.billy-preview-nested-open::before\{[\s\S]*?content:none!important/);
  assert.match(css,/\.billy-preview-nested-open\{[\s\S]*?border:0!important/);
  assert.match(preview,/node\("h3","","Parent document"\)/);
  assert.match(preview,/node\("h3","","Attached documents"\)/);
  assert.doesNotMatch(preview,/"↳ Attached to "/);
  assert.match(preview,/documentLabel\(parent\)/);
});
test("After original archive, the approved mitosis replaces the old handoff UI",()=>{
  const html=read("site/index.html");
  const mitosis=read("site/nested-mitosis.js");
  assert.match(transition,/Preparing nested document/);
  assert.match(transition,/BillyMitosis\.mount\(visual,\{loop:true,duration:2800\}\)/);
  assert.match(transition,/motion\?\.destroy\?\.\(\)/);
  assert.doesNotMatch(transition,/Reading nested document|billy-nested-transition-parent|billy-nested-transition-path|billy-nested-transition-child/);
  assert.match(css,/\.billy-nested-transition-stage\{/);
  assert.match(css,/\.billy-nested-transition-visual \.billy-mitosis\{/);
  assert.doesNotMatch(css,/@keyframes billy-child-emerge|@keyframes billy-parent-exit|@keyframes billy-nested-path/);
  assert.match(mitosis,/window\.BillyMitosis=\{mount,geometryAt\}/);
  const flow=read("site/nested-documents.js");
  assert.match(flow,/window\.BillyNestedTransition\?\.play\?\.\(label\)/);
  assert.match(flow,/},150\)/);
  assert.match(flow,/window\.BillyNestedTransition\?\.reading\?\.\(\)/);
  assert.match(html,/nested-mitosis\.js\?v=0\.3\.0/);
  assert.match(html,/nested-mitosis\.css\?v=0\.3\.0/);
  assert.match(html,/nested-transition\.js\?v=1\.3\.0/);
  assert.match(read("site/sw.js"),/nested-mitosis\.js/);
  assert.match(read("site/sw.js"),/nested-mitosis\.css/);
});

test("Piggy marker only decorates duplicate root families and links to their original",()=>{
  const html=read("site/index.html");
  const preview=read("site/document-preview.js");
  assert.match(index,/function decorateDuplicate\(card,root\)/);
  assert.match(index,/!record\?\.is_duplicate\|\|!record\.duplicate_of\|\|record\.parent_document_id/);
  assert.match(index,/return decorateDuplicate\(root,root\)/);
  assert.match(index,/return decorateDuplicate\(shell,root\)/);
  assert.match(index,/piggy\.src="\.\/piggybank-mark\.svg"/);
  assert.match(index,/billy-duplicate-speech","Duplicate!"/);
  assert.match(css,/#simpleUploaded \.billy-duplicate-hint\{/);
  assert.match(css,/pointer-events:none/);
  assert.match(css,/#simpleUploaded \.billy-duplicate-wrap\{/);
  assert.match(html,/documents-index\.js\?v=1\.9\.0/);
  assert.match(html,/document-preview\.js\?v=1\.5\.2/);
  assert.match(preview,/Duplicate document/);
  assert.match(preview,/Open original/);
  assert.match(preview,/record\.duplicate_original_state==="approved"/);
  assert.match(preview,/assistant-source\?record_id=/);
  assert.match(read("site/sw.js"),/v104-duplicate-piggy/);
});
