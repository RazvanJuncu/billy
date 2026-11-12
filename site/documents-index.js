/* Billy Uploaded Documents 2.0: virtual views over existing records. No extra copies or AI calls. */
(() => {
  "use strict";
  const categories={fuel:"Fuel",handling:"Handling",taxi:"Taxi",city_tax:"City Tax",catering:"Catering",hotel:"Hotel",pax_gifts:"Pax Gifts",parking:"Parking",crew_expenses:"Crew Expenses",aircraft_supplies:"Aircraft Supplies",other:"Other"};
  const modes=["All","Aircraft","Services","Airports","Vendors"];
  const state={mode:"All",query:"",descending:true,records:[],host:null,list:null,navigation:null};
  const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=content;return n;};
  const text=value=>typeof value==="string"?value.trim():"";
  const value=(data,...paths)=>{for(const p of paths){const v=data?.[p];if(text(v))return text(v);}return "";};
  const registration=raw=>{const s=text(raw).normalize("NFKC").replace(/[‐‑‒–-―]/g,"-").toUpperCase();const match=s.match(/^YR[-\s]?([A-Z0-9]{3})$/);return match?"YR-"+match[1]:s;};
  const info=record=>{
    const d=record.reviewed_data||record.extracted_data||{};
    const m=record.review_metadata||{};
    const classification=m.classification||{};
    const norm=m.normalization?.approved?.values||m.normalization?.extracted?.values||{};
    const aircraft=registration(value(norm,"aircraft_registration")||value(d,"aircraft_registration"));
    const category=text(classification.expense_category).toLowerCase();
    const profile=text(classification.profile);
    const airport=value(norm,"airport_icao")||value(d,"airport_icao","airport");
    const vendor=value(d,"supplier_name","property_name","operator_name");
    const service=categories[category]||(!category&&profile==="fuel_release"?"Fuel":"Unassigned");
    const title=profile?profile.replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase()):(record.document_type==="fuel_release"?"Fuel Release":"Invoice");
    const date=Date.parse(record.created_at||"");
    const amount=value(norm,"grand_total")||value(d,"grand_total");
    const currency=value(norm,"currency")||value(d,"currency");
    const search=[value(d,"invoice_number","release_number","flight_number"),value(d,"supplier_tax_id","booking_reference"),value(d,"service_date","issue_date","delivery_date")].join(" ");
    return {aircraft:aircraft||"Unassigned",service,airport:airport.toUpperCase()||"Unassigned",vendor:vendor||"Unassigned",title,date:Number.isFinite(date)?date:0,amount:amount?(amount+" "+currency).trim():"",status:record.state==="approved"?"Approved":"Incomplete",search};
  };
  function tag(node,record){node.dataset.docEntry="1";node.__billyDocument=info(record);}
  function session(node,item){node.dataset.docEntry="1";node.__billyDocument={aircraft:"Unassigned",service:"Unassigned",airport:"Unassigned",vendor:"Unassigned",title:item.file.name,date:Date.now(),status:"Session",amount:""};}
  function label(record){return info(record).title;}
  function install(list){
    state.list=list;
    if(state.host?.isConnected)return;
    const host=el("div","billy-doc-toolbar");
    const tabs=el("div","billy-doc-tabs");tabs.setAttribute("role","group");tabs.setAttribute("aria-label","Group documents");
    modes.forEach(mode=>{
      const b=el("button","billy-doc-tab",mode);b.type="button";b.dataset.mode=mode;b.setAttribute("aria-pressed",String(mode===state.mode));
      b.addEventListener("click",()=>{state.mode=mode;refresh();});tabs.append(b);
    });
    const tools=el("div","billy-doc-tools");
    const search=el("input","billy-doc-search");search.type="search";search.placeholder="Search documents…";search.setAttribute("aria-label","Search documents");search.value=state.query;
    search.addEventListener("input",()=>{state.query=search.value;refresh();});
    const sort=el("button","billy-doc-sort","↓");sort.type="button";sort.title="Newest first";sort.setAttribute("aria-label","Toggle date sorting");
    sort.addEventListener("click",()=>{state.descending=!state.descending;refresh();});
    tools.append(search,sort);host.append(tabs,tools);list.before(host);state.host=host;
  }
  function refresh(){
    const list=state.list;if(!list||!list.isConnected)return;
    const tabs=state.host.querySelectorAll("[data-mode]");
    tabs.forEach(t=>t.setAttribute("aria-pressed",String(t.dataset.mode===state.mode)));
    const sort=state.host.querySelector(".billy-doc-sort");sort.textContent=state.descending?"↓":"↑";sort.title=state.descending?"Newest first":"Oldest first";
    const entries=state.records;
    const needle=state.query.toLocaleLowerCase();
    const filtered=entries.filter(node=>{
      const d=node.__billyDocument;if(!d)return false;
      return [d.title,d.aircraft,d.service,d.airport,d.vendor,d.amount,d.status,d.search].join(" ").toLocaleLowerCase().includes(needle);
    }).sort((a,b)=>state.descending?b.__billyDocument.date-a.__billyDocument.date:a.__billyDocument.date-b.__billyDocument.date);
    const groupKey={Aircraft:"aircraft",Services:"service",Airports:"airport",Vendors:"vendor"}[state.mode];
    const fragment=document.createDocumentFragment();
    if(groupKey){
      const groups=new Map();
      filtered.forEach(node=>{const key=node.__billyDocument[groupKey]||"Unassigned";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);});
      [...groups.keys()].sort((a,b)=>a==="Unassigned"?1:b==="Unassigned"?-1:a.localeCompare(b)).forEach(key=>{
        const section=el("section","billy-doc-group");
        const header=el("button","billy-doc-group-title");header.type="button";header.setAttribute("aria-expanded","true");
        const name=el("span","",key),count=el("span","billy-doc-count",String(groups.get(key).length)),chevron=el("span","billy-doc-chevron","⌄");
        header.append(name,count,chevron);
        const content=el("div","billy-doc-group-content");groups.get(key).forEach(node=>content.append(node));
        header.addEventListener("click",()=>{content.hidden=!content.hidden;header.setAttribute("aria-expanded",String(!content.hidden));chevron.textContent=content.hidden?"›":"⌄";});
        section.append(header,content);fragment.append(section);
      });
    }else filtered.forEach(node=>fragment.append(node));
    const empty=el("p","billy-doc-no-results",state.query?"No matches.":"No documents in this view.");empty.hidden=filtered.length>0;fragment.append(empty);
    list.replaceChildren(fragment);
    if(state.navigation)list.append(state.navigation);
  }
  function end(list){
    install(list);
    const nav=list.querySelector(".simple-documents-pagination");
    state.navigation=nav||null;
    state.records=[...list.querySelectorAll('[data-doc-entry="1"]')];
    // The archive is paged by the cloud API; search and grouping operate on this page.
    refresh();
  }
  window.BillyDocumentsIndex={tag,session,label,end,info,registration};
})();
