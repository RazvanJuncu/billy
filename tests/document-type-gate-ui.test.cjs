const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const html=read("site/index.html");
const flow=read("site/simple.js");
const app=read("site/app.js");
const backend=read("supabase/functions/billy-vision/index.ts");
const review=read("site/vision-review.js");
const ramp=read("site/ramp-review.js");

test("Auto-Detect starts by default and has an accessible manual correction screen",()=>{
  assert.match(html,/<option value="auto" selected>Auto-detect<\/option>/);
  assert.match(html,/id="simpleManualProfile"/);
  assert.match(html,/id="simpleManualCategory"/);
  assert.match(html,/id="simpleUseManualProfile"/);
  assert.match(html,/id="simpleReviewChangeProfile"/);
  assert.doesNotMatch(html,/What kind of document is this\?/);
  assert.match(app,/\["auto","invoice","fuel_release"\]\.includes/);
  assert.match(app,/form\.append\("profile_override"/);
  assert.match(app,/billy:classification-needs-review/);
  assert.match(backend,/CLASSIFIER_SCHEMA/);
  assert.match(backend,/invoiceSchemaFor\(profile\)/);
  for(const label of ["fuel","handling","taxi","city_tax","catering","hotel",
    "pax_gifts","parking","crew_expenses","aircraft_supplies","other"]){
    assert.match(backend,new RegExp('"'+label+'"'));
  }
  for(const profile of ["fuel_release","fuel_invoice","handling_invoice","taxi_receipt"]){
    assert.match(backend,new RegExp(profile));
    assert.match(html,new RegExp('value="'+profile+'"'));
  }
  assert.match(review,/invoiceProfiles/);
  assert.match(ramp,/requiredByProfile/);
});
function bootFlow(onlineInitially=true){
  const elements=new Map(),events=new Map();
  const element=id=>{
    if(elements.has(id))return elements.get(id);
    const handlers=new Map(),attrs=new Map();
    const node={
      id,hidden:false,disabled:false,value:"",textContent:"",dataset:{},
      classList:{toggle:()=>false,add:()=>{},remove:()=>{}},
      addEventListener(type,fn){handlers.set(type,fn);},
      dispatchEvent(e){handlers.get(e.type)?.(e);return true;},
      setAttribute(name,value){attrs.set(name,value);},
      getAttribute(name){return attrs.get(name);},
      click(){handlers.get("click")?.({preventDefault(){}})},
      querySelector(){return null;},
      append(){},replaceChildren(){},
    };
    elements.set(id,node);return node;
  };
  const body={dataset:{},classList:{toggle:()=>false,add:()=>{},remove:()=>{}}};
  const document={
    body,documentElement:{dataset:{}},getElementById:element,querySelectorAll:()=>[]
  };
  let scans=0,online=onlineInitially;
  element("scanButton").click=()=>{scans++;};
  const sandbox={
    window:{
      BillyApp:{isOnline:()=>online,isBusy:()=>false,visionStatus:()=>({online})},
      BillyAccounts:{active:()=>false},
      addEventListener(type,fn){events.set(type,fn)}
    },document,Event,console,Math
  };
  vm.runInNewContext(flow,sandbox,{filename:"simple.js"});
  return {element,sandbox,getScans:()=>scans,setOnline:value=>{online=value;},
    emit:(type,detail)=>events.get(type)?.({detail})};
}
test("Every new file automatically starts classification without choosing a document type",()=>{
  const h=bootFlow();
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"home");
  h.emit("billy:document-loaded",{file:{name:"fuel.jpg"}});
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"process");
  assert.equal(h.element("documentType").value,"auto");
  assert.equal(h.element("simpleSelectedType").textContent,"Auto-detect");
  assert.equal(h.getScans(),1);
  h.emit("billy:ocr-ready",{classification:{profile:"fuel_invoice",expense_category:"fuel"}});
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"review");
  assert.equal(h.sandbox.window.BillySimple.getState().classification.profile,"fuel_invoice");
});
test("Ambiguous classification pauses for manual profile/category and then extracts",()=>{
  const h=bootFlow();
  h.emit("billy:document-loaded",{file:{name:"receipt.jpg"}});
  h.emit("billy:classification-needs-review",{
    classification:{profile:"generic_receipt",expense_category:"unknown"},
    reason:"Classification uncertain."
  });
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"type");
  assert.equal(h.element("simpleTypeReason").textContent,"Classification uncertain.");
  h.element("simpleManualProfile").value="taxi_receipt";
  h.element("simpleManualCategory").value="taxi";
  h.element("simpleUseManualProfile").click();
  assert.equal(h.element("documentType").value,"invoice");
  assert.equal(h.element("documentType").dataset.profileOverride,"taxi_receipt");
  assert.equal(h.element("documentType").dataset.categoryOverride,"taxi");
  assert.equal(h.getScans(),2);
  h.emit("billy:ocr-ready",{classification:{profile:"taxi_receipt",expense_category:"taxi"}});
  h.element("simpleReviewChangeProfile").click();
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"type");
  h.element("simpleManualProfile").value="fuel_release";
  h.element("simpleManualCategory").value="other";
  h.element("simpleUseManualProfile").click();
  assert.equal(h.element("documentType").dataset.categoryOverride,"fuel");
  assert.equal(h.element("documentType").value,"fuel_release");
  assert.equal(h.getScans(),3);
});
test("Offline file starts only when authenticated engine connects; leaving process cancels",()=>{
  const h=bootFlow(false);
  h.emit("billy:document-loaded",{file:{name:"flight.jpg"}});
  assert.equal(h.getScans(),0);
  h.setOnline(true);
  h.emit("billy:engine-updated");
  assert.equal(h.getScans(),1);
  h.emit("billy:engine-updated");
  assert.equal(h.getScans(),1);
  const cancelled=bootFlow(false);
  cancelled.emit("billy:document-loaded",{file:{name:"flight.jpg"}});
  cancelled.element("simpleBack").click();
  cancelled.setOnline(true);
  cancelled.emit("billy:engine-updated");
  assert.equal(cancelled.getScans(),0);
});

test("All 11 JetRead expense categories have consistent specialized extraction profiles",()=>{
  const block=backend.slice(backend.indexOf("const BASE_INVOICE_FIELDS"),
    backend.indexOf("const FUEL_SCHEMA"));
  const metadata=vm.runInNewContext(block+`\n({
    categories:CATEGORIES,profiles:PROFILE_FIELDS,profileNames:PROFILE_NAMES,
    forced:FORCED_CATEGORY,instructions:PROFILE_INSTRUCTIONS,invoiceSchemaFor
  })`);
  const expected={
    fuel:["fuel_invoice","fuel_release"],handling:["handling_invoice"],taxi:["taxi_receipt"],
    city_tax:["city_tax_receipt"],catering:["catering_bill"],hotel:["hotel_bill"],
    pax_gifts:["pax_gifts_receipt"],parking:["parking_receipt"],
    crew_expenses:["crew_expense_receipt"],aircraft_supplies:["aircraft_supplies_invoice"],
    other:["other_expense"]
  };
  for(const [category,profiles] of Object.entries(expected)){
    assert.ok(metadata.categories.includes(category),category+" category is missing");
    for(const profile of profiles){
      assert.ok(metadata.profileNames.includes(profile),profile+" absent from classifier schema");
      assert.equal(metadata.forced[profile],category,profile+" wrong category");
      assert.ok(metadata.instructions[profile]?.length>30,profile+" lacks extraction instructions");
      assert.match(html,new RegExp('value="'+profile+'"'),profile+" missing from manual fallback");
      assert.match(flow,new RegExp('"'+profile+'"'),profile+" missing in UI controller");
      if(profile!=="fuel_release"){
        assert.ok(metadata.profiles[profile]?.length>=3,profile+" lacks specialist fields");
        const schema=metadata.invoiceSchemaFor(profile);
        for(const field of metadata.profiles[profile]){
          assert.ok(schema.required.includes(field),profile+" schema lost "+field);
          assert.match(review,new RegExp('"'+field+'"'),profile+" review has no "+field);
          assert.match(ramp,new RegExp(field+':'),profile+" compact review has no "+field);
        }
      }
    }
  }
  assert.ok(metadata.categories.includes("unknown"),"Unknown should remain available");
  assert.match(backend,/NON_EXPENSE_PROFILES/);
});

test("Manual category follows a selected specialized profile but remains editable for generic documents",()=>{
  const h=bootFlow();
  h.emit("billy:document-loaded",{file:{name:"hotel.jpg"}});
  h.emit("billy:classification-needs-review",{classification:{
    status:"ambiguous",profile:"hotel_bill",expense_category:"hotel"
  }});
  assert.equal(h.element("simpleManualProfile").value,"hotel_bill");
  assert.equal(h.element("simpleManualCategory").value,"hotel");
  assert.equal(h.element("simpleManualCategory").disabled,true);
  h.element("simpleManualProfile").value="parking_receipt";
  h.element("simpleManualProfile").dispatchEvent({type:"change"});
  assert.equal(h.element("simpleManualCategory").value,"parking");
  h.element("simpleUseManualProfile").click();
  assert.equal(h.element("documentType").dataset.profileOverride,"parking_receipt");
  assert.equal(h.element("documentType").dataset.categoryOverride,"parking");

  h.emit("billy:classification-needs-review",{classification:{
    status:"ambiguous",profile:"generic_invoice",expense_category:"unknown"
  }});
  assert.equal(h.element("simpleManualCategory").disabled,false);
  h.element("simpleManualCategory").value="crew_expenses";
  h.element("simpleUseManualProfile").click();
  assert.equal(h.element("documentType").dataset.profileOverride,"generic_invoice");
  assert.equal(h.element("documentType").dataset.categoryOverride,"crew_expenses");
});
