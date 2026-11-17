/* Billy Cards 1.0 — masked card directory with actual approved evidence only. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const node=(tag,cls,text)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=String(text);
    return el;
  };
  const btn=(label,cls,fn)=>{
    const button=node("button",cls,label);button.type="button";
    button.addEventListener("click",fn);return button;
  };
  const money=(minor,currency)=>new Intl.NumberFormat("en-GB",{
    style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2
  }).format(minor/100);
  let data=null,error="",selected=null,expanded=false,formOpen=false,loading=null;
  const cards=()=>Array.isArray(data?.cards)?data.cards:[];
  async function request(path,body){
    if(!window.BillyAccounts?.active?.())throw Error("Sign in to view your team's cards");
    const api=window.BILLY_AUTH_CONFIG?.apiUrl;
    if(!api)throw Error("Cards service is not configured");
    const headers=await window.BillyAccounts.sessionHeaders();
    const res=await fetch(api+"/api/vision/"+path,{
      method:body?"POST":"GET",cache:"no-store",
      headers:body?{"Content-Type":"application/json",...headers}:headers,
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const payload=await res.json();
    if(!res.ok)throw Error(payload.detail||"Card request unavailable");
    return payload;
  }
  function cardName(card){
    return (card.program_label||card.display_currency||"CARD").toUpperCase();
  }
  function render(){
    const grid=$("billyFinancialCardGrid"),count=$("billyFinancialCardCount");
    const activity=$("billyFinancialCardActivity"),controls=$("billyFinancialCardControls");
    if(!grid||!count||!activity||!controls)return;
    count.textContent=data?cards().length+" cards · last 30 days":
      error||"Loading card activity";
    grid.replaceChildren();activity.replaceChildren();controls.replaceChildren();
    const items=expanded?cards():cards().slice(0,6);
    if(error)grid.append(node("p","billy-financial-empty",error));
    else if(!data)grid.append(node("p","billy-financial-empty","Loading cards…"));
    else if(!items.length)grid.append(node("p","billy-financial-empty","No cards registered"));
    for(const card of items){
      const cardButton=btn("","billy-fcard",()=>{
        selected=selected===card.id?null:card.id;render();
      });
      cardButton.setAttribute("aria-label",card.holder_label+" card ending "+card.last4);
      cardButton.setAttribute("aria-pressed",String(selected===card.id));
      cardButton.dataset.selected=String(selected===card.id);
      const visual=node("span","billy-fcard-art");
      visual.append(
        node("span","billy-fcard-kind",cardName(card)),
        node("span","billy-fcard-chip",""),
        node("span","billy-fcard-number","••••  ••••  "+card.last4),
        node("span","billy-fcard-holder",card.holder_label)
      );
      const amounts=node("span","billy-fcard-amounts");
      if(!card.transaction_count)
        amounts.append(node("span","billy-fcard-unavailable","No approved card evidence yet"));
      else{
        for(const total of card.totals)
          amounts.append(node("strong","",money(total.total_minor,total.currency)));
        amounts.append(node("small","",card.transaction_count+
          " source transaction"+(card.transaction_count===1?"":"s")));
      }
      cardButton.append(visual,amounts);
      grid.append(cardButton);
    }
    if(cards().length>6)
      controls.append(btn(expanded?"Show fewer":"Show all "+cards().length,
        "billy-financial-subtle",()=>{expanded=!expanded;render();}));
    if(data?.can_manage)
      controls.append(btn(formOpen?"Close card editor":"Add card",
        "billy-financial-subtle",()=>{formOpen=!formOpen;render();}));
    if(formOpen&&data?.can_manage){
      const form=node("form","billy-fcard-form");
      const holderLabel=node("label","","Holder");
      const holder=node("input");holder.required=true;holder.maxLength=80;
      holder.autocomplete="off";holder.placeholder="Surname or card label";
      holderLabel.append(holder);
      const numberLabel=node("label","","Last 4");
      const four=node("input");four.required=true;four.maxLength=4;
      four.inputMode="numeric";four.pattern="[0-9]{4}";
      four.autocomplete="off";four.placeholder="0000";numberLabel.append(four);
      const currencyLabel=node("label","","Card label");
      const currency=node("select");
      for(const [v,label] of [["EUR","EUR"],["RON","RON"],["REVOLUT","Revolut"]]){
        const opt=node("option","",label);opt.value=v;currency.append(opt);
      }
      currencyLabel.append(currency);
      const feedback=node("p","billy-fcard-feedback","");
      feedback.setAttribute("role","status");
      const save=node("button","billy-financial-match-confirm","Save card");
      save.type="submit";
      form.append(holderLabel,numberLabel,currencyLabel,save,feedback);
      form.addEventListener("submit",async event=>{
        event.preventDefault();
        if(!/^[0-9]{4}$/.test(four.value)){feedback.textContent="Enter four digits.";return;}
        save.disabled=true;feedback.textContent="Saving…";
        const revolut=currency.value==="REVOLUT";
        try{
          const result=await request("cards",{
            action:"add",last4:four.value,holder_label:holder.value.trim(),
            display_currency:revolut?null:currency.value,
            program_label:revolut?"REVOLUT":null
          });
          if(result.saved!==true)throw Error("Card was not saved");
          formOpen=false;expanded=true;await refresh();
        }catch(e){feedback.textContent=e.message||"Could not add card";save.disabled=false;}
      });
      controls.append(form);
    }
    const current=cards().find(item=>item.id===selected);
    if(current){
      const heading=node("div","billy-fcard-activity-head");
      heading.append(node("strong","",
        current.holder_label+" · "+current.last4));
      if(data?.can_manage){
        heading.append(btn("Archive card","billy-financial-subtle",async()=>{
          if(!window.confirm("Archive this card? Approved documents will not be deleted."))return;
          try{
            const response=await request("cards",{action:"archive",card_id:current.id});
            if(response.archived!==true)throw Error("Could not archive");
            selected=null;await refresh();
          }catch(e){error=e.message||"Could not archive";render();}
        }));
      }
      activity.append(heading);
      if(!current.transactions.length)
        activity.append(node("p","billy-financial-empty",
          "No eligible approved POS slips or explicit card-paid bills in the last 30 days."));
      for(const tx of current.transactions){
        const row=btn("","billy-fcard-transaction",async event=>{
          event.currentTarget.disabled=true;
          try{
            const reply=await request("assistant-source?record_id="+encodeURIComponent(tx.id));
            if(reply.record)window.BillyDocumentPreview?.open?.(reply.record);
          }catch(e){event.currentTarget.title=e.message||"Source unavailable";}
          finally{event.currentTarget.disabled=false;}
        });
        const details=node("span","billy-fcard-transaction-info");
        details.append(node("strong","",tx.vendor),
          node("small","",tx.date+" · "+
            (tx.source==="pos_slip"?"POS evidence":"Paid on bill")+
            (tx.settlement==="source_confirmed"?" · source confirmed":" · unverified")));
        row.append(details,node("span","billy-fcard-transaction-amount",
          money(tx.amount_minor,tx.currency)));
        activity.append(row);
      }
    }
    $("billyFinancialCardNote").textContent=data?
      "Evidence-based totals by transaction currency; no BNR conversion. "+
      (data.partial?"Archive incomplete — totals may be partial. ":"")+
      (data.without_card||data.unknown_card?
        (data.without_card||0)+" slips without card number · "+
        (data.unknown_card||0)+" unregistered card numbers. ":"")+
      "No balances or historical spending imported from JetRead.":
      "Card spending is calculated from approved Billy documents only.";
  }
  async function refresh(){
    if(loading)return loading;
    loading=(async()=>{
      try{data=await request("cards");error="";}
      catch(e){data=null;error=e.message||"Card catalog unavailable";}
      finally{loading=null;render();}
    })();
    return loading;
  }
  function init(){
    $("billyFinancialPaymentsNav")?.addEventListener("click",()=>void refresh());
    window.addEventListener("billy:document-approved",()=>{
      if(document.body.dataset.billyScreen==="financial"&&
         !$("billyFinancialPaymentsSection")?.hidden)void refresh();
    });
    render();
  }
  window.BillyFinancialCards={refresh};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();