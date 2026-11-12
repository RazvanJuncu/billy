const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");

function harness(options={}){
  const start=edge.indexOf("const ORIGINAL_BUCKET=");
  const end=edge.indexOf("// Deleting pilot records",start);
  assert.ok(start>0&&end>start,"private storage handlers exist");
  const id="11111111-1111-4111-8111-111111111111";
  const org="22222222-2222-4222-8222-222222222222";
  const owner="33333333-3333-4333-8333-333333333333";
  const principal={organization_id:org,user_id:owner,url:"https://example.supabase.co",secret:"fake-service-secret"};
  const calls=[];
  const record={id,organization_id:org,created_by:owner,state:"approved",source_sha256:"expected-sha",original_storage_key:null,original_mime:null,original_bytes:null};
  const sandbox={
    URL,Response,Uint8Array,AbortSignal,ORIGIN:"https://razvanjuncu.github.io",MAX_BYTES:10485760,
    sha256:async bytes=>options.mismatch?"wrong-sha":"expected-sha",
    mimeOf:(name,bytes)=>{if(bytes[0]!==37)throw Error("Bad signature");return "application/pdf";},
    json:(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}}),
    error:(detail,status)=>new Response(JSON.stringify({detail}),{status,headers:{"Content-Type":"application/json"}}),
    database:async (_principal,method,table,filter,body)=>{
      calls.push({service:"database",method,table,filter,body});
      if(method==="GET")return options.missing?[]:[record];
      if(method==="PATCH"){Object.assign(record,body);return [{id}];}
      if(method==="DELETE")return [{id}];
      throw Error("Unsupported DB method");
    },
    fetch:async (url,args)=>{
      calls.push({service:"storage",url,method:args.method});
      if(options.failStorage)return new Response("",{status:503});
      if(args.method==="GET")return new Response(new Uint8Array([37,80,68,70,45]),{status:200});
      return new Response('{"Key":"ok"}',{status:200});
    }
  };
  vm.runInNewContext(edge.slice(start,end)+
    "\nthis.uploadOriginal=uploadOriginal;this.downloadOriginal=downloadOriginal;this.removeOriginalObject=removeOriginalObject;",sandbox);
  const target="https://example.com/api/vision/original?record_id="+id;
  const request=()=>new Request(target,{method:"POST",headers:{"Content-Type":"application/pdf"},
    body:new Uint8Array([37,80,68,70,45])});
  return {sandbox,record,principal,calls,request,target,org,id};
}
test("Private archive rejects missing/unauthorized or unapproved records",async()=>{
  let t=harness({missing:true});
  let result=await t.sandbox.uploadOriginal(t.request(),t.principal);
  assert.equal(result.status,404);
  assert.equal(t.calls.filter(c=>c.service==="storage").length,0);
  t=harness();t.record.state="extracted";
  result=await t.sandbox.uploadOriginal(t.request(),t.principal);
  assert.equal(result.status,409);
  assert.equal(t.calls.filter(c=>c.service==="storage").length,0);
});
test("Only exact SHA-256 matched uploads are archived",async()=>{
  let t=harness({mismatch:true});
  let result=await t.sandbox.uploadOriginal(t.request(),t.principal);
  assert.equal(result.status,409);
  assert.equal(t.record.original_storage_key,null);
  assert.equal(t.calls.filter(c=>c.service==="storage").length,0);
  t=harness();
  result=await t.sandbox.uploadOriginal(t.request(),t.principal);
  assert.equal(result.status,200);
  assert.equal(t.record.original_storage_key,t.org+"/"+t.id+"/original.pdf");
  assert.equal(t.record.original_mime,"application/pdf");
  assert.equal(t.record.original_bytes,5);
  assert.equal(t.calls.filter(c=>c.service==="storage"&&c.method==="POST").length,1);
  assert.ok(t.calls.some(c=>c.service==="database"&&c.method==="PATCH"&&c.filter.original_storage_key==="is.null"));
});
test("Private original downloads use team-scoped ledger and no public URL",async()=>{
  const t=harness();t.record.original_storage_key=t.org+"/"+t.id+"/original.pdf";t.record.original_mime="application/pdf";
  let result=await t.sandbox.downloadOriginal(new Request(t.target),t.principal);
  assert.equal(result.status,200);
  assert.equal(result.headers.get("Cache-Control"),"no-store, private");
  assert.equal(result.headers.get("Content-Type"),"application/pdf");
  assert.ok(t.calls.some(c=>c.service==="storage"&&c.url.includes("/object/authenticated/billy-originals/")));
  t.record.original_storage_key=null;
  result=await t.sandbox.downloadOriginal(new Request(t.target),t.principal);
  assert.equal(result.status,404);
});
test("Original browser code stores only approved file and supports authentic preview",()=>{
  const frontend=read("site/original-archive.js");
  const simple=read("site/simple.js");
  const preview=read("site/document-preview.js");
  const html=read("site/index.html");
  const sql=read("supabase/migrations/202611121500_private_originals.sql");
  assert.match(simple,/window\.BillyOriginals\?\.save\(approvalId,approvedFile\)/);
  assert.match(simple,/window\.BillyOriginals\?\.reset\?\.\(\)/);
  assert.match(frontend,/window\.BillyAccounts\.sessionHeaders\(\)/);
  assert.match(frontend,/\/api\/vision\/original\?record_id=/);
  assert.match(frontend,/body:file/);
  assert.match(frontend,/Retry/);
  assert.match(preview,/window\.BillyOriginals\.retrieve\(record\.id\)/);
  assert.match(preview,/URL\.revokeObjectURL\(originalUrl\)/);
  assert.match(preview,/Original PDF\/photo is not archived/);
  assert.match(edge,/const \{original_storage_key,\.\.\.rest\}=effective/);
  assert.match(edge,/has_original:Boolean\(original_storage_key\)/);
  assert.match(sql,/false,10485760/);
  assert.doesNotMatch(sql,/create policy/i);
  assert.match(html,/original-archive\.js\?v=1\.1\.0/);
});
