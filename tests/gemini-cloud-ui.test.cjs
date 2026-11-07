const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");
const { webcrypto } = require("node:crypto");

const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const code = read("supabase/functions/billy-vision/index.ts");
const auth = read("site/accounts.js"), config = read("site/account-config.js");
const app = read("site/app.js"), review = read("site/vision-review.js");
const flow = read("site/simple.js");
const ORG = "22222222-2222-4222-8222-222222222222";
const UID = "11111111-1111-4111-8111-111111111111";
const authHeaders = {
  "Authorization": "Bearer " + "X".repeat(40),
  "X-Billy-Organization": ORG,
  "apikey": "sb_publishable_synthetic",
};
const doc = {
  supplier_name:"TEST SUPPLIER", supplier_tax_id:null,
  customer_name:null,invoice_number:"INV-42",issue_date:"2026-11-07",
  due_date:null,currency:"RON",subtotal:"100.00",vat_total:"19.00",
  grand_total:"119.00",lines:[],notes:[]
};
const regions = [{
  field_path:"invoice_number",page:1,box_2d:[100,100,130,500],
  transcription:"INV-42",visual_clarity:"clear",script_type:"printed",
  alternate_readings:[],visual_reason:null
}];

function mockBackend(opts={}) {
  const stored=new Map(), calls=[];
  let handler;
  const googleResponse=()=>new Response(JSON.stringify({
    candidates:[{content:{parts:[{text:JSON.stringify({...doc,regions})}]}}],
    usageMetadata:{promptTokenCount:1000,candidatesTokenCount:120,totalTokenCount:1120}
  }),{status:200,headers:{"Content-Type":"application/json"}});
  const mockFetch=async (input, init={})=>{
    const url=new URL(String(input));calls.push({url:url.href,method:init.method||"GET"});
    if(url.pathname.endsWith("/auth/v1/user"))
      return new Response(JSON.stringify({id:UID,email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
    if(url.pathname.endsWith("/organization_memberships"))
      return new Response(JSON.stringify(opts.noMembership?[]:[{role:"owner"}]),{status:200});
    if(url.hostname==="generativelanguage.googleapis.com")return googleResponse();
    if(url.pathname.endsWith("/document_records")){
      if(init.method==="POST"){
        const entry=JSON.parse(init.body);
        stored.set(entry.id,entry);
        return new Response(JSON.stringify([entry]),{status:201});
      }
      if(init.method==="PATCH"){
        const id=url.searchParams.get("id").replace(/^eq\./,"");
        const existing=stored.get(id);
        if(!existing||existing.state!=="extracted")return new Response("[]",{status:200});
        Object.assign(existing,JSON.parse(init.body));
        return new Response(JSON.stringify([{id}]),{status:200});
      }
      const id=url.searchParams.get("id");
      const list=[...stored.values()].filter(item=>!id||"eq."+item.id===id);
      return new Response(JSON.stringify(list),{status:200});
    }
    throw Error("Unexpected endpoint in test: "+url.href);
  };
  const sandbox={
    Deno:{env:{get:key=>({
      SUPABASE_URL:"https://synthetic.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY:"super_secret_server_only",
      GEMINI_API_KEY:opts.missingKey?"":"synthetic_google_secret"
    }[key]||"")},serve:fn=>{handler=fn;}},
    fetch:mockFetch,Response,File,URL,URLSearchParams,FormData,Headers,
    AbortSignal,Uint8Array,crypto:webcrypto,btoa,console,TextEncoder,TextDecoder
  };
  vm.runInNewContext(code,sandbox,{filename:"billy-vision/index.ts"});
  assert.equal(typeof handler,"function");
  const call=(route,method="GET",extra={})=>new Request(
    "https://synthetic.supabase.co/functions/v1/billy-vision"+route,
    {method,headers:authHeaders,...extra}
  );
  return {handler,call,stored,calls};
}

test("Gemini is server-side; PWA uses Supabase HTTPS and public key only",()=>{
  assert.match(config,/apiUrl: "https:\/\/ookafdnvavohfopxfxpf\.supabase\.co\/functions\/v1\/billy-vision"/);
  assert.match(auth,/"apikey":config\.publishableKey/);
  assert.match(app,/\/api\/vision\/health/);
  assert.match(app,/\/api\/vision\/extract/);
  assert.match(review,/\/api\/vision\/approve/);
  assert.match(flow,/\/api\/vision\/records/);
  assert.doesNotMatch(config,/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
  assert.match(code,/GEMINI_API_KEY/);
  assert.doesNotMatch(code,/handwriting_inference|second_opinion\(/);
});

test("Cloud health reports missing Gemini secret without exposing it",async()=>{
  const {handler,call}=mockBackend({missingKey:true});
  const r=await handler(call("/api/vision/health"));
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.configured,false);
  assert.equal(data.excel_write_enabled,false);
  assert.equal(data.handwriting.enabled,false);
  assert.equal(JSON.stringify(data).includes("super_secret_server_only"),false);
});

test("Valid signed-in team member can extract, review, approve and list a document",async()=>{
  const {handler,call,stored}=mockBackend();
  const form=new FormData();
  form.append("file",new File([new Uint8Array([255,216,5,6,7,8])],"test.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const extracted=await handler(call("/api/vision/extract","POST",{body:form}));
  assert.equal(extracted.status,200);
  const result=await extracted.json();
  assert.equal(result.invoice.invoice_number,"INV-42");
  assert.equal(result.regions.length,1);
  assert.equal(result.handwriting_second_opinion.status,"disabled");
  assert.equal(result.confidence,null);
  assert.equal(stored.size,1);
  const record=stored.get(result.extraction_id);
  assert.equal(record.source_sha256.length,64);
  assert.equal(record.extracted_data.invoice_number,"INV-42");
  assert.equal(record.reviewed_data,undefined);
  assert.equal(Object.hasOwn(record,"original_file"),false);
  const approval=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({
      extraction_id:result.extraction_id,document_type:"invoice",
      confirmed:true,document:{...result.invoice,invoice_number:"INV-43"}
    })
  }));
  assert.equal(approval.status,200);
  const approved=await approval.json();
  assert.equal(approved.correction_count,1);
  assert.equal(approved.posted_to_excel,false);
  assert.equal(stored.get(result.extraction_id).reviewed_data.invoice_number,"INV-43");
  const list=await handler(call("/api/vision/records"));
  assert.equal(list.status,200);
  assert.equal((await list.json()).records.length,1);
  const repeat=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({
      extraction_id:result.extraction_id,document_type:"invoice",
      confirmed:true,document:result.invoice
    })
  }));
  assert.equal(repeat.status,409);
});

test("Member verification is mandatory, even when a browser sends an organization ID",async()=>{
  const {handler,call}=mockBackend({noMembership:true});
  const response=await handler(call("/api/vision/health"));
  assert.equal(response.status,401);
});

test("Untrusted origins cannot call Gemini",async()=>{
  const {handler,call}=mockBackend();
  const response=await handler(call("/api/vision/health","GET",{
    headers:{...authHeaders,Origin:"https://evil.example"}
  }));
  assert.equal(response.status,403);
});
