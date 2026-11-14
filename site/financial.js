/* Billy Financial P0: approved-expense chart, genuine backend data, no demo values. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const make=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  const state={data:null,currency:null,inFlight:null,token:0,error:null};
  const currencyGroups=()=>Array.isArray(state.data?.trend?.groups)?state.data.trend.groups:[];
  const activeGroup=()=>currencyGroups().find(x=>x.currency===state.currency)||null;
  const money=(minor,currency)=>{
    if(!currency)return "-";
    const amount=Number(minor)/100;
    return Number.isFinite(amount)?new Intl.NumberFormat("en-GB",{
      style:"currency",currency,maximumFractionDigits:2,minimumFractionDigits:2
    }).format(amount):"-";
  };
  function fillSelect(select){
    if(!select)return;
    const existing=select.value;
    select.replaceChildren();
    const groups=currencyGroups();
    for(const group of groups){
      const option=make("option","",group.currency);
      option.value=group.currency;select.append(option);
    }
    if(groups.length){
      select.disabled=false;
      select.value=groups.some(g=>g.currency===state.currency)?state.currency:groups[0].currency;
    }else{
      const option=make("option","","-");option.value="";select.append(option);
      select.disabled=true;
    }
  }
  function chartBars(host,group){
    host.replaceChildren();
    if(!group||!Array.isArray(group.bars)||!group.bars.length){
      host.append(make("span","billy-financial-empty",
        state.error?"Financial activity unavailable":"No approved expenses for this period"));
      host.setAttribute("aria-label","No approved expense values");
      return;
    }
    const max=Math.max(0,...group.bars.map(b=>Math.max(0,Number(b.total_minor)||0)));
    const details=[];
    for(const bar of group.bars){
      const value=Math.max(0,Number(bar.total_minor)||0);
      const label=new Date(bar.start_date+"T00:00:00Z").toLocaleDateString("en-GB",{
        day:"2-digit",month:"short",timeZone:"UTC"
      });
      details.push(label+": "+money(value,group.currency));
      const pct=max?Math.max(value>0?4:0,100*value/max):0;
      const item=make("div","billy-financial-week");
      const total=make("span","billy-financial-week-value",money(value,group.currency));
      const track=make("span","billy-financial-week-track");
      const column=make("span","billy-financial-week-bar");
      column.style.setProperty("--height",pct+"%");
      track.append(column);
      item.append(total,track,make("span","billy-financial-week-label",label));
      host.append(item);
    }
    host.setAttribute("aria-label",details.join(". "));
  }

  const filters={search:"",vendor:"",aircraft:"",period:"all"};
  let editingId=null;
  const opsList=()=>Array.isArray(state.data?.ledger)?state.data.ledger:[];
  const issuesList=()=>Array.isArray(state.data?.attention)?state.data.attention:[];
  const statusText=(stateName)=>({
    payment_confirmed:"Payment confirmed",
    payment_linked:"Payment linked",
    no_payment_proof:"No payment proof linked"
  })[stateName]||"Payment status unknown";
  const issueNames={
    missing_amount:"Amount",
    missing_currency:"Currency",
    missing_date:"Document date",
    unmatched_payment:"Payment needs matching"
  };
  const createButton=(name,className,fn)=>{
    const button=make("button",className,name);
    button.type="button";
    button.addEventListener("click",fn);
    return button;
  };
  function resetOptions(id,values,all,current){
    const select=$(id);
    if(!select)return;
    const unique=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    select.replaceChildren();
    const any=make("option","",all);any.value="";select.append(any);
    for(const value of unique){
      const option=make("option","",value);option.value=value;select.append(option);
    }
    select.value=unique.includes(current)?current:"";
    return select.value;
  }
  function renderFinancialAttention(){
    const items=issuesList(),section=$("billyFinancialAttentionSection");
    const container=$("billyFinancialAttentionList");
    section.hidden=!items.length||Boolean(state.error);
    container.replaceChildren();
    if(section.hidden){
      editingId=null;
      $("billyFinancialReviewEditor").hidden=true;
      return;
    }
    $("billyFinancialAttentionCount").textContent=String(items.length);
    for(const issue of items.slice(0,100)){
      const item=make("div","billy-financial-attention-item");
      const left=make("div","billy-financial-attention-copy");
      left.append(make("strong","",issue.vendor||
        (issue.kind==="unmatched_payment"?"Payment slip":"Expense")));
      const details=issue.issues.map(x=>issueNames[x]||x).join(" · ");
      left.append(make("small","",details));
      const actions=make("div","billy-financial-row-actions");
      actions.append(createButton("View","billy-financial-subtle",
        event=>void openDocument(issue.id,event.currentTarget)));
      if(issue.kind==="missing_financial_fields"&&issue.can_review){
        actions.append(createButton("Review","billy-financial-subtle",
          ()=>{editingId=issue.id;renderReviewEditor();}));
      }
      item.append(left,actions);container.append(item);
    }
    renderReviewEditor();
  }
  function renderReviewEditor(){
    const host=$("billyFinancialReviewEditor");
    host.replaceChildren();
    const issue=issuesList().find(x=>x.id===editingId&&
      x.kind==="missing_financial_fields"&&x.can_review);
    host.hidden=!issue;
    if(!issue)return;
    const header=make("div","billy-financial-review-head");
    header.append(make("strong","","Review · "+issue.vendor));
    header.append(createButton("×","billy-financial-review-close",()=>{
      editingId=null;renderReviewEditor();
    }));
    const detail=make("p","",
      "Add only values you verified against the document. Corrections are audited; original readings remain unchanged.");
    const form=make("form","billy-financial-review-form");
    const names={
      missing_amount:["grand_total","Amount (e.g. 278.93)","text","278.93"],
      missing_currency:["currency","Currency (e.g. EUR)","text","EUR"],
      missing_date:["issue_date","Document date (YYYY-MM-DD)","text","2026-11-13"]
    };
    const controls=[];
    for(const missing of issue.issues){
      if(!names[missing])continue;
      const [field,label,type,placeholder]=names[missing];
      const fieldWrap=make("label","billy-financial-review-field");
      fieldWrap.append(make("span","",label));
      const input=make("input","");
      input.name=field;input.type=type;input.placeholder=placeholder;
      input.autocomplete="off";input.maxLength=24;
      fieldWrap.append(input);form.append(fieldWrap);
      controls.push([field,input]);
    }
    const feedback=make("p","billy-financial-review-feedback","");
    feedback.setAttribute("role","status");
    const buttons=make("div","billy-financial-review-actions");
    buttons.append(createButton("Open source","billy-financial-subtle",
      event=>void openDocument(issue.id,event.currentTarget)));
    const save=make("button","billy-financial-save","Save verified values");
    save.type="submit";buttons.append(save);
    form.append(buttons,feedback);
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      const values={};
      for(const [name,input] of controls){
        const value=input.value.trim();
        if(value)values[name]=value;
      }
      if(!Object.keys(values).length){
        feedback.textContent="Enter at least one verified value.";
        return;
      }
      if(!window.BillyAccounts?.active?.()){
        feedback.textContent="Sign in to save corrections.";return;
      }
      save.disabled=true;feedback.textContent="Saving verified values...";
      try{
        const headers=await window.BillyAccounts.sessionHeaders();
        const api=window.BILLY_AUTH_CONFIG?.apiUrl;
        if(!api)throw Error("Financial service is unavailable");
        const response=await fetch(api+"/api/vision/financial-review",{
          method:"POST",cache:"no-store",
          headers:{"Content-Type":"application/json",...headers},
          body:JSON.stringify({record_id:issue.id,values})
        });
        const payload=await response.json();
        if(!response.ok||payload.saved!==true)
          throw Error(payload.detail||"Unable to save verified values");
        editingId=null;await refresh();
      }catch(error){
        feedback.textContent=error?.message||"Correction could not be saved";
        save.disabled=false;
      }
    });
    host.append(header,detail,form);
  }
  function renderExpenseLedger(){
    const host=$("billyFinancialLedger");
    const rows=opsList();
    filters.vendor=resetOptions("billyFinancialVendor",
      rows.map(x=>x.vendor), "All vendors",filters.vendor)||"";
    filters.aircraft=resetOptions("billyFinancialAircraft",
      rows.map(x=>x.aircraft),"All aircraft",filters.aircraft)||"";
    const end=state.data?.trend?.end_date||"";
    const from=filters.period==="all"?"":(()=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(end))return "";
      const base=new Date(end+"T00:00:00Z");
      base.setUTCDate(base.getUTCDate()-(Number(filters.period)-1));
      return base.toISOString().slice(0,10);
    })();
    const search=filters.search.normalize("NFKC").toLocaleLowerCase("en-US");
    const visible=rows.filter(item=>{
      if(filters.vendor&&item.vendor!==filters.vendor)return false;
      if(filters.aircraft&&item.aircraft!==filters.aircraft)return false;
      if(from&&(!item.date||item.date<from))return false;
      if(search&&![item.vendor,item.profile,item.aircraft,item.flight,
         item.reference,item.category].some(value=>
        String(value||"").toLocaleLowerCase("en-US").includes(search)))return false;
      return true;
    });
    $("billyFinancialLedgerCount").textContent=
      visible.length+" of "+rows.length+" approved expenses"+
      ((state.data?.operational_counts?.duplicate_expenses_excluded||0)?
        " · duplicates excluded":"");
    host.replaceChildren();
    if(state.error||!visible.length){
      host.append(make("p","billy-financial-empty",
        state.error?"Financial records unavailable":"No expenses match these filters"));
      return;
    }
    for(const item of visible.slice(0,150)){
      const row=make("div","billy-financial-expense-row");
      const identity=make("div","billy-financial-expense-identity");
      identity.append(make("strong","",item.vendor||"Unassigned"));
      const context=[(item.profile||"").replaceAll("_"," "),item.aircraft,
        item.date||"No document date"].filter(Boolean).join(" · ");
      identity.append(make("small","",context));
      const totals=make("div","billy-financial-expense-amount");
      totals.append(make("strong","",item.amount_minor!==null?
        money(item.amount_minor,item.currency):
        (item.currency?"Amount needed":"Incomplete amount")));
      totals.append(make("small",item.issues?.length?
        "billy-financial-issue-text":"",
        item.issues?.length?
          "Financial details missing":statusText(item.payment_state)));
      const actions=make("div","billy-financial-row-actions");
      actions.append(createButton("Open","billy-financial-subtle",
        event=>void openDocument(item.id,event.currentTarget)));
      row.append(identity,totals,actions);host.append(row);
    }
    if(visible.length>150){
      host.append(make("p","billy-financial-coverage",
        "Showing the first 150 matching records. Refine the filters to narrow the list."));
    }
  }
  function renderFinancialOperations(){
    if(!$("billyFinancialLedger"))return;
    renderFinancialAttention();
    renderExpenseLedger();
    const partial=Boolean(state.data?.partial);
    const coverage=$("billyFinancialCoverage");
    coverage.hidden=!partial;
    coverage.textContent=partial?
      "Some records exceed the current financial query limit. Totals and lists may be incomplete.":
      "";
  }
  function render(){
    const groups=currencyGroups();
    if(!groups.some(g=>g.currency===state.currency))state.currency=groups[0]?.currency||null;
    fillSelect($("billyFinancialCurrency"));
    chartBars($("billyFinancialChart"),activeGroup());
    const group=activeGroup();
    $("billyFinancialTotal").textContent=group?money(group.total_minor,group.currency):"-";
    const trend=state.data?.trend;
    $("billyFinancialPeriod").textContent=trend?
      trend.start_date+" – "+trend.end_date+" · "+group?.documents+" approved documents":
      (state.error||"Last 30 days");
    const links=Array.isArray(state.data?.linked_payments)?state.data.linked_payments:[];
    $("billyFinancialLinksCaption").textContent=links.length?
      links.length+" attached payment "+(links.length===1?"proof":"proofs")+
      (state.data?.partial?" · partial archive":""):
      "No linked payments yet";
    const list=$("billyFinancialLinks");
    list.replaceChildren();
    if(!links.length){
      list.append(make("p","billy-financial-empty",
        state.error?"Financial activity unavailable":"Payment proofs will appear here after matching"));
    }
    for(const link of links.slice(0,18)){
      const button=make("button","billy-financial-link-row");
      button.type="button";button.title="Open linked expense";
      const lhs=make("strong","",money(link.amount_minor,link.currency));
      const rhs=make("span","",link.payment_result==="confirmed"?"Payment confirmed":"Payment evidence linked");
      button.append(lhs,rhs);
      button.addEventListener("click",()=>void openDocument(link.expense_document_id,button));
      list.append(button);
    }
    renderFinancialOperations();
  }
  async function openDocument(id,button){
    const config=window.BILLY_AUTH_CONFIG||{};
    if(!window.BillyAccounts?.active?.()||!id)return;
    button.disabled=true;
    try{
      const headers=await window.BillyAccounts.sessionHeaders();
      const response=await fetch(config.apiUrl+"/api/vision/assistant-source?record_id="+
        encodeURIComponent(id),{headers,cache:"no-store"});
      if(!response.ok)throw Error("Source unavailable");
      const payload=await response.json();
      if(payload.record)window.BillyDocumentPreview?.open?.(payload.record);
    }catch{button.title="Unable to open source; check your connection.";}
    finally{button.disabled=false;}
  }
  async function refresh(){
    if(state.inFlight)return state.inFlight;
    if(!window.BillyAccounts?.active?.()){
      state.data=null;state.error="Sign in to view expenses";render();return;
    }
    const token=++state.token;
    state.inFlight=(async()=>{
      try{
        const headers=await window.BillyAccounts.sessionHeaders();
        const api=window.BILLY_AUTH_CONFIG?.apiUrl;
        if(!api)throw Error("Financial service is not configured");
        const response=await fetch(api+"/api/vision/financial",{headers,cache:"no-store"});
        if(!response.ok)throw Error("Financial ledger is unavailable");
        const payload=await response.json();
        if(token!==state.token)return;
        state.data=payload;state.error=null;
      }catch{
        if(token===state.token){state.data=null;state.error="Financial ledger unavailable";}
      }finally{
        if(token===state.token){state.inFlight=null;render();}
      }
    })();
    return state.inFlight;
  }
  for(const id of ["billyFinancialCurrency"]){
    $(id).addEventListener("change",event=>{
      const selected=event.target.value;
      if(!currencyGroups().some(g=>g.currency===selected))return;
      state.currency=selected;render();
    });
  }
  $("billyFinancialSearch").addEventListener("input",event=>{
    filters.search=event.target.value;renderExpenseLedger();
  });
  for(const [id,key] of [["billyFinancialVendor","vendor"],
    ["billyFinancialAircraft","aircraft"],["billyFinancialPeriodFilter","period"]]){
    $(id).addEventListener("change",event=>{
      filters[key]=event.target.value;renderExpenseLedger();
    });
  }
  window.BillyFinancial={refresh};
  window.addEventListener("billy:account-ready",()=>{
    if(document.body.dataset.billyScreen==="financial")void refresh();
  });
  window.addEventListener("billy:document-approved",()=>{
    if(document.body.dataset.billyScreen==="financial")void refresh();
  });
})();
