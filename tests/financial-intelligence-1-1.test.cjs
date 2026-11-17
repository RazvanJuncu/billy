const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const source=read("supabase/functions/billy-vision/index.ts");
const ramp=read("site/ramp-review.js");
const review=read("site/vision-review.js");
const site=read("site/index.html");
const schema={};
const start=source.indexOf("const BASE_INVOICE_FIELDS =");
const end=source.indexOf("const CLASSIFIER_SCHEMA =",start);
assert.ok(start>=0&&end>start);
vm.runInNewContext(source.slice(start,end)+
  "\nthis.invoiceSchemaFor=invoiceSchemaFor;this.INVOICE_FIELDS=INVOICE_FIELDS;",schema);
const helpers={};
const begin=source.indexOf("// Financial Intelligence 1.1:");
const stop=source.indexOf("function cleanDoc(value,type)",begin);
assert.ok(begin>0&&stop>begin);
vm.runInNewContext(source.slice(begin,stop)+
  "\nthis.evidence=cardEvidenceStatus;",helpers);
const paymentStart=source.indexOf("function cardPaymentMethod(");
const paymentEnd=source.indexOf("function financialProfile(",paymentStart);
vm.runInNewContext(source.slice(paymentStart,paymentEnd)+
  "\nthis.paid=printedCardPayment;this.eligible=eligibleCardLast4;this.method=cardPaymentMethod;",helpers);
const clear=text=>[{field_path:"card_last4",page:1,visual_clarity:"clear",transcription:text}];
const seen=code=>({reviewed_data:{card_last4:code},review_metadata:{
  card_intelligence:{version:"1.1",last4_status:"ai_source_evidence"}}});
test("Every expense or receipt profile requests card fields without duplicated schema keys",()=>{
 for(const profile of ["handling_invoice","fuel_invoice","taxi_receipt","catering_bill",
  "hotel_bill","city_tax_receipt","crew_expense_receipt","other_expense",
  "generic_invoice","generic_receipt","payment_slip","supplier_statement"]){
  const json=schema.invoiceSchemaFor(profile);
  const keys=Object.keys(json.properties).filter(x=>x!=="lines"&&x!=="notes"&&
    !["regions","document_language","english_translations","entity_check_fields"].includes(x));
  for(const field of ["payment_method","card_last4","card_brand","transaction_reference","transaction_status"]){
    assert.ok(keys.includes(field),profile+" missing "+field);
    assert.equal(json.required.filter(x=>x===field).length,1,profile+" duplicate "+field);
  }
  assert.equal(new Set(json.required).size,json.required.length,profile+" duplicate required keys");
 }
});
test("Matching visual mask or card label permits 4 trailing digits, ambiguity does not",()=>{
 const data={card_last4:"2212"};
 assert.equal(helpers.evidence(data,clear("VISA •••• 2212")),"ai_source_evidence");
 assert.equal(helpers.evidence(data,clear("Card: 2212")),"ai_source_evidence");
 assert.equal(helpers.evidence(data,clear("Terminal 2212")),"needs_operator_review");
 assert.equal(helpers.evidence(data,clear("CARD 1234 + 2212")),"needs_operator_review");
 assert.equal(helpers.evidence(data,[{field_path:"card_last4",visual_clarity:"ambiguous",transcription:"VISA **** 2212"}]),"needs_operator_review");
 assert.equal(helpers.evidence({card_last4:"1234567890122212"},clear("VISA **** 2212")),"not_available");
 assert.equal(helpers.evidence(data,[],true),"operator_confirmed");
 assert.equal(helpers.evidence(data,[]),"needs_operator_review");
});
test("Card payment requires explicit printed method and transaction outcome together",()=>{
 assert.equal(helpers.paid({payment_method:"visa",transaction_status:"PAID"}),true);
 assert.equal(helpers.paid({payment_method:"Mastercard",transaction_status:"Approved"}),true);
 assert.equal(helpers.paid({payment_method:"card",transaction_status:"Completed"}),true);
 assert.equal(helpers.paid({payment_method:"VISA",card_last4:"2212"}),false);
 assert.equal(helpers.paid({payment_method:"bank transfer",transaction_status:"Paid"}),false);
 assert.equal(helpers.paid({payment_method:"card",transaction_status:"declined"}),false);
 assert.equal(helpers.paid({card_last4:"2212",transaction_status:"Paid"}),false);
 assert.equal(helpers.eligible(seen("2212")),"2212");
 const pending=seen("2212");pending.review_metadata.card_intelligence.last4_status="needs_operator_review";
 assert.equal(helpers.eligible(pending),null);
});
test("Extraction and approval persist only the card evidence status, preserving original OCR",()=>{
 assert.match(source,/card_intelligence:\{version:"1\.1",last4_status:cardEvidenceStatus\(fields,regions\)\}/);
 assert.match(source,/card_intelligence:\{version:"1\.1",last4_status:cardEvidenceStatus\(/);
 assert.match(source,/operatorVerified\.has\("card_last4"\)/);
 assert.match(source,/const rawLast4=eligibleCardLast4/);
 assert.match(source,/const bill_card_evidence=printedCardPayment\(doc\)/);
 assert.match(source,/const bill_card_last4=eligibleCardLast4\(rec\)/);
 assert.match(source,/if\(!printedCardPayment\(doc\)\)continue/);
 assert.match(source,/only the PRIMARY document/i);
 assert.match(source,/For every extracted card_last4 include a region/);
 assert.match(source,/Never transcribe full card PANs/);
});
test("Operator review exposes optional payment fields for invoices without adding required yellow blanks",()=>{
 assert.match(ramp,/card_last4:"Card ending"/);
 assert.match(ramp,/transaction_status:"Payment status"/);
 assert.match(ramp,/const highRisk=new Set\(\[[^\]]*"card_last4"/);
 assert.match(ramp,/if\(substantive\(doc\[key\]\)\|\|needed\.includes\(key\)\)items\.push\(key\)/);
 assert.match(review,/const paymentEvidenceFields=\[/);
 assert.match(review,/selected\.fields\.some\(\(\[existing\]\)=>existing===key\)/);
 assert.match(site,/ramp-review\.js/);
});
