/* Piggybank's chat-only character voice.
   The HUD, monetary amounts, evidence caveats and documents stay factual.
   No user text is ever interpolated into a pun or stored. */
(() => {
  "use strict";

  const catalogue={
    ro:{
      welcomeTitle:"Piggy e numai urechi.",
      welcomeSubtitle:"Costuri, zboruri, documente. Am rât pentru detalii.",
      input:"Întreabă-l pe Piggy…",
      prompts:[
        {label:"Costuri pe furnizori",question:"Grupează cheltuielile pe furnizori în ultimele 30 de zile."},
        {label:"Documente aprobate",question:"Ce documente aprobate avem?"}
      ],
      hello:[
        "Groh-groh! Sunt Piggy. Ce scormonim astăzi?",
        "Oink! Am rât pentru detalii. Ce vrei să aflăm?"
      ],
      loading:[
        "Îmi bag râtul prin date…",
        "Scormonesc prin documente…",
        "Urmăresc firul cifrelor…"
      ],
      report:[
        "Oink! Am scormonit prin cifre. Raportul e gata în HUD.",
        "Am pus râtul pe treabă. Raportul te așteaptă în HUD.",
        "Groh! Am pregătit raportul în HUD."
      ],
      legacyReport:[
        "Am scormonit prin cheltuieli. Rezultatele sunt în HUD.",
        "Am pus râtul pe urma costurilor. Uite raportul în HUD."
      ],
      blocked:"Am găsit o lacună în date. În HUD vezi ce pot confirma și ce lipsește.",
      answer:[
        "Am scormonit printre documente. Uite ce pot confirma.",
        "Am pus râtul pe urma informațiilor. Iată rezultatul."
      ],
      empty:"De data asta, râtul meu n-a găsit sume validate pentru selecție.",
      misunderstood:"Hopa, am pierdut urma. Poți reformula?",
      errorIntro:"Mi s-a încurcat puțin râtul în date.",
      errorRetry:"Încearcă din nou sau reformulează întrebarea.",
      auth:"Piggy are nevoie să fii conectat la echipa Billy pentru a verifica documentele.",
      inputLimit:"Trimite-mi o întrebare între 3 și 400 de caractere.",
      hudButton:"Deschide HUD-ul",
      hudUnavailable:"Raportul e gata, dar nu pot deschide HUD-ul. Încearcă din nou.",
      greetingAction:"Salută-l pe Piggy",
      nextByDay:"Pe zile",
      nextByVendor:"Pe furnizori",
      nextCompare:"Compară perioadele"
    },
    en:{
      welcomeTitle:"Piggy's all ears.",
      welcomeSubtitle:"Costs, flights, documents. I've got a snout for details.",
      input:"Ask Piggy anything…",
      prompts:[
        {label:"Spending by vendor",question:"Group expenses by vendor over the last 30 days."},
        {label:"Approved documents",question:"What approved documents do we have?"}
      ],
      hello:[
        "Oink oink! I'm Piggy. What shall we dig into?",
        "Snout's ready! What can I help you sniff out?"
      ],
      loading:[
        "Sniffing through the numbers…",
        "Digging through the documents…",
        "Following the trail of figures…"
      ],
      report:[
        "Oink! I've sniffed out your report. It's ready in the HUD.",
        "I've put my snout to work. Your report is on the HUD.",
        "Digging complete! Your report is ready in the HUD."
      ],
      legacyReport:[
        "I sniffed out the expenses. The results are in the HUD.",
        "I've followed the money trail. Your report is on the HUD."
      ],
      blocked:"I found a gap in the evidence. The HUD shows what I can confirm and what's missing.",
      answer:[
        "I've had a good snuffle through the records. Here's what I can confirm.",
        "I followed the paper trail. Here's what I found in the records."
      ],
      empty:"My snout couldn't find validated expenses for that selection.",
      misunderstood:"Oops, I lost the scent. Could you rephrase that?",
      errorIntro:"My snout hit a snag in the data.",
      errorRetry:"Please try again or rephrase your question.",
      auth:"Piggy needs you signed in to your Billy team to check its documents.",
      inputLimit:"Ask me something between 3 and 400 characters.",
      hudButton:"Open HUD",
      hudUnavailable:"The report is ready, but I couldn't open the HUD. Please try again.",
      greetingAction:"Say hi to Piggy",
      nextByDay:"By day",
      nextByVendor:"By vendor",
      nextCompare:"Compare periods"
    }
  };
  const counter=Object.create(null);
  const normalize=language=>language==="ro"?"ro":"en";
  function detect(text,fallback="en"){
    const value=String(text||"").normalize("NFKD")
      .replace(/[\u0300-\u036f]/g,"").toLowerCase();
    if(/[ăâîșşțţ]/i.test(String(text||"")))return "ro";
    const rom=/\b(acum|arata|arata-mi|cheltuieli|cheltuit|costuri|zboruri|zbor|documente|document|grupeaza|furnizori|furnizor|facturi|factura|bonuri|bani|care|sunt|avem|cuvinte|cate|cati|cat|vreau|ultima|ultimele|ultimii|zile|zi|azi|salut|buna|groh|intreaba|perioada|precedenta|deci|pentru|afiseaza|raportul)\b/g;
    const eng=/\b(now|show|me|spending|expenses|flight|flights|documents|document|group|vendor|vendors|how|many|what|please|costs|report|last|days|today|hello|hey|hi|oink|previous|period|compare|by|from)\b/g;
    const ro=(value.match(rom)||[]).length;
    const en=(value.match(eng)||[]).length;
    return ro>en?"ro":en>ro?"en":normalize(fallback);
  }
  function defaultLanguage(browserLanguage){
    return /^ro(?:-|$)/i.test(String(browserLanguage||""))?"ro":"en";
  }
  function get(key,language){
    const entry=catalogue[normalize(language)][key];
    if(typeof entry!=="string")throw Error("Piggy copy key unavailable");
    return entry;
  }
  function next(key,language){
    const lng=normalize(language),list=catalogue[lng][key];
    if(!Array.isArray(list)||!list.length)throw Error("Piggy dialogue unavailable");
    const counterKey=lng+":"+key;
    const index=counter[counterKey]||0;
    counter[counterKey]=index+1;
    return list[index%list.length];
  }
  function prompts(language){
    return catalogue[normalize(language)].prompts.map(({label,question})=>({label,question}));
  }
  function isGreeting(text){
    const value=String(text||"").normalize("NFKD")
      .replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    return /^(?:(?:hi|hey|hello|salut|buna|neata|oink|groh(?:-groh)?)(?:[!,.\s]+(?:piggy|piggybank))?|(?:piggy|piggybank)[!,.\s]*(?:hi|hello|salut|oink|groh)?)[!?.\s]*$/.test(value);
  }
  function followups(result,language){
    const plan=result?.plan;
    if(!result?.analytics||result.blocked||!plan)return [];
    const lang=normalize(language);
    const actions=[];
    if(plan.group_by==="day")
      actions.push({label:get("nextByVendor",lang),question:lang==="ro"?
        "Acum pe furnizori.":"Now by vendor."});
    else actions.push({label:get("nextByDay",lang),question:lang==="ro"?
      "Acum arată-mi evoluția pe zile.":"Now show daily trend."});
    if(plan.start_date&&plan.end_date&&!plan.compare_previous)
      actions.push({label:get("nextCompare",lang),question:lang==="ro"?
        "Compară cu perioada precedentă.":"Compare with the previous period."});
    return actions;
  }
  window.PiggyPersona={detect,defaultLanguage,get,next,prompts,isGreeting,followups};
})();