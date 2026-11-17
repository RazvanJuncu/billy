/* Piggybank's chat-only character voice.
   The HUD, monetary amounts, evidence caveats and documents stay factual.
   No user text is ever interpolated into a pun or stored. */
(() => {
  "use strict";

  const catalogue={
    ro:{
      welcomeTitle:"Piggy e numai urechi.",
      welcomeSubtitle:"Costuri, zboruri, documente. Mă ocup de detalii.",
      input:"Întreabă-l pe Piggy…",
      prompts:[
        {label:"Costuri pe furnizori",question:"Grupează cheltuielile pe furnizori în ultimele 30 de zile."},
        {label:"Documente aprobate",question:"Ce documente aprobate avem?"}
      ],
      hello:[
        "Salut! Sunt Piggy. Cu ce te pot ajuta?",
        "Salut! Ce ai vrea să verificăm?"
      ],
      loading:[
        "Verific datele…",
        "Analizez documentele…",
        "Pregătesc răspunsul…"
      ],
      report:[
        "Raportul este pregătit. Îl găsești în HUD.",
        "Am terminat analiza. Detaliile sunt în HUD.",
        "Raportul este disponibil în HUD."
      ],
      legacyReport:[
        "Am verificat cheltuielile. Rezultatele sunt în HUD.",
        "Raportul este gata. Îl poți consulta în HUD."
      ],
      blocked:"Nu pot confirma toate informațiile din datele disponibile. În HUD vezi ce este verificat și ce lipsește.",
      answer:[
        "Am verificat documentele. Iată ce pot confirma.",
        "Iată ce rezultă din datele disponibile."
      ],
      empty:"Nu am găsit cheltuieli validate pentru această selecție.",
      misunderstood:"Nu sunt sigur că am înțeles. Poți reformula?",
      errorIntro:"Am întâmpinat o problemă la verificarea datelor.",
      errorRetry:"Încearcă din nou sau reformulează întrebarea.",
      auth:"Conectează-te la echipa Billy pentru a verifica documentele.",
      inputLimit:"Trimite o întrebare între 3 și 400 de caractere.",
      hudButton:"Deschide HUD-ul",
      hudUnavailable:"Raportul este gata, dar nu pot deschide HUD-ul. Încearcă din nou.",
      greetingAction:"Salută-l pe Piggy",
      nextByDay:"Pe zile",
      nextByVendor:"Pe furnizori",
      nextCompare:"Compară perioadele"
    },
    en:{
      welcomeTitle:"Piggy's all ears.",
      welcomeSubtitle:"Costs, flights, documents. I'll handle the details.",
      input:"Ask Piggy anything…",
      prompts:[
        {label:"Spending by vendor",question:"Group expenses by vendor over the last 30 days."},
        {label:"Approved documents",question:"What approved documents do we have?"}
      ],
      hello:[
        "Hey! I'm Piggy. What can I help you with?",
        "Hello! What would you like me to check?"
      ],
      loading:[
        "Checking the data…",
        "Reviewing the documents…",
        "Preparing your answer…"
      ],
      report:[
        "Your report is ready in the HUD.",
        "Analysis complete. The details are in the HUD.",
        "Your report is available in the HUD."
      ],
      legacyReport:[
        "I've reviewed the expenses. The results are in the HUD.",
        "The report is ready. You can view it in the HUD."
      ],
      blocked:"I can't confirm everything from the available records. The HUD shows what's verified and what's missing.",
      answer:[
        "I've checked the documents. Here's what I can confirm.",
        "Here's what the available records show."
      ],
      empty:"No validated expenses match that selection.",
      misunderstood:"I'm not sure I understood. Could you rephrase that?",
      errorIntro:"I ran into a problem checking the data.",
      errorRetry:"Please try again or rephrase your question.",
      auth:"Sign in to your Billy team to check its documents.",
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
  // Piggy always greets in English; later messages still choose their language.
  // Browser/device locale must not determine the initial character voice.
  function defaultLanguage(){return "en";}
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