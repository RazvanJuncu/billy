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
  const stored=new Map(), calls=[], examples=[...(opts.preloadedExamples||[])], googlePrompts=[];
  let handler;
  const googleResponse=()=>new Response(JSON.stringify({
    candidates:[{content:{parts:[{text:JSON.stringify({...opts.fuelDoc||doc,regions:opts.regions||regions})}]}}],
    usageMetadata:{promptTokenCount:1000,candidatesTokenCount:120,totalTokenCount:1120}
  }),{status:200,headers:{"Content-Type":"application/json"}});
  const mockFetch=async (input, init={})=>{
    const url=new URL(String(input));calls.push({url:url.href,method:init.method||"GET"});
    if(url.pathname.endsWith("/auth/v1/user"))
      return new Response(JSON.stringify({id:UID,email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
    if(url.pathname.endsWith("/organization_memberships"))
      return new Response(JSON.stringify(opts.noMembership?[]:[{role:"owner"}]),{status:200});
    if(url.hostname==="generativelanguage.googleapis.com"){
      const body=JSON.parse(init.body);
      const prompt=body.contents[0].parts[0].text||"";
      googlePrompts.push(prompt);
      if(prompt.includes("Independently check whether the supplied field values")){
        const checks=opts.recheckChecks||[
          {field_path:"supplier_name",status:"match",reason:"Visible"},
          {field_path:"invoice_number",status:"match",reason:"Visible"},
          {field_path:"issue_date",status:"match",reason:"Visible"},
          {field_path:"currency",status:"match",reason:"Visible"},
          {field_path:"subtotal",status:"match",reason:"Visible"},
          {field_path:"vat_total",status:"match",reason:"Visible"},
          {field_path:"grand_total",status:"match",reason:"Visible"}
        ];
        return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({checks})}]}}]}),{
          status:200,headers:{"Content-Type":"application/json"}
        });
      }
      return googleResponse();
    }
    if(url.pathname.endsWith("/billy_intelligence_examples")){
      if(init.method==="POST"){
        if(opts.memorySaveFails)return new Response("Unavailable",{status:503});
        const rows=JSON.parse(init.body);
        examples.push(...rows);
        return new Response(JSON.stringify(rows),{status:201});
      }
      if(opts.memoryReadFails)return new Response("Unavailable",{status:503});
      const org=url.searchParams.get("organization_id")?.replace(/^eq\./,"");
      const type=url.searchParams.get("document_type")?.replace(/^eq\./,"");
      const rows=examples.filter(row=>row.organization_id===org&&row.document_type===type);
      return new Response(JSON.stringify(rows.reverse()),{status:200});
    }
    if(url.pathname.endsWith("/document_records")){
      if(init.method==="DELETE"){
        const id=url.searchParams.get("id")?.replace(/^eq\./,"");
        const org=url.searchParams.get("organization_id")?.replace(/^eq\./,"");
        const creator=url.searchParams.get("created_by")?.replace(/^eq\./,"");
        const record=stored.get(id);
        if(!record||record.organization_id!==org||record.created_by!==creator)
          return new Response("[]",{status:200});
        stored.delete(id);
        for(let i=examples.length-1;i>=0;i--)
          if(examples[i].source_record_id===id)examples.splice(i,1);
        return new Response(JSON.stringify([{id}]),{status:200});
      }
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
  return {handler,call,stored,calls,examples,googlePrompts};
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

test("Vision health recognizes both public and function-local Supabase paths",async()=>{
  const {handler}=mockBackend();
  const paths=[
    "/api/vision/health",
    "/billy-vision/api/vision/health",
    "/functions/v1/billy-vision/api/vision/health"
  ];
  for(const pathname of paths){
    const response=await handler(new Request("https://synthetic.supabase.co"+pathname,{headers:authHeaders}));
    assert.equal(response.status,200,pathname);
    assert.equal((await response.json()).status,"online");
  }
  const missing=await handler(new Request("https://synthetic.supabase.co/billy-vision/api/vision/unknown",{headers:authHeaders}));
  assert.equal(missing.status,404);
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

test("Fuel Release meter arithmetic is independent of OCR certainty and preserves the raw label",async()=>{
  const fuelDoc={
    release_number:"29097",supplier_name:"THE PENNSYLVANIA STATE UNIVERSITY",
    operator_name:"NET JETS",airport:"KUNV",aircraft_registration:"N776QS",
    flight_number:null,delivery_date:"04-13-24",fuel_type:"JET A",
    requested_quantity:null,delivered_quantity:"1417",quantity_unit:"GAL",
    truck_identifier:null,fueler_name:null,receiver_name:null,
    meter_start:"4301809",meter_finish:"4303226",
    handwritten_entries:[{
      label:"AIRCRAFT TYPE",transcription:"NET JETS",legibility:"clear",
      interpreted_as:"operator_name"
    }],notes:["Meter readings faint in the source."]
  };
  const fuelRegions=[{
    field_path:"meter_start",page:1,box_2d:[200,100,230,300],
    transcription:"4301809",visual_clarity:"slight_uncertainty",script_type:"printed",
    alternate_readings:[],visual_reason:"Faint dot-matrix digits"
  }];
  const {handler,call,stored}=mockBackend({fuelDoc,regions:fuelRegions});
  const form=new FormData();
  form.append("file",new File([new Uint8Array([255,216,5,6])],"fuel.jpg",{type:"image/jpeg"}));
  form.append("document_type","fuel_release");
  const extraction=await handler(call("/api/vision/extract","POST",{body:form}));
  assert.equal(extraction.status,200);
  const prediction=await extraction.json();
  assert.equal(prediction.fuel_release.meter_start,"4301809");
  assert.equal(prediction.fuel_release.meter_finish,"4303226");
  assert.deepEqual(JSON.parse(JSON.stringify(prediction.fuel_release.handwritten_entries[0])),{
    label:"AIRCRAFT TYPE",transcription:"NET JETS",legibility:"clear",
    interpreted_as:"operator_name"
  });
  assert.ok(prediction.validation_warnings.some(w=>w.includes("Meter arithmetic matches (1417)")));
  assert.ok(prediction.validation_warnings.some(w=>w.includes("Needs verification: meter_start")));
  const source=stored.get(prediction.extraction_id);
  assert.equal(source.extracted_data.meter_finish,"4303226");
  const reviewed={...prediction.fuel_release,meter_finish:"4303225"};
  const approval=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({extraction_id:prediction.extraction_id,document_type:"fuel_release",document:reviewed,confirmed:true})
  }));
  assert.equal(approval.status,200);
  assert.ok((await approval.json()).validation_warnings.some(w=>w.includes("Meter mismatch")));
  assert.equal(source.extracted_data.meter_finish,"4303226");
  assert.equal(source.reviewed_data.meter_finish,"4303225");
  const records=await handler(call("/api/vision/records"));
  const record=(await records.json()).records[0];
  assert.equal(record.extracted_data.meter_finish,"4303226");
  assert.equal(record.reviewed_data.meter_finish,"4303225");
  assert.ok(record.original_validation_warnings.some(w=>w.includes("Meter arithmetic matches")));
});

test("Meter mismatch, suspicious digits, and unclear regions are flagged",()=>{
  // Execute helper functions in the real Edge Function code, not a second JS implementation.
  const sandbox={Deno:{serve:()=>{}},Response,URL,console};
  vm.runInNewContext(code,sandbox);
  const valid=()=>({
    release_number:"",supplier_name:"",operator_name:"",airport:"",aircraft_registration:"N776QS",
    flight_number:null,delivery_date:"04-13-24",fuel_type:"JET A",
    requested_quantity:null,delivered_quantity:"1416",quantity_unit:"GAL",
    truck_identifier:null,fueler_name:null,receiver_name:null,meter_start:"4301809",meter_finish:"4303226",
    handwritten_entries:[],notes:[]
  });
  const one=valid();
  assert.ok(vm.runInNewContext("validate",sandbox)(one,"fuel_release",[])
    .some(w=>w.includes("Meter mismatch")));
  one.meter_start="43O1809";
  assert.ok(vm.runInNewContext("validate",sandbox)(one,"fuel_release",[])
    .some(w=>w.includes("invalid or ambiguous digits")));
});

test("Recheck compares reviewed values against the exact original file without overwriting source",async()=>{
  const {handler,call,stored,calls}=mockBackend({recheckChecks:[
    {field_path:"supplier_name",status:"match",reason:"Visible"},
    {field_path:"invoice_number",status:"mismatch",reason:"Image clearly says INV-42"},
    {field_path:"grand_total",status:"unclear",reason:"Faint printed digits"}
  ]});
  const bytes=new Uint8Array([255,216,5,6,7,8]);
  const form=new FormData();
  form.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const extracted=await handler(call("/api/vision/extract","POST",{body:form}));
  assert.equal(extracted.status,200);
  const data=await extracted.json();
  const amended={...data.invoice,invoice_number:"INV-43"};
  const check=new FormData();
  check.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));
  check.append("document_type","invoice");
  check.append("extraction_id",data.extraction_id);
  check.append("reviewed_document",JSON.stringify(amended));
  const response=await handler(call("/api/vision/recheck","POST",{body:check}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.checks.find(x=>x.field_path==="invoice_number").status,"mismatch");
  assert.equal(result.checks.find(x=>x.field_path==="grand_total").status,"unclear");
  assert.equal(result.approval_unlocked,false);
  assert.ok(result.unverified_count>=2);
  assert.ok(result.checks.every(x=>x.status!=="match"||x.field_path!=="grand_total"));
  assert.equal(stored.get(data.extraction_id).extracted_data.invoice_number,"INV-42");
  assert.equal(stored.get(data.extraction_id).reviewed_data,undefined);
  assert.equal(calls.filter(x=>x.url.includes("generativelanguage.googleapis.com")).length,2);
  const tampered=new FormData();
  tampered.append("file",new File([new Uint8Array([255,216,9])],"doc.jpg",{type:"image/jpeg"}));
  tampered.append("document_type","invoice");
  tampered.append("extraction_id",data.extraction_id);
  tampered.append("reviewed_document",JSON.stringify(amended));
  const rejected=await handler(call("/api/vision/recheck","POST",{body:tampered}));
  assert.equal(rejected.status,409);
});

test("Recheck treats omitted AI field checks as unclear, never green",async()=>{
  const {handler,call}=mockBackend({recheckChecks:[]});
  const bytes=new Uint8Array([255,216,5,6,7,8]);
  const form=new FormData();
  form.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const extracted=await handler(call("/api/vision/extract","POST",{body:form}));
  const prediction=await extracted.json();
  const check=new FormData();
  check.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));
  check.append("document_type","invoice");
  check.append("extraction_id",prediction.extraction_id);
  check.append("reviewed_document",JSON.stringify(prediction.invoice));
  const response=await handler(call("/api/vision/recheck","POST",{body:check}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.ok(result.checked_count>0);
  assert.equal(result.checked_count,result.unverified_count);
  assert.ok(result.checks.every(x=>x.status==="unclear"));
});

test("Not-on-document fields stay empty, are skipped during recheck, and persist as operator metadata",async()=>{
  const {handler,call,stored,calls}=mockBackend({recheckChecks:[
    {field_path:"supplier_name",status:"match",reason:"Visible on invoice"},
    {field_path:"invoice_number",status:"match",reason:"Visible on invoice"}
  ]});
  const bytes=new Uint8Array([255,216,5,6,7,8]);
  const initial=new FormData();
  initial.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));
  initial.append("document_type","invoice");
  const extraction=await handler(call("/api/vision/extract","POST",{body:initial}));
  assert.equal(extraction.status,200);
  const data=await extraction.json();
  const doc={...data.invoice,grand_total:null};
  const absent=["grand_total"];
  const form=new FormData();
  form.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  form.append("extraction_id",data.extraction_id);
  form.append("reviewed_document",JSON.stringify(doc));
  form.append("not_on_document",JSON.stringify(absent));
  const response=await handler(call("/api/vision/recheck","POST",{body:form}));
  assert.equal(response.status,200);
  const checked=await response.json();
  assert.deepEqual(Array.from(checked.skipped_not_on_document),absent);
  assert.ok(!checked.checks.some(c=>c.field_path==="grand_total"));
  // Recheck must not silently repopulate the value or change the original extraction.
  assert.equal(stored.get(data.extraction_id).extracted_data.grand_total,"119.00");
  const approval=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({extraction_id:data.extraction_id,document_type:"invoice",document:doc,confirmed:true,not_on_document:absent})
  }));
  assert.equal(approval.status,200);
  const saved=stored.get(data.extraction_id);
  assert.equal(saved.reviewed_data.grand_total,null);
  assert.deepEqual(Array.from(saved.review_metadata.not_on_document),absent);
  assert.equal(saved.review_metadata.origin,"operator_confirmation");
  const history=await handler(call("/api/vision/records"));
  assert.equal(history.status,200);
  const record=(await history.json()).records[0];
  assert.deepEqual(Array.from(record.review_metadata.not_on_document),absent);
  assert.equal(calls.filter(c=>c.url.includes("generativelanguage.googleapis.com")).length,2);
});

test("The backend rejects attempts to mark populated or unknown fields absent",async()=>{
  const {handler,call}=mockBackend();
  const bytes=new Uint8Array([255,216,5,6,7,8]);
  const initial=new FormData();
  initial.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));
  initial.append("document_type","invoice");
  const extraction=await handler(call("/api/vision/extract","POST",{body:initial}));
  assert.equal(extraction.status,200);
  const data=await extraction.json();
  for(const absent of [["grand_total"],["not_a_real_field"]]){
    const approval=await handler(call("/api/vision/approve","POST",{
      headers:{...authHeaders,"Content-Type":"application/json"},
      body:JSON.stringify({extraction_id:data.extraction_id,document_type:"invoice",
        document:data.invoice,confirmed:true,not_on_document:absent})
    }));
    assert.equal(approval.status,400);
  }
});


test("Billy Intelligence stores only opted-in corrections and reuses same-team examples on a later scan",async()=>{
  const {handler,call,stored,examples,googlePrompts}=mockBackend();
  const bytes=new Uint8Array([255,216,5,6,7,8]);
  const form=()=>{const f=new FormData();f.append("file",new File([bytes],"doc.jpg",{type:"image/jpeg"}));f.append("document_type","invoice");return f;};
  const initial=await handler(call("/api/vision/extract","POST",{body:form()}));
  assert.equal(initial.status,200);
  const data=await initial.json();
  assert.equal(data.intelligence.examples_used,0);
  const edited={...data.invoice,supplier_name:"TEST SUPPLIER INC"};
  const approved=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({extraction_id:data.extraction_id,document_type:"invoice",document:edited,
      confirmed:true,intelligence_opt_in:true})
  }));
  assert.equal(approved.status,200);
  const body=await approved.json();
  assert.equal(body.intelligence.status,"saved");
  assert.equal(body.intelligence.examples_saved,1);
  assert.equal(examples.length,1);
  assert.equal(examples[0].organization_id,ORG);
  assert.equal(examples[0].original_text,"TEST SUPPLIER");
  assert.equal(examples[0].corrected_text,"TEST SUPPLIER INC");
  assert.equal(examples[0].source_record_id,data.extraction_id);
  assert.ok(!("image" in examples[0]));
  assert.equal(stored.get(data.extraction_id).extracted_data.supplier_name,"TEST SUPPLIER");
  const future=await handler(call("/api/vision/extract","POST",{body:form()}));
  assert.equal(future.status,200);
  const next=await future.json();
  assert.equal(next.intelligence.examples_used,1);
  assert.match(googlePrompts.at(-1),/Billy Intelligence: examples/);
  assert.match(googlePrompts.at(-1),/TEST SUPPLIER INC/);
  assert.match(googlePrompts.at(-1),/Never copy names/);
  assert.equal(next.invoice.supplier_name,"TEST SUPPLIER"); // Mock model did not copy old data.
});

test("Without opt-in Billy Intelligence never saves corrected text",async()=>{
  const {handler,call,examples}=mockBackend();
  const form=new FormData();form.append("file",new File([new Uint8Array([255,216,1])],"a.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const scanned=await handler(call("/api/vision/extract","POST",{body:form}));
  const id=(await scanned.json()).extraction_id;
  const response=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({extraction_id:id,document_type:"invoice",
      document:{...doc,supplier_name:"CHANGED SUPPLIER"},confirmed:true})
  }));
  assert.equal(response.status,200);
  assert.equal((await response.json()).intelligence.status,"not_requested");
  assert.equal(examples.length,0);
});

test("Intelligence examples cannot leak across organizations and identifier fields are excluded",async()=>{
  const malicious={
    organization_id:"99999999-9999-4999-8999-999999999999",
    document_type:"invoice",field_path:"supplier_name",
    original_text:"PRIVATE_ORG_DATA",corrected_text:"OTHER_ORG_SECRET",field_label:null
  };
  const {handler,call,examples,googlePrompts}=mockBackend({preloadedExamples:[malicious]});
  const form=new FormData();form.append("file",new File([new Uint8Array([255,216,1])],"a.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const scanned=await handler(call("/api/vision/extract","POST",{body:form}));
  const data=await scanned.json();
  assert.equal(data.intelligence.examples_used,0);
  assert.doesNotMatch(googlePrompts[0],/OTHER_ORG_SECRET/);
  const changed={...data.invoice,invoice_number:"PRIVATE_INV_NUMBER",customer_name:"PRIVATE_CUSTOMER"};
  const response=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({extraction_id:data.extraction_id,document_type:"invoice",
      document:changed,confirmed:true,intelligence_opt_in:true})
  }));
  assert.equal(response.status,200);
  assert.equal((await response.json()).intelligence.status,"no_eligible_corrections");
  assert.equal(examples.length,1);
});

test("If Intelligence storage is down, original extraction and approval still work",async()=>{
  const {handler,call,googlePrompts}=mockBackend({memoryReadFails:true,memorySaveFails:true});
  const form=new FormData();form.append("file",new File([new Uint8Array([255,216,1])],"a.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const scanned=await handler(call("/api/vision/extract","POST",{body:form}));
  assert.equal(scanned.status,200);
  const data=await scanned.json();
  assert.equal(data.intelligence.examples_used,0);
  const response=await handler(call("/api/vision/approve","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({extraction_id:data.extraction_id,document_type:"invoice",
      document:{...data.invoice,supplier_name:"CORRECTED"},confirmed:true,intelligence_opt_in:true})
  }));
  assert.equal(response.status,200);
  assert.equal((await response.json()).intelligence.status,"save_failed");
  assert.ok(!googlePrompts[0].includes("Billy Intelligence: examples"));
});

test("Creator can delete one cloud document, and its Intelligence examples are removed",async()=>{
  const {handler,call,stored,examples}=mockBackend();
  const form=new FormData();
  form.append("file",new File([new Uint8Array([255,216,7])],"file.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const extracted=await handler(call("/api/vision/extract","POST",{body:form}));
  const data=await extracted.json();
  assert.equal(extracted.status,200);
  assert.equal(stored.has(data.extraction_id),true);
  examples.push({
    source_record_id:data.extraction_id,organization_id:ORG,document_type:"invoice",
    original_text:"OLD",corrected_text:"NEW",field_path:"supplier_name"
  });
  const deleted=await handler(call("/api/vision/delete","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({record_id:data.extraction_id})
  }));
  assert.equal(deleted.status,200);
  const json=await deleted.json();
  assert.equal(json.deleted,true);
  assert.equal(json.record_id,data.extraction_id);
  assert.equal(json.intelligence_examples_removed_with_record,true);
  assert.equal(stored.has(data.extraction_id),false);
  assert.equal(examples.length,0);
  const history=await handler(call("/api/vision/records"));
  const records=(await history.json()).records;
  assert.equal(records.length,0);
  const again=await handler(call("/api/vision/delete","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({record_id:data.extraction_id})
  }));
  assert.equal(again.status,404);
});

test("Cloud deletion rejects other creators, malformed IDs and unauthenticated callers",async()=>{
  const {handler,call,stored}=mockBackend();
  const form=new FormData();
  form.append("file",new File([new Uint8Array([255,216,7])],"file.jpg",{type:"image/jpeg"}));
  form.append("document_type","invoice");
  const extracted=await handler(call("/api/vision/extract","POST",{body:form}));
  const id=(await extracted.json()).extraction_id;
  stored.get(id).created_by="99999999-9999-4999-8999-999999999999";
  const request=record_id=>call("/api/vision/delete","POST",{
    headers:{...authHeaders,"Content-Type":"application/json"},
    body:JSON.stringify({record_id})
  });
  const notOwner=await handler(request(id));
  assert.equal(notOwner.status,404);
  assert.equal(stored.has(id),true);
  const malformed=await handler(request("../../records"));
  assert.equal(malformed.status,400);
  assert.equal(stored.has(id),true);
  const untrusted=await handler(call("/api/vision/delete","POST",{
    headers:{"Content-Type":"application/json","X-Billy-Organization":ORG,"apikey":"public"},
    body:JSON.stringify({record_id:id})
  }));
  assert.equal(untrusted.status,401);
  assert.equal(stored.has(id),true);
  const wrongMethod=await handler(call("/api/vision/delete","GET"));
  assert.equal(wrongMethod.status,405);
  assert.equal(stored.has(id),true);
});
