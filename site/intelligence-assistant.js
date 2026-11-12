/* Billy Intelligence Assistant: bilingual, document-grounded flight operations chat.
   In-memory conversation only. No samples, hardcoded financial figures or browser persistence. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const launch=$("billyAssistantLaunch"),panel=$("billyAssistantPanel");
  if(!launch||!panel)return;
  const form=$("billyAssistantForm"),input=$("billyAssistantInput"),
    feed=$("billyAssistantFeed"),close=$("billyAssistantClose"),
    status=$("billyAssistantStatus"),submit=$("billyAssistantSend");
  let open=false,busy=false,lastQuestion="",pending=null;
  const make=(tag,cls,content)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(content!==undefined)el.textContent=String(content);
    return el;
  };
  const locale=lang=>lang==="ro"?"ro-RO":"en-US";
  function money(minor,currency,lang){
    if(!Number.isSafeInteger(minor)||!currency)return "—";
    const num=minor/100;
    try{return new Intl.NumberFormat(locale(lang),{
      style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2
    }).format(num);}
    catch{return num.toFixed(2)+" "+currency;}
  }
  function setOpen(next){
    open=Boolean(next);
    panel.hidden=!open;
    launch.setAttribute("aria-expanded",String(open));
    if(open)input.focus();
    else launch.focus();
  }
  function say(text,who){
    const row=make("div","billy-ai-message "+(who==="user"?"is-user":"is-billy"));
    const bubble=make("div","billy-ai-bubble",text);
    row.append(bubble);feed.append(row);
    feed.scrollTop=feed.scrollHeight;
    return row;
  }
  const appendRow=(section,label,value)=>{
    if(value===undefined||value===null||value==="")return;
    const row=make("div","billy-ai-detail-row");
    row.append(make("span","",label),make("strong","",value));
    section.append(row);
  };
  function section(title){
    const el=make("section","billy-ai-answer-section");
    el.append(make("h4","",title));return el;
  }
  function sourceRow(item,lang){
    const row=make("div","billy-ai-source");
    const details=make("div","billy-ai-source-text");
    const name=(item.vendor||"Vendor")+(item.reference?" · "+item.reference:"");
    details.append(make("strong","",name));
    const attributes=[item.date,item.airport,item.category,item.flight_number]
      .filter(Boolean).join(" · ");
    if(attributes)details.append(make("span","",attributes));
    row.append(details);
    const rhs=make("div","billy-ai-source-right");
    rhs.append(make("strong","",money(item.amount_minor,item.currency,lang)));
    const button=make("button","billy-ai-source-open",lang==="ro"?"Deschide":"Open");
    button.type="button";
    button.setAttribute("aria-label",(lang==="ro"?"Deschide documentul ":"Open document ")+name);
    button.addEventListener("click",()=>void openSource(item.id,button));
    rhs.append(button);row.append(rhs);return row;
  }
  async function openSource(id,button){
    if(!window.BillyAccounts?.active?.())return;
    button.disabled=true;
    const old=button.textContent;button.textContent="…";
    try{
      const headers=await window.BillyAccounts.sessionHeaders();
      const response=await fetch(window.BILLY_AUTH_CONFIG.apiUrl+
        "/api/vision/assistant-source?record_id="+encodeURIComponent(id),
        {headers,cache:"no-store"});
      const result=await response.json();
      if(!response.ok||!result.record)throw Error(result.detail||"Source unavailable");
      if(!window.BillyDocumentPreview?.open)throw Error("Document preview unavailable");
      window.BillyDocumentPreview.open(result.record);
    }catch(e){
      status.textContent=e.message||"Could not open document";
    }finally{button.disabled=false;button.textContent=old;}
  }
  function renderAnswer(result){
    const lang=result.language==="ro"?"ro":"en";
    const t=(ro,en)=>lang==="ro"?ro:en;
    const wrapper=make("article","billy-ai-answer");
    if(!result.understood){
      wrapper.append(make("p","billy-ai-note",result.detail||t("Nu pot interpreta întrebarea.","I couldn't interpret that question.")));
      return wrapper;
    }
    const f=result.filter||{},c=result.coverage||{};
    const qualifiers=[f.aircraft_registration,
      f.start_date?(f.start_date===f.end_date?f.start_date:f.start_date+" – "+f.end_date):null,
      f.expense_category||null].filter(Boolean);
    wrapper.append(make("div","billy-ai-answer-kicker",t("DOCUMENTE BILLY APROBATE","APPROVED BILLY DOCUMENTS")));
    wrapper.append(make("h3","billy-ai-answer-heading",
      t("Analiză operațională","Operational insight")));
    if(qualifiers.length)wrapper.append(make("p","billy-ai-qualifiers",qualifiers.join(" · ")));
    const metrics=make("div","billy-ai-metrics");
    const metric=(v,label)=>{
      const box=make("div","billy-ai-metric");
      box.append(make("strong","",v),make("span","",label));
      metrics.append(box);
    };
    metric(String(c.matched_records||0),t("Documente asociate","Matched records"));
    metric(String(c.priced_records||0),t("Cu valoare verificabilă","With verified amount"));
    wrapper.append(metrics);
    if(Array.isArray(result.groups)&&result.groups.length){
      for(const group of result.groups){
        const area=section(t("Cheltuieli documentate","Documented expenses"));
        const total=make("div","billy-ai-total",money(group.total_minor,group.currency,lang));
        area.append(total);
        area.append(make("p","billy-ai-subtle",
          t("Total din "+group.documents+" documente. Nu reprezintă costul confirmat al misiunii.",
            "From "+group.documents+" documents. Not a confirmed mission cost.")));
        if(group.categories?.length){
          area.append(make("h5","",t("Pe categorii","By category")));
          for(const entry of group.categories)
            appendRow(area,entry.name,money(entry.total_minor,group.currency,lang));
        }
        if(group.vendors?.length){
          area.append(make("h5","",t("Pe furnizori","By vendors")));
          for(const entry of group.vendors)
            appendRow(area,entry.name,money(entry.total_minor,group.currency,lang));
        }
        wrapper.append(area);
      }
    }else{
      wrapper.append(make("p","billy-ai-empty",
        t("Nu există costuri cu valoare validată în documentele care corespund filtrelor.",
          "No amounts with validated values were found among matching documents.")));
    }
    const ops=result.operations||{};
    if([ops.airports,ops.vendors,ops.flight_numbers,ops.categories]
      .some(list=>Array.isArray(list)&&list.length)){
      const area=section(t("Context operațional în documente","Operational context in documents"));
      const items=[
        [t("Aeroporturi","Airports"),ops.airports],
        [t("Referințe de zbor","Flight references"),ops.flight_numbers],
        [t("Furnizori","Vendors"),ops.vendors],
        [t("Servicii","Services"),ops.categories]
      ];
      for(const [label,values] of items){
        if(!Array.isArray(values)||!values.length)continue;
        appendRow(area,label,values.slice(0,9).join(", ")+(values.length>9?"…":""));
      }
      wrapper.append(area);
    }
    if(result.documents?.length){
      const area=section(t("Documente justificative","Source documents"));
      for(const doc of result.documents.slice(0,12))area.append(sourceRow(doc,lang));
      if(c.priced_records>12)
        area.append(make("p","billy-ai-subtle",
          t("Se afișează primele 12 surse. Totalurile includ toate înregistrările găsite.",
            "Showing the first 12 sources. Totals include all matching records.")));
      wrapper.append(area);
    }
    if(c.without_valid_amount||c.skipped_missing_date||c.skipped_invoice_date_only||c.duplicate_records_excluded){
      const area=section(t("Acoperire și excluderi","Coverage and exclusions"));
      if(c.without_valid_amount)appendRow(area,t("Fără sumă validă","Without valid amount"),c.without_valid_amount);
      if(c.skipped_missing_date)appendRow(area,t("Fără dată utilă","Without matching date"),c.skipped_missing_date);
      if(c.skipped_invoice_date_only)appendRow(area,t("Doar data facturii","Invoice date only"),c.skipped_invoice_date_only);
      if(c.duplicate_records_excluded)appendRow(area,t("Copii duplicate excluse","Duplicate copies excluded"),c.duplicate_records_excluded);
      wrapper.append(area);
    }
    const footer=make("div","billy-ai-guardrails");
    for(const note of result.notes||[])footer.append(make("p","",note));
    wrapper.append(footer);
    return wrapper;
  }
  async function ask(question){
    if(busy)return;
    const prompt=question.trim();
    if(prompt.length<3||prompt.length>400){
      status.textContent="Please enter 3–400 characters.";return;
    }
    if(!window.BillyAccounts?.active?.()){
      status.textContent="Sign in to an approved Billy team to ask about its documents.";
      return;
    }
    setOpen(true);
    busy=true;submit.disabled=true;input.disabled=true;
    status.textContent="";input.value="";
    say(prompt,"user");
    pending=say("Analyzing approved documents…","billy");
    pending.querySelector(".billy-ai-bubble").classList.add("is-loading");
    try{
      const headers=await window.BillyAccounts.sessionHeaders();
      const response=await fetch(window.BILLY_AUTH_CONFIG.apiUrl+
        "/api/vision/assistant",{
        method:"POST",headers:{"Content-Type":"application/json",...headers},
        body:JSON.stringify({question:prompt,previous_question:lastQuestion}),
        cache:"no-store"
      });
      const result=await response.json();
      if(!response.ok)throw Error(result.detail||"Billy Intelligence is unavailable.");
      lastQuestion=prompt;
      pending.replaceChildren(renderAnswer(result));
    }catch(e){
      pending.replaceChildren(make("div","billy-ai-error",
        e.message||"Could not analyze the question. Please retry."));
    }finally{
      busy=false;submit.disabled=false;input.disabled=false;pending=null;
      feed.scrollTop=feed.scrollHeight;input.focus();
    }
  }
  launch.addEventListener("click",()=>setOpen(!open));
  close.addEventListener("click",()=>setOpen(false));
  form.addEventListener("submit",event=>{
    event.preventDefault();void ask(input.value);
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&open)setOpen(false);
  });
  window.addEventListener("billy:account-ready",()=>{status.textContent="";});
  window.BillyIntelligenceAssistant={ask};
})();