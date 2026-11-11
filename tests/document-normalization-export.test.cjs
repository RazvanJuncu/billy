const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const review=fs.readFileSync(path.join(__dirname,"..","site/vision-review.js"),"utf8");
const ramp=fs.readFileSync(path.join(__dirname,"..","site/ramp-review.js"),"utf8");
test("Approved spreadsheet and CSV use canonical typed fields, not unreadable regional formats",()=>{
  const start=review.indexOf("function escapeCell(value)");
  const end=review.indexOf("function auditChanges()");
  assert.ok(start>=0&&end>start);
  const captured={};
  const ctx={
    approved:true,documentType:"invoice",
    draft:{aircraft_registration:"YRWNT",currency:"fr.",grand_total:"1.234,56",
      lines:[{description:"Handling fee",quantity:"2",unit_price:"150,00",net_amount:"300,00"}],notes:[]},
    approvalResult:{normalized_data:{
      values:{aircraft_registration:"YR-WNT",currency:"CHF",grand_total:1234.56},
      line_items:[{values:{quantity:2,unit_price:{value:150,currency:"CHF"},net_amount:{value:300,currency:"CHF"}}}],
      issues:[],status:"ready"
    }},
    classification:null,
    fieldKeys:[["aircraft_registration","Registration"],["currency","Currency"],["grand_total","Grand total"]],
    lineKeys:[["description","Description"],["quantity","Quantity"],["unit_price","Unit price"],["net_amount","Net"]],
    download(text,name){captured.text=text;captured.name=name;}
  };
  vm.runInNewContext(review.slice(start,end)+"\nthis.sheet=getApprovedSpreadsheetData();exportCSV();",ctx);
  const sheet=JSON.parse(JSON.stringify(ctx.sheet));
  assert.deepEqual(sheet.details.map(item=>item.value),["YR-WNT","CHF",1234.56]);
  assert.deepEqual(sheet.entries.rows,[["Handling fee",2,150,300]]);
  assert.match(captured.text,/"Registration","YR-WNT"/);
  assert.match(captured.text,/"Grand total","1234.56"/);
  assert.doesNotMatch(captured.text,/1\.234,56/);
  assert.match(review,/normalized_data:approvalResult\?\.normalized_data\|\|null/);
  assert.match(review,/normalized_data:auditMeta\?\.normalized_data\|\|null/);
});
test("Normalization uncertainty appears in the same exception-first review, not as silent correction",()=>{
  assert.match(ramp,/normalizationIssues/);
  assert.match(ramp,/normalization_needs_review/);
  assert.match(ramp,/normalizedHint\.textContent/);
  assert.match(ramp,/Inventory format:/);
  assert.match(ramp,/String\(valueAt\(doc,path\)\?\?""\)\.trim\(\)===canonical\.raw/);
});
