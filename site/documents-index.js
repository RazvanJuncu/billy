/* Billy Uploaded Documents 2.0: virtual views over existing records. No extra copies or AI calls. */
(() => {
  "use strict";
  const categories={fuel:"Fuel",handling:"Handling",taxi:"Taxi",city_tax:"City Tax",catering:"Catering",hotel:"Hotel",pax_gifts:"Pax Gifts",parking:"Parking",crew_expenses:"Crew Expenses",aircraft_supplies:"Aircraft Supplies",other:"Other"};

  // Small inline stroke icons; no emoji, images, third-party dependencies or user HTML.
  // All definitions use the same 24x24 outline and inherit their parent's text color.
  const servicePaths={
    Fuel:['path:M4 21V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15','path:M4 21h14','path:M7 8h6v5H7z','path:M16 9h2l2 3v7a2 2 0 0 0 4 0v-5','path:M20 12l-2-3','path:M6 17h8'],
    Handling:['path:M3 16h16l2-3','path:M5 16V9h12v7','path:M7 9V6h8v3','circle:7 19 1.5','circle:17 19 1.5'],
    Taxi:['path:M5 17H3v-6l2-5h14l2 5v6h-2','path:M5 17h14','path:M3 11h18','circle:7 15 1','circle:17 15 1','path:M6 6l1-3h10l1 3'],
    Catering:['path:M3 19h18','path:M5 17a7 7 0 0 1 14 0','path:M12 10V8','circle:12 7 1'],
    Hotel:['path:M3 21V4h18v17','path:M7 8h3v3H7z','path:M14 8h3v3h-3z','path:M10 21v-6h4v6','path:M1 21h22'],
    'City Tax':['path:M3 21h18','path:M5 21V7l7-4 7 4v14','path:M9 10h1m4 0h1M9 14h1m4 0h1','path:M10 21v-4h4v4'],
    Parking:['path:M5 3h14v18H5z','path:M10 17V7h3a3 3 0 0 1 0 6h-3'],
    'Crew Expenses':['circle:12 8 3','path:M5 21v-2a7 7 0 0 1 14 0v2','path:M4 3h16'],
    'Aircraft Supplies':['path:M3 7l9-4 9 4v10l-9 4-9-4z','path:M3 7l9 4 9-4M12 11v10'],
    'Pax Gifts':['path:M3 10h18v11H3z','path:M2 7h20v3H2z','path:M12 7v14','path:M12 7c-8 0-8-6-4-6 2 0 4 3 4 6z','path:M12 7c8 0 8-6 4-6-2 0-4 3-4 6z'],
    Other:['circle:5 12 1','circle:12 12 1','circle:19 12 1'],
    Receipt:['path:M5 3h14v18l-3-2-4 2-4-2-3 2z','path:M8 8h8','path:M8 12h6','path:M8 16h4'],
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
    const overrides=m.organization_overrides||{};
    const aircraft=registration(text(overrides.aircraft)||value(norm,"aircraft_registration")||value(d,"aircraft_registration"));
    const category=(text(overrides.service)||text(classification.expense_category)).toLowerCase();
    const profile=text(classification.profile);
    const airport=text(overrides.airport)||value(norm,"airport_icao")||value(d,"airport_icao","airport");
    const readVendor=value(d,"supplier_name","property_name","operator_name");
    const vendor=text(overrides.vendor)||
      (record.organization_missing_fields?.includes("vendor")?"":readVendor);
    const service=categories[category]||(!category&&profile==="fuel_release"?"Fuel":"Unassigned");
    const title=profile?profile.replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase()):(record.document_type==="fuel_release"?"Fuel Release":"Invoice");
    const date=Date.parse(record.created_at||"");
    const amount=value(norm,"grand_total")||value(d,"grand_total");
    const currency=value(norm,"currency")||value(d,"currency");
    const search=[value(d,"invoice_number","release_number","flight_number"),value(d,"supplier_tax_id","booking_reference"),value(d,"service_date","issue_date","delivery_date"),readVendor].join(" ");
    return {aircraft:aircraft||"Unassigned",service,airport:airport.toUpperCase()||"Unassigned",vendor:vendor||"Unassigned",title,date:Number.isFinite(date)?date:0,amount:amount?(amount+" "+currency).trim():"",status:record.state==="approved"?"Approved":"Incomplete",search};
  };
  function tag(node,record){
    node.dataset.docEntry="1";node.__billyDocument=info(record);
    const button=node.matches("button")?node:node.querySelector(".simple-document-item");
    node.__billyRecord=record;
    node.__billyRecordId=record.id||null;
    node.__billyParentId=record.parent_document_id||null;
    if(button)button.prepend(serviceIcon(node.__billyParentId?"Receipt":node.__billyDocument.service));
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
  // Build family units before applying any category filter or search: a child
  // must never be reclassified as a standalone airport/vendor/expense record.
  function groupFamilies(entries){
    const byId=new Map(entries.filter(node=>node.__billyRecordId)
      .map(node=>[node.__billyRecordId,node]));
    const families=new Map();
    const seenIds=new Set();
    for(const node of entries){
      // A refresh can briefly contain stale and freshly fetched DOM nodes for
      // the same record. Prefer the latest node and never render an ID twice.
      const recordId=node.__billyRecordId;
      if(recordId&&(seenIds.has(recordId)||byId.get(recordId)!==node))continue;
      if(recordId)seenIds.add(recordId);
      const parentId=node.__billyParentId;
      const parent=parentId?byId.get(parentId):null;
      const root=parent||node;
      const id=root.__billyRecordId||root;
      if(!families.has(id))families.set(id,{root,children:[],missingParent:false});
      if(parent)families.get(id).children.push(node);
      else if(parentId)families.get(id).missingParent=true;
    }
    return [...families.values()];
  }
  function decorateDuplicate(card,root){
    const record=root.__billyRecord;
    if(!record?.is_duplicate||!record.duplicate_of||record.parent_document_id)return card;
    const wrap=el("div","billy-duplicate-wrap");
    wrap.dataset.duplicateOf=record.duplicate_of;
    const badge=el("span","billy-duplicate-hint");
    badge.setAttribute("aria-label","Duplicate document");
    badge.title="Duplicate! Open this document to view the original.";
    const piggy=document.createElement("img");
    piggy.className="billy-duplicate-piggy";
    piggy.src="./piggybank-mark.svg";
    piggy.width=34;piggy.height=34;piggy.alt="";
    piggy.setAttribute("aria-hidden","true");
    const speech=el("span","billy-duplicate-speech","Duplicate!");
    badge.append(piggy,speech);
    wrap.append(card,badge);
    return wrap;
  }
  function familyCard(family){
    const {root,children,missingParent}=family;
    if(!children.length&&!missingParent)return decorateDuplicate(root,root);
    const shell=el("section","billy-doc-family");
    shell.setAttribute("aria-label","Document with attached records");
    if(children.length){
      const parentRow=el("div","billy-doc-family-parent");
      parentRow.append(root);shell.append(parentRow);
    }else{
      // Avoid asserting a child is independent if its referenced parent is
      // unavailable (e.g. permissions or an old incomplete archive record).
      const note=el("div","billy-doc-family-missing","Parent document unavailable");
      shell.append(note);
    }
    const nested=el("div","billy-doc-family-children");
    for(const child of children.length?children:[root]){
      const line=el("div","billy-doc-family-child");
      const connector=el("span","billy-doc-nested-connector");
      connector.setAttribute("aria-hidden","true");
      line.append(connector,child);
      nested.append(line);
    }
    shell.append(nested);
    return decorateDuplicate(shell,root);
  }
  function refresh(){
    const list=state.list;if(!list||!list.isConnected)return;
    const tabs=state.host.querySelectorAll("[data-mode]");
    tabs.forEach(t=>t.setAttribute("aria-pressed",String(t.dataset.mode===state.mode)));
    const sort=state.host.querySelector(".billy-doc-sort");sort.textContent=state.descending?"↓":"↑";sort.title=state.descending?"Newest first":"Oldest first";
    const families=groupFamilies(state.records);
    if(state.mode==="Attention"){
      list.replaceChildren();
      window.BillyDocumentsHub?.render(state,navigate);
      return;
    }
    const needle=state.query.toLocaleLowerCase();
    const filtered=families.filter(family=>{
      const nodes=[family.root,...family.children];
      if(!needle)return true;
      return nodes.some(node=>{
        const d=node.__billyDocument;if(!d)return false;
        return [d.title,d.aircraft,d.service,d.airport,d.vendor,d.amount,d.status,d.search].join(" ").toLocaleLowerCase().includes(needle);
      });
    }).sort((a,b)=>state.descending?
      b.root.__billyDocument.date-a.root.__billyDocument.date:
      a.root.__billyDocument.date-b.root.__billyDocument.date);
    const knownAircraft=new Set(window.BillyDocumentsHub?.fleet?.map(a=>a.registration)||[]);
    const matching=state.mode==="Aircraft"&&state.aircraft
      ?filtered.filter(family=>{
        const aircraft=family.root.__billyDocument.aircraft;
        return state.aircraft==="Unassigned"?!knownAircraft.has(aircraft):aircraft===state.aircraft;
      }):filtered;
    const groupKey=state.mode==="Aircraft"&&state.aircraft?"service":
      {Services:"service",Airports:"airport",Vendors:"vendor"}[state.mode];
    const fragment=document.createDocumentFragment();
    if(groupKey){
      const groups=new Map();
      matching.forEach(family=>{
        // Category is defined by the parent, never by its payment evidence.
        const key=family.root.__billyDocument[groupKey]||"Unassigned";
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(family);
      });
      [...groups.keys()].sort((a,b)=>a==="Unassigned"?1:b==="Unassigned"?-1:a.localeCompare(b)).forEach(key=>{
        const section=el("section","billy-doc-group");
        const groupId=groupKey+":"+key,expanded=state.opened.has(groupId);
        const header=el("button","billy-doc-group-title");header.type="button";header.setAttribute("aria-expanded",String(expanded));
        const name=el("span","",key),count=el("span","billy-doc-count",String(groups.get(key).length)),chevron=el("span","billy-doc-chevron","›");
        if(state.mode==="Services"||state.mode==="Aircraft")header.append(serviceIcon(key));
        header.append(name,count,chevron);
        const content=el("div","billy-doc-group-content");content.hidden=!expanded;
        groups.get(key).forEach(family=>content.append(familyCard(family)));
        header.addEventListener("click",()=>{
          const open=content.hidden;content.hidden=!open;
          if(open)state.opened.add(groupId);else state.opened.delete(groupId);
          header.setAttribute("aria-expanded",String(open));
        });
        section.append(header,content);fragment.append(section);
      });
    }else matching.forEach(family=>fragment.append(familyCard(family)));
    const empty=el("p","billy-doc-no-results",state.query?"No matches.":"No documents in this view.");
    empty.hidden=matching.length>0;fragment.append(empty);
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
    state.mode=["Home","Attention",...modes].includes(mode)?mode:"Home";
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
    // Do not repopulate a newly cleared archive with DOM nodes from its last
    // visit while the fresh cloud request is still in flight.
    state.records=[];
    state.navigation=null;
    // Opening the archive always starts at the hub, not the last drill-down.
    install(list);
    navigate("Home");
  }
  function refreshOrganization(id,overrides){
    for(const row of state.records){
      if(row.__billyRecordId!==id||!row.__billyRecord)continue;
      const r=row.__billyRecord;
      r.review_metadata={...(r.review_metadata||{}),organization_overrides:overrides};
      if(overrides.vendor&&Array.isArray(r.organization_missing_fields))
        r.organization_missing_fields=r.organization_missing_fields.filter(x=>x!=="vendor");
      row.__billyDocument=info(r);
    }
    refresh();
  }
  // Update already-rendered archive rows after an alias has been confirmed;
  // backend resolves all historical and future records on the next page load.
  function rememberVendorAlias(source,canonical,vendorId){
    const key=raw=>text(raw).normalize("NFKC").trim().replace(/\s+/gu," ").toLocaleUpperCase("ro-RO");
    if(!key(source)||!text(canonical))return;
    for(const row of state.records){
      const record=row.__billyRecord;
      if(!record||record.review_metadata?.organization_overrides?.vendor)continue;
      const doc=record.reviewed_data||record.extracted_data||{};
      const read=value(doc,"supplier_name","property_name","operator_name");
      if(key(read)!==key(source))continue;
      record.review_metadata={...(record.review_metadata||{}),organization_overrides:{
        ...(record.review_metadata?.organization_overrides||{}),
        vendor:canonical,...(vendorId?{vendor_id:vendorId}:{})
      }};
      if(Array.isArray(record.organization_missing_fields))
        record.organization_missing_fields=record.organization_missing_fields.filter(x=>x!=="vendor");
      row.__billyDocument=info(record);
    }
    refresh();
  }
  window.BillyDocumentsIndex={tag,session,label,end,info,registration,navigate,back,start,
    groupFamilies,refresh,refreshOrganization,rememberVendorAlias};
})();
