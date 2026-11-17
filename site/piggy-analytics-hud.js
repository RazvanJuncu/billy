/* Piggy 2.0: dynamic read-only HUD. Never creates totals in the browser.
   Server owns all filters, money arithmetic, grouping and source selection. */
(() => {
  "use strict";
  const el=(tag,cls,value)=>{
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(value!==undefined)e.textContent=String(value);
    return e;
  };
  const label=(ro,en,lang)=>lang==="ro"?ro:en;
  const formatMoney=(minor,currency,lang)=>{
    if(!Number.isSafeInteger(minor)||!currency)return "—";
    try{return new Intl.NumberFormat(lang==="ro"?"ro-RO":"en-GB",{
      style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2
    }).format(minor/100);}
    catch{return (minor/100).toFixed(2)+" "+currency;}
  };
  const dims={vendor:["Furnizori","Vendors"],category:["Categorii","Categories"],
    airport:["Aeroporturi","Airports"],aircraft:["Aeronave","Aircraft"],
    card:["Carduri","Cards"],month:["Luni","Months"],day:["Zile","Days"],
    currency:["Monede","Currencies"],none:["Total","Total"]};
  function amount(value,currency,lang,metric){
    if(metric==="count")return new Intl.NumberFormat(lang==="ro"?"ro-RO":"en-GB").format(value);
    return formatMoney(value,currency,lang);
  }
  function block(heading,info){
    const node=el("section","piggy-analytics-section");
    const head=el("div","piggy-analytics-section-head");
    head.append(el("h3","",heading));
    if(info)head.append(el("span","",info));
    node.append(head);return node;
  }
  function badgeText(value,cls=""){
    return el("span","piggy-analytics-chip "+cls,value);
  }
  function drawBars(container,items,group,metric,lang){
    const top=Math.max(1,...items.map(i=>metric==="count"?i.count:i.total_minor));
    for(const item of items.slice(0,14)){
      const row=el("div","piggy-analytics-bar-row");
      const head=el("div","piggy-analytics-bar-head");
      head.append(el("span","",item.label),
        el("strong","",amount(metric==="count"?item.count:item.total_minor,
          group.currency,lang,metric)));
      const track=el("div","piggy-analytics-bar-track");
      const fill=el("span","piggy-analytics-bar-fill");
      fill.style.width=(Math.max(0,Math.min(100,
        (metric==="count"?item.count:item.total_minor)/top*100))).toFixed(2)+"%";
      track.append(fill);
      row.append(head,track);container.append(row);
    }
  }
  function drawLine(container,group,metric,lang){
    const points=group.timeline||[];
    if(points.length===0){container.append(el("p","piggy-analytics-muted",
      label("Nu există date pentru grafic.","No dated records available for a chart.",lang)));return;}
    const values=points.map(p=>metric==="count"?p.count:p.total_minor);
    const max=Math.max(1,...values),width=640,height=185,pad=21;
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 "+width+" "+height);
    svg.setAttribute("role","img");
    svg.setAttribute("aria-label",label("Evoluția cheltuielilor","Spending over time",lang)+
      " · "+group.currency);
    const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");
    line.setAttribute("fill","none");line.setAttribute("stroke","#c5cfcd");
    line.setAttribute("stroke-width","2.5");line.setAttribute("stroke-linecap","round");
    line.setAttribute("stroke-linejoin","round");
    const coords=values.map((v,i)=>[
      pad+(points.length===1?.5:i/(points.length-1))*(width-pad*2),
      height-pad-v/max*(height-pad*2)
    ]);
    line.setAttribute("points",coords.map(p=>p.join(",")).join(" "));
    svg.append(line);
    for(const [i,p] of coords.entries()){
      if(points.length>42&&i%Math.ceil(points.length/32)!==0&&i!==points.length-1)continue;
      const circle=document.createElementNS("http://www.w3.org/2000/svg","circle");
      circle.setAttribute("cx",String(p[0]));
      circle.setAttribute("cy",String(p[1]));
      circle.setAttribute("r","3");
      circle.setAttribute("fill","#c5cfcd");
      const title=document.createElementNS("http://www.w3.org/2000/svg","title");
      title.textContent=points[i].date+" · "+amount(values[i],group.currency,lang,metric);
      circle.append(title);svg.append(circle);
    }
    const graphic=el("div","piggy-analytics-line");
    graphic.append(svg);
    const axis=el("div","piggy-analytics-axis");
    axis.append(el("span","",points[0].date),
      el("span","",points[points.length-1].date));
    container.append(graphic,axis);
  }
  function drawTable(container,items,group,metric,lang){
    const table=el("div","piggy-analytics-table");
    for(const item of items.slice(0,30)){
      const row=el("div","piggy-analytics-table-row");
      row.append(el("span","",item.label),
        el("strong","",amount(metric==="count"?item.count:item.total_minor,
          group.currency,lang,metric)));
      table.append(row);
    }
    container.append(table);
  }
  function sourceLine(doc,lang){
    const row=el("div","piggybank-hud-document");
    const info=el("div","piggybank-hud-doc-info");
    info.append(el("strong","",doc.vendor||"Unassigned"));
    const details=[doc.date,doc.airport,
      doc.card_last4?"•••• "+doc.card_last4:null,
      doc.category,doc.flight_number].filter(Boolean).join(" · ");
    info.append(el("span","",details||doc.source||"Approved document"));
    const btn=el("button","piggybank-hud-doc-open",
      label("Deschide","Open",lang));
    btn.type="button";
    btn.addEventListener("click",()=>{
      if(window.BillyIntelligenceAssistant?.openSource)
        void window.BillyIntelligenceAssistant.openSource(doc.id,btn);
    });
    row.append(info,el("strong","piggybank-hud-doc-price",
      formatMoney(doc.amount_minor,doc.currency,lang)),btn);
    return row;
  }
  function render(result,question,host,heading,kicker){
    const lang=result.language==="ro"?"ro":"en",plan=result.plan||{};
    heading.textContent=plan.kind==="card_spending"?
      label("Cheltuieli pe carduri","Card spending",lang):
      label("Analiză financiară","Financial analysis",lang);
    if(kicker)kicker.textContent="PIGGY / ANALYTICS";
    const body=document.createDocumentFragment();
    body.append(el("p","piggybank-hud-request",question));
    const scope=el("div","piggy-analytics-scope");
    const descriptors=[
      plan.start_date?(plan.start_date===plan.end_date?
        plan.start_date:plan.start_date+" – "+plan.end_date):null,
      plan.card_currency?label("Carduri ","Cards ",lang)+plan.card_currency:null,
      plan.card_last4?"•••• "+plan.card_last4:null,
      plan.aircraft,plan.flight_number,plan.airport,
      plan.destination_airport?label("Destinație ","Destination ",lang)+plan.destination_airport:null,
      plan.vendor,plan.category
    ].filter(Boolean);
    for(const item of descriptors)scope.append(badgeText(item));
    if(descriptors.length)body.append(scope);
    if(result.blocked){
      const panel=block(label("Date insuficiente","Insufficient verified data",lang));
      for(const note of result.notes||[])panel.append(el("p","piggy-analytics-alert",note));
      body.append(panel);host.replaceChildren(body);host.scrollTop=0;return;
    }
    const groups=Array.isArray(result.groups)?result.groups:[];
    const summary=el("div","piggybank-hud-totals");
    if(!groups.length){
      const box=el("div","piggybank-hud-total");
      box.append(el("span","piggybank-hud-total-label",
          label("Rezultat","Result",lang)),
        el("strong","piggybank-hud-total-amount","—"),
        el("span","piggybank-hud-total-meta",
          label("Nu există înregistrări eligibile pentru această cerere.",
            "No eligible records for these filters.",lang)));
      summary.append(box);
    }
    for(const item of groups){
      const tile=el("div","piggybank-hud-total");
      tile.append(el("span","piggybank-hud-total-label",
        (result.coverage?.partial?label("Total parțial","Partial total",lang):
          label("Total documentat","Documented total",lang))+" · "+item.currency),
        el("strong","piggybank-hud-total-amount",
          formatMoney(item.total_minor,item.currency,lang)),
        el("span","piggybank-hud-total-meta",
          item.count+" "+label("tranzacții/documente","records",lang)));
      if(plan.compare_previous&&item.previous_total_minor!==null){
        const change=item.change_percent===null?
          label("Fără bază de comparație","No comparison baseline",lang):
          (item.change_percent>0?"+":"")+item.change_percent.toFixed(2)+"%";
        tile.append(el("span","piggy-analytics-compare",
          label("Anterior: ","Previous: ",lang)+
          formatMoney(item.previous_total_minor,item.currency,lang)+" · "+change));
      }
      summary.append(tile);
    }
    body.append(summary);
    const viz=result.visualization||"table",dimension=dims[plan.group_by]||dims.none;
    for(const group of groups){
      const title=label(dimension[0],dimension[1],lang)+" · "+group.currency;
      const plot=block(title,plan.metric==="count"?
        label("Număr de înregistrări","Record count",lang):null);
      const items=Array.isArray(group.breakdown)?group.breakdown:[];
      if(viz==="line")drawLine(plot,group,plan.metric,lang);
      else if(viz==="bar")drawBars(plot,items,group,plan.metric,lang);
      else if(items.length>1)drawTable(plot,items,group,plan.metric,lang);
      else plot.append(el("p","piggy-analytics-muted",
        label("Schimbă gruparea pentru o defalcare.","Ask Piggy to group by vendor, category, card or day.",lang)));
      body.append(plot);
    }
    const sources=Array.isArray(result.documents)?result.documents:[];
    if(sources.length){
      const area=block(label("Documente justificative","Supporting documents",lang),
        sources.length+" "+label("afișate","shown",lang));
      for(const doc of sources)area.append(sourceLine(doc,lang));
      if(result.coverage?.matching_documents>sources.length)
        area.append(el("p","piggy-analytics-muted",
          label("Lista este un preview; calculele includ toate documentele eligibile.",
            "Source list is a preview; aggregates include all eligible records.",lang)));
      body.append(area);
    }
    if((result.notes||[]).length){
      const details=el("details","piggy-analytics-coverage");
      details.append(el("summary","",
        label("Surse și limitări","Evidence & limitations",lang)));
      for(const note of result.notes)details.append(el("p","",note));
      body.append(details);
    }
    host.replaceChildren(body);host.scrollTop=0;
  }
  window.PiggyAnalyticsHUD={render};
})();