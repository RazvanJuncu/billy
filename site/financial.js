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
remove mini caption    const links=Array.isArray(state.data?.linked_payments)?state.data.linked_payments:[];
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
  window.BillyFinancial={refresh};
  window.addEventListener("billy:account-ready",()=>{
    if(document.body.dataset.billyScreen==="financial")void refresh();
  });
  window.addEventListener("billy:document-approved",()=>{
    if(document.body.dataset.billyScreen==="financial")void refresh();
  });
})();
