/* Billy Financial Reports 1.0 — approved, canonical, non-converted expenses. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const make=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  };
  const amount=(minor,currency)=>{
    if(!Number.isSafeInteger(minor)||!currency)return "—";
    return new Intl.NumberFormat("en-GB",{
      style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2
    }).format(minor/100);
  };
  const quantity=(value,digits=2)=>
    new Intl.NumberFormat("en-GB",{maximumFractionDigits:digits}).format(value);
  const dims={
    aircraft:{label:"Aircraft",field:"aircraft",empty:"Unassigned aircraft"},
    airport:{label:"Airport",field:"airport",empty:"Unassigned airport"},
    vendor:{label:"Vendor",field:"vendor",empty:"Unassigned vendor"},
    category:{label:"Category",field:"category",empty:"Uncategorized"},
    month:{label:"Month",field:"month",empty:"Undated"},
    sender:{label:"Sender",field:"sender",empty:"Sender not identified"}
  };
  let selection="vendor",category="",start="",end="",data=null,expanded=new Set();
  function namedGroup(item,dimension){
    if(dimension==="month")return typeof item.date==="string"&&
      /^\d{4}-\d{2}-\d{2}$/.test(item.date)?item.date.slice(0,7):dims.month.empty;
    const value=item[dims[dimension].field];
    return typeof value==="string"&&value.trim()?value.trim():dims[dimension].empty;
  }
  function selectedExpenses(payload=data){
    const rows=Array.isArray(payload?.ledger)?payload.ledger:[];
    return rows.filter(item=>{
      if(category&&item.category!==category)return false;
      // A date filter NEVER silently pulls undated expenses into the period.
      if(start&&(!item.date||item.date<start))return false;
      if(end&&(!item.date||item.date>end))return false;
      return true;
    });
  }
  function aggregate(rows,dimension=selection){
    if(!Object.hasOwn(dims,dimension))throw Error("Unknown report dimension");
    const map=new Map();
    for(const item of rows){
      const key=namedGroup(item,dimension);
      if(!map.has(key))map.set(key,{name:key,count:0,priced:0,undated:0,
        amounts:new Map(),litres:0,tonnes:0,litre_count:0,tonne_count:0,items:[]});
      const group=map.get(key);
      group.count++;if(!item.date)group.undated++;
      group.items.push(item);
      if(Number.isSafeInteger(item.amount_minor)&&item.currency){
        group.priced++;
        group.amounts.set(item.currency,
          (group.amounts.get(item.currency)||0)+item.amount_minor);
      }
      if(typeof item.fuel_litres==="number"&&Number.isFinite(item.fuel_litres)&&
         item.fuel_litres>=0){
        group.litres+=item.fuel_litres;group.litre_count++;
      }
      if(typeof item.fuel_tonnes==="number"&&Number.isFinite(item.fuel_tonnes)&&
         item.fuel_tonnes>=0){
        group.tonnes+=item.fuel_tonnes;group.tonne_count++;
      }
    }
    return [...map.values()].sort((a,b)=>b.count-a.count||
      a.name.localeCompare(b.name));
  }
  async function openOriginal(id,btn){
    if(!id||!window.BillyAccounts?.active?.())return;
    btn.disabled=true;
    try{
      const api=window.BILLY_AUTH_CONFIG?.apiUrl;
      if(!api)throw Error("Source unavailable");
      const headers=await window.BillyAccounts.sessionHeaders();
      const res=await fetch(api+"/api/vision/assistant-source?record_id="+
        encodeURIComponent(id),{headers,cache:"no-store"});
      if(!res.ok)throw Error("Could not open document");
      const payload=await res.json();
      if(payload.record)window.BillyDocumentPreview?.open?.(payload.record);
    }catch(err){btn.title=err.message||"Source unavailable";}
    finally{btn.disabled=false;}
  }
  const totalsText=group=>[...group.amounts.entries()]
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([currency,minor])=>amount(minor,currency)).join(" · ")||"—";
  function showGroup(group,host){
    const detail=make("div","billy-reports-expansion");
    const rows=[...group.items].sort((a,b)=>String(b.date||"").localeCompare(
      String(a.date||""))||String(a.id).localeCompare(String(b.id)));
    for(const item of rows.slice(0,100)){
      const btn=make("button","billy-reports-source");
      btn.type="button";
      const label=make("span","billy-reports-source-copy");
      label.append(make("strong","",item.vendor||"Unassigned"),
        make("small","",[
          item.date||"Undated",
          item.aircraft||"",
          item.profile?.replaceAll("_"," ")||""
        ].filter(Boolean).join(" · ")));
      btn.append(label,make("strong","",
        Number.isSafeInteger(item.amount_minor)?
          amount(item.amount_minor,item.currency):"Amount unverified"));
      btn.addEventListener("click",()=>void openOriginal(item.id,btn));
      detail.append(btn);
    }
    if(rows.length>100)detail.append(make("p","billy-reports-note",
      "Showing 100 source documents from this group. Refine filters to narrow the report."));
    host.append(detail);
  }
  function render(payload=data){
    data=payload;
    const table=$("billyFinancialReportRows");
    if(!table)return;
    const catSelect=$("billyFinancialReportCategory");
    const current=category;
    const all=Array.isArray(data?.ledger)?data.ledger:[];
    const values=[...new Set(all.map(item=>item.category).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b));
    catSelect.replaceChildren();
    const any=make("option","","All categories");any.value="";catSelect.append(any);
    for(const val of values){const opt=make("option","",val.replaceAll("_"," "));opt.value=val;catSelect.append(opt);}
    catSelect.value=values.includes(current)?current:"";
    category=catSelect.value;
    table.replaceChildren();
    const rows=selectedExpenses(data);
    const grouped=aggregate(rows);
    const currencyTotal=grouped.reduce((n,g)=>n+g.amounts.size,0);
    const missingDate=rows.filter(x=>!x.date).length;
    $("billyFinancialReportSummary").textContent=data?
      rows.length+" approved expenses · "+grouped.length+" groups"+
        (missingDate?" · "+missingDate+" undated":"")+
        (data.partial?" · Partial archive":""):
      "Loading approved expenses";
    const exportBtn=$("billyFinancialReportExport");
    exportBtn.disabled=!rows.length||Boolean(data?.partial);
    exportBtn.title=data?.partial?"Export disabled: financial archive is incomplete":"Export the filtered approved expense rows";
    if(!grouped.length){
      table.append(make("p","billy-financial-empty",
        data?"No approved expenses match these report filters":"Financial report unavailable"));
    }
    for(const group of grouped){
      const region=make("div","billy-reports-group");
      const bar=make("button","billy-reports-row");
      bar.type="button";bar.setAttribute("aria-expanded",String(expanded.has(group.name)));
      const title=make("span","billy-reports-entity");
      title.append(make("span","billy-reports-chevron",expanded.has(group.name)?"⌄":"›"),
        make("strong","",group.name));
      bar.append(title,
        make("span","billy-reports-num",quantity(group.count,0)),
        make("span","billy-reports-num",group.litre_count?quantity(group.litres):"—"),
        make("span","billy-reports-num",group.tonne_count?quantity(group.tonnes,3):"—"),
        make("span","billy-reports-money",totalsText(group)));
      bar.addEventListener("click",()=>{
        if(expanded.has(group.name))expanded.delete(group.name);
        else expanded.add(group.name);
        render();
      });
      region.append(bar);
      if(expanded.has(group.name))showGroup(group,region);
      table.append(region);
    }
    const notice=$("billyFinancialReportFootnote");
    notice.hidden=!data?.partial;
    notice.textContent=data?.partial?
      "Partial archive · CSV export unavailable":"";
  }
  function csvCell(value){
    const s=String(value??"");
    // Prevent formulas from executing when the CSV is opened in Excel.
    const safe=/^[\s]*[=+\-@\t\r]/.test(s)?"'"+s:s;
    return '"'+safe.replaceAll('"','""')+'"';
  }
  function csv(){
    if(data?.partial)return null;
    const rows=selectedExpenses(data);
    if(!rows.length)return null;
    const columns=["group","document_id","vendor","aircraft","airport","category",
      "sender","document_date","profile","amount","currency","fuel_litres","fuel_tonnes"];
    const output=[columns.map(csvCell).join(",")];
    for(const row of rows){
      const values=[namedGroup(row,selection),row.id,row.vendor,row.aircraft,row.airport,
        row.category,row.sender,row.date,row.profile,
        Number.isSafeInteger(row.amount_minor)?(row.amount_minor/100).toFixed(2):"",
        row.currency,
        typeof row.fuel_litres==="number"?row.fuel_litres:"",
        typeof row.fuel_tonnes==="number"?row.fuel_tonnes:""];
      output.push(values.map(csvCell).join(","));
    }
    return "\uFEFF"+output.join("\r\n")+"\r\n";
  }
  function exportCsv(){
    const content=csv();if(!content)return;
    const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=make("a","");
    link.href=url;link.download="billy-report-"+selection+"-"+new Date().toISOString().slice(0,10)+".csv";
    document.body.append(link);link.click();link.remove();
    URL.revokeObjectURL(url);
  }
  for(const [id,dimension] of [
    ["billyFinancialReportAircraft","aircraft"],
    ["billyFinancialReportAirport","airport"],
    ["billyFinancialReportVendor","vendor"],
    ["billyFinancialReportCategoryGroup","category"],
    ["billyFinancialReportMonth","month"],
    ["billyFinancialReportSender","sender"]
  ]){
    $(id)?.addEventListener("click",()=>{
      selection=dimension;expanded.clear();
      for(const [key,dim] of Object.entries(dims)){
        const target=$("billyFinancialReport"+{
          aircraft:"Aircraft",airport:"Airport",vendor:"Vendor",
          category:"CategoryGroup",month:"Month",sender:"Sender"
        }[key]);
        if(target)target.setAttribute("aria-pressed",String(key===selection));
      }
      render();
    });
  }
  $("billyFinancialReportCategory")?.addEventListener("change",e=>{
    category=e.target.value;expanded.clear();render();
  });
  $("billyFinancialReportStart")?.addEventListener("change",e=>{
    start=e.target.value;expanded.clear();render();
  });
  $("billyFinancialReportEnd")?.addEventListener("change",e=>{
    end=e.target.value;expanded.clear();render();
  });
  $("billyFinancialReportExport")?.addEventListener("click",exportCsv);
  window.BillyFinancialReports={render,aggregate,selectedExpenses,csv};
})();