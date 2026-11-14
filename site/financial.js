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
  const nav={section:null,expenseView:"paths",expenseKind:null,selected:null,paymentView:"paths"};
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
    section.hidden=nav.section!=="attention"||!items.length||Boolean(state.error);
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
      if(nav.section==="expenses"&&nav.expenseView==="list"&&
         nav.expenseKind==="aircraft"&&nav.selected==="__unassigned__"&&
         item.aircraft)return false;
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

  // Uploaded Documents-style navigation: one useful level at a time.
  // The ledger, reconciliation links and audited review form are reused,
  // rather than duplicated in new views or separate account data stores.
  function enterSection(section){
    if(!["attention","expenses","payments","insights"].includes(section))return;
    if(section==="attention"&&!issuesList().length)return;
    nav.section=section;
    nav.expenseView="paths";nav.expenseKind=null;nav.selected=null;
    nav.paymentView="paths";
    editingId=null;
    filters.search="";filters.vendor="";filters.aircraft="";filters.period="all";
    $("billyFinancialSearch").value="";
    $("billyFinancialPeriodFilter").value="all";
    render();
  }
  function openExpensePath(kind){
    if(nav.section!=="expenses")return;
    if(!["aircraft","vendor","all"].includes(kind))return;
    nav.expenseKind=kind;nav.selected=null;
    nav.expenseView=kind==="all"?"list":"groups";
    filters.vendor="";filters.aircraft="";filters.search="";filters.period="all";
    $("billyFinancialSearch").value="";
    $("billyFinancialPeriodFilter").value="all";
    render();
  }
  function openExpenseGroup(key){
    if(nav.section!=="expenses"||nav.expenseView!=="groups")return;
    nav.selected=key;
    if(nav.expenseKind==="vendor")filters.vendor=key;
    if(nav.expenseKind==="aircraft")filters.aircraft=key==="__unassigned__"?"":key;
    nav.expenseView="list";
    render();
  }
  function openPaymentPath(type){
    if(nav.section!=="payments"||!["linked","unmatched"].includes(type))return;
    nav.paymentView=type;
    render();
  }
  function backInFinancial(){
    if(nav.section==="expenses"&&nav.expenseView==="list"){
      nav.expenseView=nav.expenseKind==="all"?"paths":"groups";
      nav.selected=null;filters.vendor="";filters.aircraft="";
    }else if(nav.section==="expenses"&&nav.expenseView==="groups"){
      nav.expenseView="paths";nav.expenseKind=null;
    }else if(nav.section==="payments"&&nav.paymentView!=="paths"){
      nav.paymentView="paths";
    }else{
      nav.section=null;editingId=null;
    }
    render();
  }
  function showGroupChoices(){
    const host=$("billyFinancialExpenseGroups");
    host.replaceChildren();
    const field=nav.expenseKind==="vendor"?"vendor":"aircraft";
    const groups=new Map();
    for(const row of opsList()){
      const value=row[field]||
        (field==="aircraft"?"__unassigned__":"Unassigned");
      groups.set(value,(groups.get(value)||0)+1);
    }
    const ordered=[...groups.entries()].sort((a,b)=>{
      if(a[0]==="__unassigned__")return 1;
      if(b[0]==="__unassigned__")return -1;
      return a[0].localeCompare(b[0]);
    });
    if(!ordered.length){
      host.append(make("p","billy-financial-empty","No approved expenses yet"));
      return;
    }
    for(const [value,count] of ordered){
      const label=value==="__unassigned__"?"Unassigned aircraft":value;
      const button=createButton("","billy-financial-nav-row",()=>openExpenseGroup(value));
      const copy=make("span","billy-financial-nav-copy");
      copy.append(make("strong","",label),
        make("small","",count+" expense"+(count===1?"":"s")));
      button.append(copy,make("span","billy-financial-nav-arrow","›"));
      host.append(button);
    }
  }
  function renderUnmatchedPayments(){
    const host=$("billyFinancialUnmatchedList");
    host.replaceChildren();
    const unmatched=issuesList().filter(x=>x.kind==="unmatched_payment");
    if(!unmatched.length){
      host.append(make("p","billy-financial-empty","No unmatched payment slips"));
      return;
    }
    for(const item of unmatched){
      const row=make("div","billy-financial-attention-item");
      const copy=make("div","billy-financial-attention-copy");
      copy.append(make("strong","",item.vendor||"Payment slip"));
      copy.append(make("small","",
        [item.date,item.amount_minor!==null&&item.currency?
          money(item.amount_minor,item.currency):"Amount not available",
          "Payment evidence not linked"].filter(Boolean).join(" · ")));
      const actions=make("div","billy-financial-row-actions");
      actions.append(createButton("Open","billy-financial-subtle",
        event=>void openDocument(item.id,event.currentTarget)));
      row.append(copy,actions);host.append(row);
    }
  }
  function renderNavigation(){
    const issues=issuesList();
    const unmatched=issues.filter(x=>x.kind==="unmatched_payment");
    if(nav.section==="attention"&&!issues.length)nav.section=null;
    const hasData=Boolean(state.data)&&!state.error;
    $("billyFinancialLanding").hidden=Boolean(nav.section);
    $("billyFinancialDetail").hidden=!nav.section;
    const attentionNav=$("billyFinancialAttentionNav");
    attentionNav.hidden=!hasData||!issues.length;
    $("billyFinancialAttentionBadge").textContent=String(issues.length);
    $("billyFinancialAttentionSubtitle").textContent=
      issues.length+" document"+(issues.length===1?"":"s")+" need review";
    $("billyFinancialExpensesSubtitle").textContent=
      opsList().length+" distinct approved expense"+
      (opsList().length===1?"":"s");
    const linked=Array.isArray(state.data?.linked_payments)?
      state.data.linked_payments.length:0;
    $("billyFinancialPaymentsSubtitle").textContent=
      linked+" linked · "+unmatched.length+" unmatched";
    $("billyFinancialUnmatchedCaption").textContent=
      unmatched.length+" payment slip"+(unmatched.length===1?"":"s")+" without a match";
    if(!nav.section)return;
    $("billyFinancialAttentionSection").hidden=nav.section!=="attention";
    $("billyFinancialExpensesSection").hidden=nav.section!=="expenses";
    $("billyFinancialPaymentsSection").hidden=nav.section!=="payments";
    $("billyFinancialInsightsSection").hidden=nav.section!=="insights";
    const expensePaths=$("billyFinancialExpensePaths");
    const expenseGroups=$("billyFinancialExpenseGroups");
    const expenseResults=$("billyFinancialExpenseResults");
    expensePaths.hidden=nav.section!=="expenses"||nav.expenseView!=="paths";
    expenseGroups.hidden=nav.section!=="expenses"||nav.expenseView!=="groups";
    expenseResults.hidden=nav.section!=="expenses"||nav.expenseView!=="list";
    if(nav.section==="expenses"&&nav.expenseView==="groups")showGroupChoices();
    const paymentPaths=$("billyFinancialPaymentPaths");
    paymentPaths.hidden=nav.section!=="payments"||nav.paymentView!=="paths";
    $("billyFinancialLinkedPanel").hidden=nav.section!=="payments"||nav.paymentView!=="linked";
    $("billyFinancialUnmatchedPanel").hidden=nav.section!=="payments"||nav.paymentView!=="unmatched";
    const sectionTitle=nav.section==="attention"?"Needs attention":
      nav.section==="insights"?"Insights":
      nav.section==="expenses"?
        (nav.expenseView==="list"&&nav.selected?
           nav.selected==="__unassigned__"?"Unassigned aircraft":nav.selected:
         nav.expenseView==="groups"?
           nav.expenseKind==="vendor"?"By vendor":"By aircraft":
         nav.expenseView==="list"?"All expenses":"Expenses"):
      nav.paymentView==="linked"?"Linked payments":
      nav.paymentView==="unmatched"?"Unmatched payment slips":"Payments";
    $("billyFinancialSectionTitle").textContent=sectionTitle;
    const backText=$("billyFinancialSectionBack").querySelector("span");
    backText.textContent=
      nav.section==="expenses"&&nav.expenseView==="list"?
        nav.expenseKind==="all"?"Expenses":
        nav.expenseKind==="vendor"?"By vendor":"By aircraft":
      nav.section==="expenses"&&nav.expenseView==="groups"?"Expenses":
      nav.section==="payments"&&nav.paymentView!=="paths"?"Payments":"Financial";
    const coverage=$("billyFinancialCoverage");
    coverage.hidden=!state.data?.partial;
    coverage.textContent=state.data?.partial?
      "Some records exceed the current financial query limit. Totals and lists may be incomplete.":"";
  }
  function renderFinancialOperations(){
    if(!$("billyFinancialLedger"))return;
    renderFinancialAttention();
    renderExpenseLedger();
    renderUnmatchedPayments();
    renderNavigation();
  }
  function render(){
    const groups=currencyGroups();
    if(!groups.some(g=>g.currency===state.currency))state.currency=groups[0]?.currency||null;
    fillSelect($("billyFinancialCurrency"));
    if(nav.section==="insights")chartBars($("billyFinancialChart"),activeGroup());
    const group=activeGroup();
    $("billyFinancialTotal").textContent=group?money(group.total_minor,group.currency):"-";
    const trend=state.data?.trend;
    $("billyFinancialPeriod").textContent=trend?
      (group?.documents??0)+" dated expense"+
       ((group?.documents??0)===1?"":"s")+" · "+
       trend.start_date+" – "+trend.end_date+
       (state.data?.operational_counts?.missing_date?
         " · Other records need review":""):
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
  for(const [id,section] of [
    ["billyFinancialAttentionNav","attention"],
    ["billyFinancialExpensesNav","expenses"],
    ["billyFinancialPaymentsNav","payments"],
    ["billyFinancialInsightsNav","insights"]]){
    $(id).addEventListener("click",()=>enterSection(section));
  }
  for(const [id,kind] of [
    ["billyFinancialByAircraft","aircraft"],
    ["billyFinancialByVendor","vendor"],
    ["billyFinancialAllExpenses","all"]]){
    $(id).addEventListener("click",()=>openExpensePath(kind));
  }
  for(const [id,kind] of [
    ["billyFinancialLinkedPayments","linked"],
    ["billyFinancialUnmatchedPayments","unmatched"]]){
    $(id).addEventListener("click",()=>openPaymentPath(kind));
  }
  $("billyFinancialSectionBack").addEventListener("click",backInFinancial);
  window.BillyFinancial={refresh};
  window.addEventListener("billy:account-ready",()=>{
    if(document.body.dataset.billyScreen==="financial")void refresh();
  });
  window.addEventListener("billy:document-approved",()=>{
    if(document.body.dataset.billyScreen==="financial")void refresh();
  });
})();
