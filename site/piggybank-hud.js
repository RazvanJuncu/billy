/* Piggybank Financial HUD.
   Displays verified, already-calculated Billy expenses; never estimates prices,
   converts currencies, or performs AI accounting in the browser. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const hud=$("piggybankHud"),backdrop=$("piggybankHudBackdrop"),
    close=$("piggybankHudClose"),title=$("piggybankHudTitle"),
    content=$("piggybankHudContent");
  if(!hud||!backdrop||!close||!title||!content)return;
  const make=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  };
  function money(minor,currency,language){
    if(!Number.isSafeInteger(minor)||!currency)return "—";
    try{return new Intl.NumberFormat(language==="ro"?"ro-RO":"en-US",{
      style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2
    }).format(minor/100);}
    catch{return (minor/100).toFixed(2)+" "+currency;}
  }
  function section(name,info){
    const el=make("section","piggybank-hud-section");
    const head=make("div","piggybank-hud-section-head");
    head.append(make("h3","",name));
    if(info)head.append(make("span","",info));
    el.append(head);return el;
  }
  function breakdown(name,entries,currency,total,lang){
    const block=make("div","piggybank-hud-breakdown");
    block.append(make("h4","",name));
    for(const item of entries.slice(0,10)){
      const row=make("div","piggybank-hud-breakdown-row");
      const copy=make("div","piggybank-hud-breakdown-copy");
      copy.append(make("span","",item.name||"Unassigned"),
        make("strong","",money(item.total_minor,currency,lang)));
      const track=make("div","piggybank-hud-progress");
      const bar=make("span","");
      const share=total>0?Math.min(100,Math.max(0,item.total_minor/total*100)):0;
      bar.style.width=share.toFixed(2)+"%";
      track.append(bar);row.append(copy,track);block.append(row);
    }
    return block;
  }
  function docRow(item,lang){
    const row=make("div","piggybank-hud-document");
    const info=make("div","piggybank-hud-doc-info");
    const ref=(item.reference?" · "+item.reference:"");
    info.append(make("strong","",(item.vendor||"Unassigned")+ref));
    info.append(make("span","",[item.date,item.airport,item.category,item.flight_number]
      .filter(Boolean).join(" · ")||"Approved document"));
    const amount=make("strong","piggybank-hud-doc-price",
      money(item.amount_minor,item.currency,lang));
    const open=make("button","piggybank-hud-doc-open",
      lang==="ro"?"Deschide":"Open");
    open.type="button";
    open.setAttribute("aria-label",(lang==="ro"?"Deschide documentul ":"Open document ")+
      (item.vendor||"")+" "+(item.reference||""));
    open.addEventListener("click",()=>{
      // Private document preview is layered above the HUD. When it closes,
      // the operator returns to the same financial breakdown and scroll.
      if(window.BillyIntelligenceAssistant?.openSource){
        void window.BillyIntelligenceAssistant.openSource(item.id,open);
      }
    });
    row.append(info,amount,open);return row;
  }
  function render(result,question){
    const lang=result.language==="ro"?"ro":"en";
    const t=(ro,en)=>lang==="ro"?ro:en;
    const f=result.filter||{},c=result.coverage||{};
    title.textContent=t("Cheltuieli","Expenses");
    const kicker=hud.querySelector(".piggybank-hud-kicker");
    if(kicker)kicker.textContent=t("PIGGYBANK / ANALIZĂ FINANCIARĂ",
      "PIGGYBANK / FINANCIAL HUD");
    const body=document.createDocumentFragment();
    body.append(make("p","piggybank-hud-request",question));
    const scope=[
      f.aircraft_registration||null,
      f.flight_number||null,
      f.start_date?(f.start_date===f.end_date?f.start_date:f.start_date+" – "+f.end_date):null,
      f.expense_category||null,f.vendor_name||null
    ].filter(Boolean);
    scope.push(t("Documente aprobate Billy","Approved Billy documents"));
    body.append(make("p","piggybank-hud-scope",scope.join(" · ")));
    const totals=make("div","piggybank-hud-totals");
    const groups=Array.isArray(result.groups)?result.groups:[];
    if(groups.length){
      for(const group of groups){
        const tile=make("div","piggybank-hud-total");
        tile.append(make("span","piggybank-hud-total-label",
          t("Total documentat · "+group.currency,"Documented total · "+group.currency)));
        tile.append(make("strong","piggybank-hud-total-amount",
          money(group.total_minor,group.currency,lang)));
        tile.append(make("span","piggybank-hud-total-meta",
          group.documents+" "+t(group.documents===1?"document":"documente",
            group.documents===1?"document":"documents")));
        totals.append(tile);
      }
    }else{
      const tile=make("div","piggybank-hud-total");
      tile.append(make("span","piggybank-hud-total-label",
        t("Total documentat","Documented total")));
      tile.append(make("strong","piggybank-hud-total-amount","—"));
      tile.append(make("span","piggybank-hud-total-meta",
        t("Nu există sume validate pentru această selecție.",
          "No validated expenses found for these filters.")));
      totals.append(tile);
    }
    body.append(totals);
    const stats=make("div","piggybank-hud-stats");
    const stat=(count,label)=>{
      const el=make("span","");
      el.append(make("strong","",String(count)),document.createTextNode(" "+label));
      stats.append(el);
    };
    stat(c.matched_records||0,t("documente asociate","matched records"));
    stat(c.priced_records||0,t("cu sumă validată","with verified value"));
    if(c.duplicate_records_excluded)
      stat(c.duplicate_records_excluded,t("duplicate excluse","duplicates excluded"));
    body.append(stats);
    if(groups.some(g=>g.categories?.length||g.vendors?.length)){
      const area=section(t("Defalcarea cheltuielilor","Expenses breakdown"));
      for(const group of groups){
        if(groups.length>1)area.append(make("p","piggybank-hud-scope",group.currency));
        const split=make("div","piggybank-hud-splits");
        if(group.categories?.length)split.append(breakdown(t("Categorii","Categories"),
          group.categories,group.currency,group.total_minor,lang));
        if(group.vendors?.length)split.append(breakdown(t("Furnizori","Vendors"),
          group.vendors,group.currency,group.total_minor,lang));
        area.append(split);
      }
      body.append(area);
    }
    const ops=result.operations||{};
    if((ops.airports?.length||0)+(ops.flight_numbers?.length||0)>0){
      const area=section(t("Contextul documentelor","Document context"));
      const chips=make("div","piggybank-hud-chips");
      for(const val of [...(ops.airports||[]),...(ops.flight_numbers||[])].slice(0,12))
        chips.append(make("span","piggybank-hud-chip",val));
      area.append(chips);body.append(area);
    }
    if(Array.isArray(result.documents)&&result.documents.length){
      const area=section(t("Documente justificative","Source documents"),
        result.documents.length+" "+t("disponibile","available"));
      const rows=make("div","piggybank-hud-docs");
      for(const item of result.documents.slice(0,25))rows.append(docRow(item,lang));
      area.append(rows);
      if(c.priced_records>result.documents.length){
        area.append(make("p","piggybank-hud-empty",
          t("Totalul include și alte documente aprobate care nu sunt enumerate aici.",
            "Totals also include approved documents not listed in this preview.")));
      }
      body.append(area);
    }
    const notes=make("div","piggybank-hud-notes");
    const seen=new Set();
    for(const note of result.notes||[]){
      if(typeof note!=="string"||seen.has(note))continue;
      seen.add(note);notes.append(make("p","",note));
    }
    if(!seen.size)notes.append(make("p","",
      t("Numai documente aprobate Billy; asocierea completă cu misiunea necesită Skylegs.",
        "Billy approved documents only; full mission matching requires Skylegs.")));
    body.append(notes);
    content.replaceChildren(body);
    content.scrollTop=0;
  }
  let active=false;
  function show(result,question){
    if(!result?.understood)return false;
    render(result,question);
    active=true;
    hud.hidden=false;
    backdrop.hidden=false;
    document.body.classList.add("piggybank-hud-active");
    return true;
  }
  function hide(restoreFocus=true){
    if(!active)return;
    active=false;hud.hidden=true;backdrop.hidden=true;
    document.body.classList.remove("piggybank-hud-active");
    if(restoreFocus){
      const field=$("billyAssistantInput");
      if(field&&!$("billyAssistantPanel")?.hidden)field.focus();
    }
  }
  close.addEventListener("click",()=>hide());
  backdrop.addEventListener("click",()=>hide());
  new MutationObserver(()=>{
    if(active&&document.body.dataset.billyScreen!=="home")hide(false);
  }).observe(document.body,{attributes:true,attributeFilter:["data-billy-screen"]});
  window.PiggybankHUD={show,hide,active:()=>active};
})();