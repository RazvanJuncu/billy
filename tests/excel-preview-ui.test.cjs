const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("site/index.html");
const simple=read("site/simple.js");
const review=read("site/vision-review.js");
const preview=read("site/excel-preview.js");
const css=read("site/excel-preview.css");
const sw=read("site/sw.js");

test("Excel Preview and CSV are built from approved document-and-entry sections",()=>{
  assert.match(html,/id="simpleExcelPreview"[^>]*hidden/);
  assert.match(html,/excel-preview\.js\?v=/);
  assert.match(html,/excel-preview\.css\?v=/);
  assert.ok(html.indexOf("vision-review.js")<html.indexOf("excel-preview.js"));
  assert.ok(html.indexOf("excel-preview.js")<html.indexOf("simple.js"));
  assert.match(review,/function getApprovedSpreadsheetData\(\)/);
  assert.match(review,/if\(!approved\|\|!draft\)return null/);
  assert.match(review,/return \{documentType,details,entries\}/);
  assert.match(review,/const sheet=getApprovedSpreadsheetData\(\)/);
  assert.match(review,/sheet\.details\.map\(field=>\[field\.label,field\.value\]\)/);
  assert.match(review,/sheet\.entries\.rows/);
  assert.match(review,/getApprovedSpreadsheetData,displayRegistration\};/);
  assert.match(simple,/exportable\?window\.BillyReview\?\.getApprovedSpreadsheetData\?\.\(\):null/);
  assert.match(simple,/window\.BillyExcelPreview\?\.render\(\$\("simpleExcelPreview"\),sheet\)/);
  assert.match(html,/Upload to company Excel/);
  assert.match(html,/Not connected/);
  assert.match(sw,/"\.\/excel-preview\.js"/);
  assert.match(sw,/"\.\/excel-preview\.css"/);
  assert.match(sw,/excel-preview\\\.js\|excel-preview\\\.css/);
  assert.doesNotMatch(preview,/fetch\(|XMLHttpRequest|innerHTML|insertAdjacentHTML/);
  assert.match(css,/overflow:auto/);
});

function node(tag){
  const el={
    tagName:tag.toUpperCase(),className:"",textContent:"",children:[],
    hidden:false,attrs:{},title:"",
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=[...children];},
    setAttribute(name,value){this.attrs[name]=value;},
  };
  el.classList={add(cls){el.className+=" "+cls;}};
  return el;
}
function boot(){
  const window={};
  const document={createElement:tag=>node(tag)};
  vm.runInNewContext(preview,{window,document,console});
  return window.BillyExcelPreview;
}
function tableRows(section){
  const table=section.children[1].children[0];
  return {header:table.children[1].children[0].children.map(c=>c.textContent),
    rows:table.children[2].children.map(row=>row.children.map(c=>c.textContent))};
}
test("Fuel Release preview displays header values ONCE and seven separate handwriting entries",()=>{
  const ui=boot(),root=node("section");
  const sheet={
    documentType:"fuel_release",
    details:[
      {key:"release_number",label:"Release #",value:"M 04569"},
      {key:"supplier_name",label:"Fuel supplier",value:"TUCSON AIRPORT AUTHORITY"},
      {key:"airport",label:"Airport",value:"MUNICIPAL AIRPORT"},
      {key:"aircraft_registration",label:"Registration",value:"1719P"}
    ],
    entries:{
      title:"Handwritten entries",
      columns:[
        {key:"label",label:"Original field label"},
        {key:"transcription",label:"Raw handwriting"}
      ],
      rows:Array.from({length:7},(_,index)=>["Meter "+(index+1),String(71050+index)])
    }
  };
  ui.render(root,sheet);
  assert.equal(root.hidden,false);
  assert.equal(root.children.length,3); // Heading + two distinct tables.
  assert.equal(root.children[0].children[0].textContent,"Excel Preview");
  assert.equal(root.children[1].children[0].children[0].textContent,"Document details");
  assert.equal(root.children[2].children[0].children[0].textContent,"Handwritten entries");
  assert.equal(root.children[2].children[0].children[1].textContent,"7 entries");
  const documentRows=tableRows(root.children[1]);
  const details=JSON.stringify(documentRows.rows);
  assert.equal((details.match(/M 04569/g)||[]).length,1);
  assert.equal((details.match(/1719P/g)||[]).length,1);
  assert.equal(documentRows.rows.length,4);
  assert.deepEqual(documentRows.header,["Field","Value"]);
  const lines=tableRows(root.children[2]);
  assert.deepEqual(lines.header,["Original field label","Raw handwriting"]);
  assert.equal(lines.rows.length,7);
  assert.deepEqual(lines.rows[0],["Meter 1","71050"]);
  assert.deepEqual(lines.rows[6],["Meter 7","71056"]);
  assert.ok(!JSON.stringify(lines.rows).includes("TUCSON AIRPORT AUTHORITY"));
  assert.equal(root.children[2].children[1].attrs.role,"region");
  ui.render(root,null);
  assert.equal(root.hidden,true);
  assert.equal(root.children.length,0);
});

function makeApprovedReport({draft,type,fieldKeys,lineKeys,normalizedData=null}){
  const start=review.indexOf("function escapeCell(value)");
  const end=review.indexOf("function auditChanges()");
  assert.ok(start>=0&&end>start);
  const captured={};
  const context={
    approved:true,draft,documentType:type,fieldKeys,lineKeys,
    approvalResult:normalizedData?{normalized_data:normalizedData}:null,
    download(text,name,mime){captured.text=text;captured.name=name;captured.mime=mime;}
  };
  vm.runInNewContext(review.slice(start,end)+"\nvar report=getApprovedSpreadsheetData();exportCSV();",context);
  return {report:JSON.parse(JSON.stringify(context.report)),csv:captured.text,name:captured.name};
}
test("Actual CSV and preview report do not repeat document metadata per handwriting row",()=>{
  const entries=Array.from({length:7},(_,i)=>({
    label:"HANDWRITTEN "+(i+1),transcription:String(1700+i)
  }));
  const {report,csv,name}=makeApprovedReport({
    draft:{
      release_number:"M 04569",supplier_name:"TUCSON AIRPORT AUTHORITY",
      airport:"MUNICIPAL AIRPORT",aircraft_registration:"1719P",
      handwritten_entries:entries,notes:["Confirmed delivery"]
    },
    type:"fuel_release",
    fieldKeys:[
      ["release_number","Release #"],["supplier_name","Fuel supplier"],
      ["airport","Airport"],["aircraft_registration","Registration"]
    ],
    lineKeys:[["label","Original field label"],["transcription","Raw handwriting"]]
  });
  assert.equal(report.details.length,5);
  assert.equal(report.entries.rows.length,7);
  assert.equal(report.entries.title,"Handwritten entries");
  assert.equal(name,"billy-approved.csv");
  assert.equal((csv.match(/M 04569/g)||[]).length,1);
  assert.equal((csv.match(/TUCSON AIRPORT AUTHORITY/g)||[]).length,1);
  assert.equal((csv.match(/1719P/g)||[]).length,1);
  assert.match(csv,/"Document details"\r\n"Field","Value"/);
  assert.match(csv,/"Handwritten entries"\r\n"Original field label","Raw handwriting"/);
  assert.match(csv,/"HANDWRITTEN 7","1706"/);
  assert.match(csv,/"Note 1","Confirmed delivery"/);
  const ui=boot(),root=node("section");
  ui.render(root,report);
  assert.equal(tableRows(root.children[1]).rows.length,5);
  assert.equal(tableRows(root.children[2]).rows.length,7);
});


test("Romanian registrations are standardized in Excel Preview/CSV without changing source OCR",()=>{
  for(const raw of ["YRWNT","yr wnt","YR—WNT","YR-WNT"]){
    const document={aircraft_registration:raw,flight_number:"MYJ712",handwritten_entries:[],notes:[]};
    const {report,csv}=makeApprovedReport({
      draft:document,type:"fuel_release",
      fieldKeys:[["flight_number","Flight"],["aircraft_registration","Registration"]],
      lineKeys:[["label","Label"]]
    });
    assert.equal(report.details.find(x=>x.key==="aircraft_registration")?.value,"YR-WNT");
    assert.match(csv,/"Registration","YR-WNT"/);
    assert.equal(document.aircraft_registration,raw,"original value must not be rewritten");
  }
  for(const raw of ["N722BD","D-ABCD","WNT","YRABCD"]){
    const {report}=makeApprovedReport({
      draft:{aircraft_registration:raw,handwritten_entries:[],notes:[]},type:"fuel_release",
      fieldKeys:[["aircraft_registration","Registration"]],lineKeys:[["label","Label"]]
    });
    assert.equal(report.details[0].value,raw,"don't invent an aircraft registration prefix");
  }
  const {report}=makeApprovedReport({
    draft:{aircraft_registration:"YRWNT",handwritten_entries:[],notes:[]},
    type:"fuel_release",fieldKeys:[["aircraft_registration","Registration"]],lineKeys:[],
    normalizedData:{values:{aircraft_registration:"YR-WNT"}}
  });
  assert.equal(report.details[0].value,"YR-WNT");
});

test("Invoice report has one summary and item rows without duplicated supplier or amount",()=>{
  const {report,csv}=makeApprovedReport({
    draft:{
      invoice_number:"F-22",supplier_name:"Supplier Ltd",grand_total:"120.00",
      lines:[
        {description:"Pump",quantity:"1",net_amount:"100"},
        {description:"Filter",quantity:"2",net_amount:"20"}
      ],notes:[]
    },
    type:"invoice",
    fieldKeys:[["invoice_number","Invoice #"],["supplier_name","Supplier"],["grand_total","Grand total"]],
    lineKeys:[["description","Description"],["quantity","Quantity"],["net_amount","Net"]]
  });
  assert.equal(report.details.length,3);
  assert.equal(report.entries.title,"Invoice line items");
  assert.deepEqual(report.entries.rows,[["Pump","1","100"],["Filter","2","20"]]);
  assert.equal((csv.match(/Supplier Ltd/g)||[]).length,1);
  assert.equal((csv.match(/120\.00/g)||[]).length,1);
  assert.match(csv,/"Invoice line items"/);
});

test("A document with no extracted lines does not invent a blank line item",()=>{
  const {report}=makeApprovedReport({
    draft:{invoice_number:"INV-0",lines:[],notes:[]},
    type:"invoice",
    fieldKeys:[["invoice_number","Invoice #"]],lineKeys:[["description","Description"]]
  });
  assert.equal(report.entries.rows.length,0);
  const ui=boot(),root=node("section");
  ui.render(root,report);
  assert.equal(root.children.length,2); // No fake extra table.
});

test("Preview renders untrusted document values as literal text, never executable HTML",()=>{
  const ui=boot(),root=node("section");
  const payload='<img src=x onerror=alert(1)>';
  ui.render(root,{details:[{key:"notes[0]",label:"Note",value:payload}],
    entries:{title:"Handwritten entries",columns:[{key:"transcription",label:"Raw handwriting"}],rows:[[payload]]}
  });
  assert.equal(tableRows(root.children[1]).rows[0][1],payload);
  assert.equal(tableRows(root.children[2]).rows[0][0],payload);
  assert.doesNotMatch(preview,/innerHTML|insertAdjacentHTML/);
});

test("Approved screen exports verified content without historical OCR memory",()=>{
  assert.match(html,/id="simpleExcelPreview"/);
  assert.doesNotMatch(html,/id="simpleInspectLearning"|id="simpleLearningAudit"/);
  assert.doesNotMatch(review,/getLearningAudit|intelligence_opt_in|handwriting\/examples/);
  assert.doesNotMatch(simple,/renderLearningAudit|getLearningAudit/);
  assert.match(simple,/window\.BillyExcelPreview/);
});
