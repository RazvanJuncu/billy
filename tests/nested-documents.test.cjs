const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const client=read("site/nested-documents.js");

test("Nested classifier distinguishes a small attached paper from a whole parent",()=>{
  assert.match(edge,/nested_documents:\{type:"array",maxItems:3/);
  assert.match(edge,/PRIMARY and put only the attached smaller papers in nested_documents/);
  assert.match(edge,/nested_documents:\(\(\)=>\{const direct=nestedBoxes\(data\.nested_documents,data\.multiple_documents_visible\)/);
  const start=edge.indexOf("function validDocumentBox(");
  const end=edge.indexOf("// Classifier sees only",start);
  const ctx={Math,Number};
  vm.runInNewContext(edge.slice(start,end)+"\nthis.nested=nestedBoxes;",ctx);
  const box=(x1,y1,x2,y2)=>({label:"POS",x1,y1,x2,y2});
  assert.equal(ctx.nested([box(20,80,320,450)],true).length,1);
  assert.equal(ctx.nested([box(0,0,1000,1000)],true).length,0);
  assert.equal(ctx.nested([box(20,80,320,450)],false).length,0);
  assert.equal(ctx.nested([box(20,80,320,450),box(20,80,320,450)],true).length,1);
});
test("Child records are linked only after ownership-approved parent verification",()=>{
  assert.match(edge,/const parentId=form\.get\("parent_document_id"\)/);
  assert.match(edge,/parents\[0\]\.state!=="approved"/);
  assert.match(edge,/parents\[0\]\.parent_document_id/);
  assert.match(edge,/created_by:"eq\."\+principal\.user_id/);
  assert.match(edge,/parent_document_id:parentId\|\|null,relationship_type:parentId\?"attached_document":null/);
  assert.match(edge,/nested_exclude/);
  assert.match(edge,/nestedPrimary\?" IMPORTANT: A separate document/);
  assert.match(edge,/Delete attached documents before deleting their parent/);
  const sql=read("supabase/migrations/202611121630_nested_documents.sql");
  assert.match(sql,/parent_document_id uuid references public\.document_records\(id\) on delete restrict/);
  assert.match(sql,/check \(parent_document_id is null or parent_document_id <> id\)/);
  assert.match(sql,/relationship_type='attached_document'/);
});
test("One full photo produces sequential reviews, waiting for original archive",async()=>{
  const handlers=new Map(),opened=[],dispatch=(name,detail)=>{
    (handlers.get(name)||[]).forEach(fn=>fn({detail}));
  };
  class MockFile{constructor(parts,name,opts){this.parts=parts;this.name=name;this.type=opts?.type;this.size=parts.reduce((a,p)=>a+(p.size||5),0);}}
  const file={name:"handling.jpg",type:"image/jpeg",size:100};
  const image={naturalWidth:1000,naturalHeight:1000,decode:async()=>{}};
  const fakeCanvas={width:0,height:0,getContext:()=>({drawImage:()=>{}}),toBlob:callback=>callback({size:2048})};
  const context={
    window:{
      addEventListener:(name,fn)=>handlers.set(name,[...(handlers.get(name)||[]),fn]),
      dispatchEvent:event=>dispatch(event.type,event.detail),
      BillyApp:{openFile:f=>opened.push(f)}
    },
    URL:{createObjectURL:()=>"blob:1",revokeObjectURL:()=>{}},
    Image:class{constructor(){return image;}},
    File:MockFile,document:{createElement:()=>fakeCanvas},
    setTimeout:fn=>fn(),Math,JSON,Number,
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  };
  vm.runInNewContext(client,context);
  const nested=context.window.BillyNested;
  const classification={status:"confident",profile:"handling_invoice",expense_category:"handling",multiple_documents_visible:true,
    nested_documents:[{label:"POS",x1:0,y1:0,x2:310,y2:450}]};
  assert.equal(await nested.start(file,classification),true);
  assert.equal(opened.length,1);
  assert.equal(opened[0],file,"parent must use untouched full photo");
  const firstForm={values:new Map(),set(k,v){this.values.set(k,v)}};
  nested.prepare(firstForm,file);
  assert.equal(firstForm.values.get("nested_primary"),"true");
  assert.equal(firstForm.values.get("profile_override"),"handling_invoice");
  assert.equal(JSON.parse(firstForm.values.get("nested_exclude")).length,1);
  dispatch("billy:document-approved",{approvalId:"parent-id"});
  assert.equal(opened.length,1,"never advance before parent original is archived");
  dispatch("billy:original-archived",{recordId:"parent-id"});
  assert.equal(opened.length,2);
  assert.match(opened[1].name,/nested-1\.jpg$/);
  const secondForm={values:new Map(),set(k,v){this.values.set(k,v)}};
  nested.prepare(secondForm,opened[1]);
  assert.equal(secondForm.values.get("parent_document_id"),"parent-id");
  assert.equal(secondForm.values.has("nested_primary"),false);
  dispatch("billy:document-approved",{approvalId:"child-id"});
  assert.equal(nested.active(),true);
  dispatch("billy:original-archived",{recordId:"child-id"});
  assert.equal(nested.active(),false);
});
test("Nest status and archived hierarchy remain visible without box selection",()=>{
  const app=read("site/app.js"),simple=read("site/simple.js"),preview=read("site/document-preview.js"),
    html=read("site/index.html"),storage=read("site/original-archive.js");
  assert.match(app,/window\.BillyNested\?\.prepare\(form,currentFile\)/);
  assert.match(app,/await window\.BillyNested\.start\(currentFile,responseBody\.classification\)/);
  assert.doesNotMatch(app,/BillyMultiDocs\.open/);
  assert.match(simple,/window\.BillyNested\?\.decorateTitle\(next,\$\("simpleFlowTitle"\)\)/);
  assert.match(simple,/maybeStartProcessing\(\);\s*\}\s*\}\);/);
  assert.match(simple,/record\.nested_children=family\.filter/);
  assert.match(simple,/record\.parent_document_id\?"↳ ":""/);
  assert.match(preview,/Attached documents/);
  assert.match(storage,/billy:original-archived/);
  assert.match(html,/nested-documents\.js\?v=1\.2\.0/);
  assert.doesNotMatch(html,/multi-documents\.js\?v=/);
});
