const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const edge=fs.readFileSync(path.join(__dirname,"..","supabase/functions/billy-vision/index.ts"),"utf8");
function normalizer(){
  const a=edge.indexOf("// Billy Normalization Engine 1.0");
  const b=edge.indexOf("function validate(doc,type",a);
  assert.ok(a>0&&b>a,"Normalization engine block exists");
  const sandbox={};
  vm.runInNewContext(edge.slice(a,b)+"\nthis.convert=normalizeDocument;this.number=canonicalNumber;this.currency=canonicalCurrency;this.date=canonicalDate;this.unit=canonicalUnit;this.register=canonicalRegistration;",sandbox);
  return sandbox;
}
const parsed=n=>normalizer().number(n);
test("Amounts: European, US, spacing and ambiguous thousand separators",()=>{
  assert.equal(parsed("1.234,56").value,1234.56);
  assert.equal(parsed("1,234.56").value,1234.56);
  assert.equal(parsed("1 500,00").value,1500);
  assert.equal(parsed("CHF 714.91").value,714.91);
  assert.equal(parsed("0,800").value,0.8);
  assert.equal(parsed("-1.234,56").value,-1234.56);
  assert.equal(parsed("1.234.567").value,1234567);
  assert.equal(parsed("1,500").status,"ambiguous");
  assert.equal(parsed("1.500").status,"ambiguous");
  assert.equal(parsed("12,34,56").status,"invalid");
  assert.equal(parsed("12abc34").status,"invalid");
});
test("Handling tariffs retain EUR/tonne and EUR/hour without false invalid-number warnings",()=>{
  const c=normalizer();
  const source={currency:"EUR",lines:[
    {description:"Deicing",quantity:"8t",unit_price:"3,00€/t",net_amount:"24,00€"},
    {description:"Ground power",quantity:"2 h",unit_price:"50,00€/h",net_amount:"100,00€"},
    {description:"Service",quantity:"3 tonnes",unit_price:"1,60 EUR/t",net_amount:"4,80€"}
  ]};
  const data=c.convert(source,"invoice","handling_invoice");
  assert.equal(data.fields["lines[0].quantity"].value,8);
  assert.equal(data.fields["lines[0].quantity"].unit,"t");
  assert.equal(data.fields["lines[0].unit_price"].value,3);
  assert.equal(data.fields["lines[0].unit_price"].unit,"per t");
  assert.equal(data.fields["lines[0].unit_price"].currency,"EUR");
  assert.equal(data.fields["lines[1].quantity"].value,2);
  assert.equal(data.fields["lines[1].quantity"].unit,"h");
  assert.equal(data.fields["lines[1].unit_price"].value,50);
  assert.equal(data.fields["lines[1].unit_price"].unit,"per h");
  assert.equal(data.fields["lines[2].unit_price"].value,1.6);
  assert.equal(data.line_items[0].values.quantity_unit,"t");
  assert.equal(data.line_items[0].values.unit_price.per_unit,"t");
  assert.equal(data.line_items[1].values.quantity_unit,"h");
  assert.equal(data.line_items[1].values.unit_price.per_unit,"h");
  assert.ok(!data.issues.some(item=>item.code==="invalid"||
    item.message==="Number contains unsupported characters."),JSON.stringify(data.issues));
  assert.equal(data.fields["lines[0].unit_price"].raw,"3,00€/t");
});
test("Unsupported dimensions are not stripped; incompatible units flag a mismatch",()=>{
  const c=normalizer();
  const invalid=c.convert({currency:"EUR",lines:[
    {description:"Unsupported unit",quantity:"8mystery",unit_price:"3,00€/widget"},
    {description:"Mismatched",quantity:"8t",unit_price:"3,00€/h"}
  ]},"invoice","handling_invoice");
  assert.equal(invalid.fields["lines[0].quantity"].status,"invalid");
  assert.equal(invalid.fields["lines[0].unit_price"].status,"invalid");
  assert.ok(invalid.issues.some(i=>i.code==="unit_mismatch"&&i.field_path==="lines[1].unit_price"));
  assert.equal(c.convert({currency:"EUR",lines:[{quantity:"8t",unit_price:"3,00USD/t"}]},
    "invoice","handling_invoice").issues.some(i=>i.code==="currency_mismatch"),true);
});
test("Romanian POS receipt month labels normalize unambiguously",()=>{
  const c=normalizer();
  const cases={
    "09 NOI 26":"2026-11-09",
    "09 noi 2026":"2026-11-09",
    "09.NOV.26":"2026-11-09",
    "09 NOI. 26":"2026-11-09",
    "01 IAN 26":"2026-01-01",
    "12 FEB 26":"2026-02-12",
    "03 MAR 26":"2026-03-03",
    "04 APR 26":"2026-04-04",
    "05 MAI 26":"2026-05-05",
    "06 IUN 26":"2026-06-06",
    "07 IUL 26":"2026-07-07",
    "08 AUG 26":"2026-08-08",
    "09 SEP 26":"2026-09-09",
    "10 OCT 26":"2026-10-10",
    "11 DEC 26":"2026-12-11",
    "09 NOV 2026":"2026-11-09"
  };
  for(const [input,expected] of Object.entries(cases)){
    assert.equal(c.date(input).value,expected,input);
    const normalized=c.convert({issue_date:input},"receipt","generic_invoice");
    assert.equal(normalized.values.issue_date,expected,input);
    assert.equal(normalized.issues.some(item=>item.field_path==="issue_date"),false,input);
  }
  assert.equal(c.date("31 NOI 26").status,"invalid");
  assert.equal(c.date("09 XYZ 26").status,"ambiguous");
  assert.equal(c.date("09 NOI 99").status,"ambiguous");
  assert.equal(c.date("09 NOI 26 12:30").status,"ambiguous");
});
test("Romanian registrations use YR-XXX; foreign registrations are not transformed into Romanian",()=>{
  const c=normalizer();
  for(const text of ["YRWNT","YR WNT","yr-wnt","YR—WNT"])
    assert.equal(c.register(text).value,"YR-WNT",text);
  assert.equal(c.register("YR-NKA").value,"YR-NKA");
  assert.equal(c.register("N722BD").value,"N722BD");
  assert.equal(c.register("D-ABCD").value,"D-ABCD");
  assert.equal(c.register("YRABCD").status,"ambiguous");
  assert.equal(c.register("WNT").value,null,"do not guess the country prefix");
});
test("Currencies are ISO and dates are unambiguous calendar dates",()=>{
  const c=normalizer();
  assert.equal(c.currency("lei").value,"RON");
  assert.equal(c.currency("eur").value,"EUR");
  assert.equal(c.currency("CHF").value,"CHF");
  assert.equal(c.currency("$").status,"ambiguous");
  assert.equal(c.date("10.11.2026").value,"2026-11-10");
  assert.equal(c.date("2026-11-10").value,"2026-11-10");
  assert.equal(c.date("10-Nov-2026").value,"2026-11-10");
  assert.equal(c.date("11/10/2026").status,"ambiguous");
  // Date-only documents do not need a timezone. A day above 12 also
  // disambiguates DD/MM/YY from US MM/DD/YY.
  assert.equal(c.date("20/10/26").value,"2026-10-20");
  assert.equal(c.date("20.10.26").value,"2026-10-20");
  assert.equal(c.date("10.11.26").value,"2026-11-10");
  assert.equal(c.date("10/11/26").status,"ambiguous");
  assert.equal(c.date("10/20/26").status,"ambiguous");
  assert.equal(c.date("29/02/25").status,"invalid");
  assert.equal(c.date("20/10/99").status,"ambiguous");
  const normalized=c.convert({issue_date:"20/10/26"},"invoice","generic_invoice");
  assert.equal(normalized.values.issue_date,"2026-10-20");
  assert.equal(normalized.fields.issue_date.status,"normalized");
  assert.ok(!normalized.issues.some(issue=>issue.field_path==="issue_date"));

  assert.equal(c.date("29.02.2025").status,"invalid");
});
test("Normalization preserves raw evidence and creates typed inventory values",()=>{
  const c=normalizer();
  const original={supplier_name:"CAT Air Service AG",aircraft_registration:"YRWNT",
    airport_icao:"lszh",currency:"CHF",grand_total:"714,91",
    issue_date:"10.11.2026",lines:[{description:"Travel fare",quantity:"2",
      unit_price:"100,00",net_amount:"200,00",vat_rate:"8,1%",vat_amount:"16,20"}]};
  const saved=JSON.stringify(original);
  const norm=c.convert(original,"invoice","handling_invoice");
  assert.equal(JSON.stringify(original),saved,"must never mutate source strings");
  assert.equal(norm.values.aircraft_registration,"YR-WNT");
  assert.equal(norm.values.airport_icao,"LSZH");
  assert.equal(norm.values.currency,"CHF");
  assert.equal(norm.values.grand_total,714.91);
  assert.equal(norm.values.issue_date,"2026-11-10");
  assert.equal(norm.amounts.grand_total.currency,"CHF");
  assert.equal(norm.line_items[0].values.unit_price.value,100);
  assert.equal(norm.line_items[0].values.vat_rate,8.1);
  assert.equal(norm.fields.grand_total.raw,"714,91");
  assert.equal(norm.status,"ready");
});
test("Fuel quantities convert with explicit units, but mass requires density",()=>{
  const c=normalizer();
  assert.equal(c.unit("litres").value,"L");
  assert.equal(c.unit("gal").status,"ambiguous");
  const fuel={aircraft_registration:"yr-wnt",delivered_quantity:"1500",
    quantity_unit:"Litres",delivery_date:"2026-11-10",fuel_density:"0,800 kg/L"};
  const normalized=c.convert(fuel,"fuel_release","fuel_release");
  assert.equal(normalized.fuel.litres,1500);
  assert.equal(normalized.fuel.kilograms,1200);
  assert.equal(normalized.fuel.metric_tonnes,1.2);
  const noDensity=c.convert({...fuel,fuel_density:"0,800"},"fuel_release","fuel_release");
  assert.equal(noDensity.fuel.litres,1500);
  assert.equal(noDensity.fuel.kilograms,null);
  assert.ok(noDensity.issues.some(i=>i.field_path==="fuel_density"));
  const gallons=c.convert({fuel_quantity:"100",fuel_unit:"US gal"},"invoice","fuel_invoice");
  assert.equal(gallons.fuel.litres,378.541178);
  assert.equal(gallons.fuel.kilograms,null);
  const ambiguous=c.convert({fuel_quantity:"1,500",fuel_unit:"L"},"invoice","fuel_invoice");
  assert.equal(ambiguous.fuel.quantity,null);
  assert.ok(ambiguous.issues.some(i=>i.field_path==="fuel_quantity"));
});
test("Inline units, conflicting units, VAT rates, and currency disagreement remain auditable",()=>{
  const c=normalizer();
  assert.equal(c.unit("litri").value,"L");
  const inline=c.convert({fuel_quantity:"1500L"},"invoice","fuel_invoice");
  assert.equal(inline.fuel.litres,1500);
  assert.equal(inline.fields.fuel_quantity.raw,"1500L");
  const mismatch=c.convert({fuel_quantity:"100 kg",fuel_unit:"L"},"invoice","fuel_invoice");
  assert.equal(mismatch.fuel.unit,null);
  assert.equal(mismatch.fuel.litres,null);
  assert.ok(mismatch.issues.some(issue=>issue.code==="unit_mismatch"));
  const taxes=c.convert({tax_rate:"3 CHF/night",currency:"CHF",grand_total:"12.00",
    lines:[{vat_rate:"8,1%",vat_amount:"1,20"}]},"invoice","city_tax_receipt");
  assert.equal(taxes.values.tax_rate,3);
  assert.equal(taxes.values.tax_rate_unit,"CHF/night");
  assert.equal(taxes.line_items[0].values.vat_rate,8.1);
  const contradiction=c.convert({grand_total:"CHF 100.00",currency:"EUR"},"invoice","generic_invoice");
  assert.ok(contradiction.issues.some(i=>i.code==="currency_mismatch"));
  const noUnit=c.convert({tax_rate:"3",currency:"CHF"},"invoice","city_tax_receipt");
  assert.ok(noUnit.issues.some(i=>i.code==="rate_unit_missing"));
});

test("Normalization is recalculated after approval and stored as metadata, not OCR overwrite",()=>{
  assert.match(edge,/const normalized=normalizeDocument\(fields,type,profile\)/);
  assert.match(edge,/normalization:\{version:NORMALIZATION_VERSION,extracted:normalized\}/);
  assert.match(edge,/const approvedNormalized=normalizeDocument\(checked,data.document_type/);
  assert.match(edge,/approved:approvedNormalized/);
  assert.match(edge,/normalized_data:approvedNormalized/);
  assert.match(edge,/reviewed_data:checked/);
  assert.match(edge,/extracted_data:fields/);
});
