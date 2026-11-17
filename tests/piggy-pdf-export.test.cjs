const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const source=read("site/piggy-pdf-export.js");
const context={window:{},Intl,Number,Date,Set};
vm.runInNewContext(source,context,{filename:"piggy-pdf-export.js"});
const doc=context.window.PiggyPDFExport.buildDocument;
const flatten=x=>{
  if(x===null||x===undefined)return "";
  if(Array.isArray(x))return x.map(flatten).join(" ");
  if(typeof x==="object")return Object.entries(x).filter(([k])=>k!=="canvas").map(([,v])=>flatten(v)).join(" ");
  return String(x);
};
const legacy={
  understood:true,language:"ro",
  filter:{aircraft_registration:"YR-WNT",flight_number:"MYJ832"},
  coverage:{matched_records:3,priced_records:2},
  groups:[
    {currency:"EUR",total_minor:27893,documents:1,
      categories:[{name:"handling",total_minor:27893}],vendors:[]},
    {currency:"USD",total_minor:12900,documents:1,
      categories:[{name:"fuel",total_minor:12900}],vendors:[]}
  ],
  documents:[{id:"private-record",vendor:"Handler A",reference:"INV-01",
    airport:"LSZH",amount_minor:27893,currency:"EUR"}],
  notes:["Skylegs is not connected."]
};
test("PDF keeps original currency totals, references and evidence caveats",()=>{
  const result=doc(legacy,"Costul zborului?",new Date("2026-11-17T12:00:00Z"));
  const text=flatten(result.content);
  assert.equal(result.pageSize,"A4");
  assert.match(text,/278,93/);
  assert.match(text,/129,00/);
  assert.match(text,/EUR/);
  assert.match(text,/USD/);
  assert.match(text,/INV-01/);
  assert.match(text,/Skylegs is not connected/);
  assert.match(text,/Costul zborului/);
  assert.doesNotMatch(text,/407,93/);
  assert.doesNotMatch(text,/private-record/,"No internal record IDs");
});
test("Analytics PDF preserves verified filters, chart data, sources and partial flag",()=>{
  const report={understood:true,analytics:true,language:"en",
    plan:{kind:"card_spending",start_date:"2026-11-10",end_date:"2026-11-17",
      aircraft:"YR-DSR",card_currency:"EUR",card_last4:"1234",metric:"money",group_by:"day"},
    visualization:"line",coverage:{partial:true,matching_documents:9},
    groups:[{currency:"EUR",total_minor:25000,count:2,
      timeline:[{date:"2026-11-10",total_minor:10000,count:1},
        {date:"2026-11-17",total_minor:15000,count:1}]}],
    documents:[{vendor:"Vendor A",date:"2026-11-17",amount_minor:15000,currency:"EUR"}],
    notes:["Source coverage is partial."]};
  const definition=doc(report,"Card spending by day");
  const text=flatten(definition.content);
  assert.match(text,/Card spending/);
  assert.match(text,/YR-DSR/);
  assert.match(text,/1234/);
  assert.match(text,/250\.00/);
  assert.match(text,/100\.00/);
  assert.match(text,/150\.00/);
  assert.match(text,/Partial total/);
  assert.match(text,/source list is a preview/i);
  assert.match(text,/Source coverage is partial/);
  assert.ok(definition.content.some(v=>Array.isArray(v.canvas)),
    "Timeline must export a real vector chart");
});
test("Blocked queries export limitations, never invented amounts",()=>{
  const report={understood:true,analytics:true,blocked:true,language:"en",
    plan:{aircraft:"YR-WHO"},notes:["Skylegs integration is required."],groups:[]};
  const text=flatten(doc(report,"Show unsupported flight costs").content);
  assert.match(text,/Insufficient verified data/);
  assert.match(text,/Skylegs integration is required/);
  assert.doesNotMatch(text,/Documented total/);
});
test("Download entrypoint is client-side, version-pinned, and uses a PDF blob",()=>{
  assert.match(source,/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfmake\/0\.2\.23/);
  assert.match(source,/getBlob\(resolve\)/);
  assert.match(source,/URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(source,/fetch\(|innerHTML|localStorage|sessionStorage/);
  assert.match(read("site/sw.js"),/"\.\/piggy-pdf-export\.js"/);
});

test("Async loader supports pdfmake 0.2 internal VFS registration and downloads PDF",async()=>{
  const calls=[],downloads=[],window={};
  const document={
    head:{appendChild(el){
      calls.push(el.src);
      if(el.src.includes("/pdfmake.min.js"))
        window.pdfMake={
          addVirtualFileSystem:()=>{},
          createPdf:definition=>{
            assert.match(flatten(definition.content),/Card spending/);
            return {getBlob:cb=>cb({type:"application/pdf"})};
          }
        };
      // Deliberately no window.pdfMake.vfs property in version 0.2.
      el.onload();
    }},
    createElement(tag){
      return tag==="script"?{remove(){}}:{
        href:"",download:"",hidden:false,click(){downloads.push(this.download);},
        remove(){}
      };
    },
    body:{appendChild(){}}
  };
  const scope={
    document,window,Intl,Number,Date,Set,
    URL:{createObjectURL:blob=>{assert.equal(blob.type,"application/pdf");return "blob:mock";},
      revokeObjectURL:()=>{}},
    setTimeout:()=>1,clearTimeout:()=>{}
  };
  vm.runInNewContext(source,scope);
  const result={understood:true,analytics:true,language:"en",
    plan:{kind:"card_spending",group_by:"vendor"},groups:[],notes:[]};
  const downloaded=await window.PiggyPDFExport.download(result,"Card spending");
  assert.match(downloaded,/^Billy-Piggybank-Report-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(downloads.length,1);
  assert.equal(calls.length,2,"Only core and virtual fonts should load");
  await window.PiggyPDFExport.download(result,"Card spending");
  assert.equal(calls.length,2,"Reusing the loaded engine");
});
