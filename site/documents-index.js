/* Billy Uploaded Documents 2.0: virtual views over existing records. No extra copies or AI calls. */
(() => {
  "use strict";
  const categories={fuel:"Fuel",handling:"Handling",taxi:"Taxi",city_tax:"City Tax",catering:"Catering",hotel:"Hotel",pax_gifts:"Pax Gifts",parking:"Parking",crew_expenses:"Crew Expenses",aircraft_supplies:"Aircraft Supplies",other:"Other"};

  // Small inline stroke icons; no emoji, images, third-party dependencies or user HTML.
  // All definitions use the same 24x24 outline and inherit their parent's text color.
  const servicePaths={
    Fuel:['path:M4 21V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15','path:M4 21h14','path:M7 8h6v5H7z','path:M16 9h2l2 3v7a2 2 0 0 0 4 0v-5','path:M20 12l-2-3','path:M6 17h8'],
    Handling:['path:M17 21v-8l-5-3V2a1 1 0 0 0-2 0v8l-5 3v8l6-2 6 2z','path:M3 13l7-3m4 0 7 3'],
    Taxi:['path:M5 17H3v-6l2-5h14l2 5v6h-2','path:M5 17h14','path:M3 11h18','circle:7 15 1','circle:17 15 1','path:M6 6l1-3h10l1 3'],
    Catering:['path:M3 19h18','path:M5 17a7 7 0 0 1 14 0','path:M12 10V8','circle:12 7 1'],
    Hotel:['path:M3 21V4h18v17','path:M7 8h3v3H7z','path:M14 8h3v3h-3z','path:M10 21v-6h4v6','path:M1 21h22'],
    'City Tax':['path:M3 21h18','path:M5 21V7l7-4 7 4v14','path:M9 10h1m4 0h1M9 14h1m4 0h1','path:M10 21v-4h4v4'],
    Parking:['path:M5 3h14v18H5z','path:M10 17V7h3a3 3 0 0 1 0 6h-3'],
    'Crew Expenses':['circle:12 8 3','path:M5 21v-2a7 7 0 0 1 14 0v2','path:M4 3h16'],
    'Aircraft Supplies':['path:M3 7l9-4 9 4v10l-9 4-9-4z','path:M3 7l9 4 9-4M12 11v10'],
    'Pax Gifts':['path:M3 10h18v11H3z','path:M2 7h20v3H2z','path:M12 7v14','path:M12 7c-8 0-8-6-4-6 2 0 4 3 4 6z','path:M12 7c8 0 8-6 4-6-2 0-4 3-4 6z'],
    Other:['circle:5 12 1','circle:12 12 1','circle:19 12 1'],
    Unassigned:['circle:12 12 9','path:M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.8.7-1.7 1.2-1.7 2.7','path:M12 17h.01']
  };
  function serviceIcon(category){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("width","17");svg.setAttribute("height","17");
    svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","1.75");svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
    svg.classList.add("billy-service-icon");
    for(const entry of servicePaths[category]||servicePaths.Unassigned){
      const [kind,definition]=entry.split(":",2);
      const shape=document.createElementNS("http://www.w3.org/2000/svg",kind==="circle"?"circle":"path");
      if(kind==="circle"){
        const [cx,cy,rad]=definition.split(" ");shape.setAttribute("cx",cx);shape.setAttribute("cy",cy);shape.setAttribute("r",rad);
      }else shape.setAttribute("d",definition);
      svg.append(shape);
    }
    return svg;
  }
  const modes=["All","Aircraft","Services","Airports","Vendors"];
  const state={mode:"Home",aircraft:null,query:"",descending:true,records:[],host:null,list:null,navigation:null,opened:new Set()};
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
  function tag(node,record){
    node.dataset.docEntry="1";node.__billyDocument=info(record);
    const button=node.matches("button")?node:node.querySelector(".simple-document-item");
    if(button)button.prepend(serviceIcon(node.__billyDocument.service));
  }
  function session(node,item){node.dataset.docEntry="1";node.__billyDocument={aircraft:"Unassigned",service:"Unassigned",airport:"Unassigned",vendor:"Unassigned",title:item.file.name,date:Date.now(),status:"Session",amount:""};}
  function label(record){return info(record).title;}
  function install(list){
    state.list=list;
    if(state.host?.isConnected)return;
    const host=el("div","billy-doc-toolbar");
    const intro=document.getElementById("simpleDocumentsIntro");
    const heading=list.parentElement?.querySelector(".simple-heading");
    if(intro&&heading){
      const help=el("button","billy-doc-info","i");
      help.type="button";help.title="About this archive";help.setAttribute("aria-label","About this archive");
      help.setAttribute("aria-expanded","false");
      help.addEventListener("click",()=>{intro.hidden=!intro.hidden;help.setAttribute("aria-expanded",String(!intro.hidden));});
      heading.append(help);intro.hidden=true;intro.classList.add("billy-doc-help");
    }
    const tabs=el("div","billy-doc-tabs");tabs.setAttribute("role","group");tabs.setAttribute("aria-label","Group documents");
    modes.forEach(mode=>{
      const b=el("button","billy-doc-tab",mode);b.type="button";b.dataset.mode=mode;b.setAttribute("aria-pressed",String(mode===state.mode));
      b.addEventListener("click",()=>navigate(mode));tabs.append(b);
    });
    const tools=el("div","billy-doc-tools");
    const search=el("input","billy-doc-search");search.type="search";search.placeholder="Search documents…";search.setAttribute("aria-label","Search documents");search.value=state.query;
    search.addEventListener("input",()=>{state.query=search.value;refresh();});
    const sort=el("button","billy-doc-sort","↓");sort.type="button";sort.title="Newest first";sort.setAttribute("aria-label","Toggle date sorting");
    sort.addEventListener("click",()=>{state.descending=!state.descending;refresh();});
    tools.append(search,sort);host.append(tabs,tools);list.before(host);state.host=host;
    window.BillyDocumentsHub?.mount(list,host);
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
    const knownAircraft=new Set(window.BillyDocumentsHub?.fleet?.map(a=>a.registration)||[]);
    const matching=state.mode==="Aircraft"&&state.aircraft
      ?filtered.filter(node=>state.aircraft==="Unassigned"
        ? !knownAircraft.has(node.__billyDocument.aircraft)
        :node.__billyDocument.aircraft===state.aircraft)
      :filtered;
    const groupKey=state.mode==="Aircraft"&&state.aircraft?"service":
      {Services:"service",Airports:"airport",Vendors:"vendor"}[state.mode];
    const fragment=document.createDocumentFragment();
    if(groupKey){
      const groups=new Map();
      matching.forEach(node=>{const key=node.__billyDocument[groupKey]||"Unassigned";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);});
      [...groups.keys()].sort((a,b)=>a==="Unassigned"?1:b==="Unassigned"?-1:a.localeCompare(b)).forEach(key=>{
        const section=el("section","billy-doc-group");
        const groupId=groupKey+":"+key,expanded=state.opened.has(groupId);
        const header=el("button","billy-doc-group-title");header.type="button";header.setAttribute("aria-expanded",String(expanded));
        const name=el("span","",key),count=el("span","billy-doc-count",String(groups.get(key).length)),chevron=el("span","billy-doc-chevron","›");
        if(state.mode==="Services"||state.mode==="Aircraft")header.append(serviceIcon(key));
        header.append(name,count,chevron);
        const content=el("div","billy-doc-group-content");content.hidden=!expanded;groups.get(key).forEach(node=>content.append(node));
        header.addEventListener("click",()=>{
          const open=content.hidden;content.hidden=!open;
          if(open)state.opened.add(groupId);else state.opened.delete(groupId);
          header.setAttribute("aria-expanded",String(open));
        });
        section.append(header,content);fragment.append(section);
      });
    }else matching.forEach(node=>fragment.append(node));
    const empty=el("p","billy-doc-no-results",state.query?"No matches.":"No documents in this view.");empty.hidden=matching.length>0;fragment.append(empty);
    list.replaceChildren(fragment);
    if(state.navigation)list.append(state.navigation);
    window.BillyDocumentsHub?.render(state,navigate);
  }
  function end(list){
    install(list);
    const nav=list.querySelector(".simple-documents-pagination");
    state.navigation=nav||null;
    state.records=[...list.querySelectorAll('[data-doc-entry="1"]')];
    // The archive is paged by the cloud API; search and grouping operate on this page.
    refresh();
  }
  function navigate(mode,aircraft=null){
    state.mode=["Home",...modes].includes(mode)?mode:"Home";
    state.aircraft=state.mode==="Aircraft"?aircraft:null;
    state.query="";
    state.opened.clear();
    const search=state.host?.querySelector(".billy-doc-search");
    if(search)search.value="";
    refresh();
    const stage=document.getElementById("workspaceStage");
    if(stage)stage.scrollTop=0;
  }
  function back(){
    if(state.mode==="Home")return false;
    if(state.mode==="Aircraft"&&state.aircraft)navigate("Aircraft");
    else navigate("Home");
    return true;
  }
  function start(list){
    // Opening the archive always starts at the hub, not the last drill-down.
    install(list);
    navigate("Home");
  }
  window.BillyDocumentsIndex={tag,session,label,end,info,registration,navigate,back,start};
})();
