/* Billy Accounts  ·  Supabase Auth + organization-scoped workspace.
   No password storage, ad-hoc tokens or organization privileges in client code. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const config = window.BILLY_AUTH_CONFIG || {};
  let client = null, user = null, organization = null, memberships = [];
  let mode = "login";
  let sequence = 0;
  const accountButton = $("accountButton");
  const gate = $("authGate");
  const login = $("accountForm");
  const setup = $("workspaceSetup");
  const accountPanel = $("accountPanel");
  const gateMessage = $("gateMessage");
  const gateHeading = $("gateHeading");
  const forms = ["login","signup","forgot","new-password"];

  function status(text, error = false) {
    gateMessage.textContent = text || "";
    gateMessage.classList.toggle("is-error", error);
    gateMessage.hidden = !text;
  }
  function closePanel() { accountPanel.hidden = true; }
  function resolveInitialAuth() {
    document.documentElement.dataset.billyAuthReady = "1";
    window.dispatchEvent(new Event("billy:auth-resolved"));
  }

  function firstNameFor(account) {
    const metadata = account?.user_metadata || {};
    const fullName = [metadata.full_name, metadata.name, metadata.display_name]
      .find(value => typeof value === "string" && value.trim());
    const raw = fullName
      ? fullName.trim().split(/\s+/)[0]
      : (account?.email || "").split("@")[0].split(/[._-]/)[0].replace(/\d+$/,"");
    const name = raw?.trim().slice(0,32) || "";
    return name ? name.charAt(0).toLocaleUpperCase() + name.slice(1) : "";
  }

  function closeProfileMenu() {
    $("profileMenu").hidden = true;
    accountButton.setAttribute("aria-expanded","false");
  }

  function toggleProfileMenu() {
    const menu = $("profileMenu");
    menu.hidden = !menu.hidden;
    accountButton.setAttribute("aria-expanded",String(!menu.hidden));
    if (!menu.hidden) $("profileMyAccount").focus();
  }

  function openAccountSheet(team = false) {
    closeProfileMenu();
    accountPanel.hidden = false;
    if (team) $("accountSwitcher").closest(".account-section")?.scrollIntoView({block:"nearest"});
  }

  function renderProfile(account) {
    $("accountButtonName").textContent = account?.email?.split("@")[0] || "Account";
  }
  function setGate(open) {
    gate.hidden = !open;
    document.body.classList.toggle("auth-locked", open);
    const studio = $("studioApp");
    if (open) studio.setAttribute("inert", "");
    else studio.removeAttribute("inert");
  }
  function showMode(value) {
    mode = forms.includes(value) ? value : "login";
    login.hidden = false;
    setup.hidden = true;
    $("accountPassword").hidden = (mode === "forgot");
    $("accountName").hidden = (mode !== "signup");
    $("accountEmail").hidden = (mode === "new-password");
    $("accountSubmit").textContent = {
      login:"Log in",signup:"Create account",forgot:"Send reset link","new-password":"Update password"
    }[mode];
    gateHeading.textContent = {
      login:"Welcome back.",signup:"Create your account.",forgot:"Reset your password.","new-password":"Choose a new password."
    }[mode];
    $("accountSwitch").hidden = mode === "new-password";
    $("accountSwitch").textContent = mode === "login" ? "New here? Create an account" : "Already have an account? Log in";
    $("accountForgot").hidden = mode !== "login";
    $("accountSubmit").disabled = false;
    $("accountEmailInput").required = mode !== "new-password";
    $("accountPasswordInput").required = mode !== "forgot";
    $("accountPasswordInput").autocomplete = mode === "new-password" || mode === "signup" ? "new-password" : "current-password";
    status("");
    setGate(true);
  }
  function fmtError(error) {
    return error?.message || "Unable to complete this request.";
  }
  function uuid(text) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
  }
  async function loadWorkspace() {
    const run = ++sequence;
    const {data: result, error} = await client.auth.getUser();
    if (run !== sequence) return;
    if(error || !result.user){
      user=null;organization=null;memberships=[];
      accountButton.hidden=true;closeProfileMenu();closePanel();showMode("login");resolveInitialAuth();return;
    }
    user=result.user;
    const {data, error:memError}=await client
      .from("organization_memberships")
      .select("organization_id,role,organizations(id,name)")
      .eq("user_id", user.id);
    if (run !== sequence) return;
    if(memError){
      status("Workspace database not ready. Apply the BillyDPI Supabase migration: "+fmtError(memError),true);
      gateHeading.textContent="Workspace configuration needed.";
      login.hidden=true;setup.hidden=true;setGate(true);resolveInitialAuth();return;
    }
    memberships=(data||[]).filter(item=>item.organizations?.id);
    if(!memberships.length){
      organization=null;login.hidden=true;setup.hidden=false;
      gateHeading.textContent="Your workspace.";
      accountButton.hidden=false;renderProfile(user);
      $("welcomeEmail").textContent=user.email||"";
      status("You can create a workspace or request to join an existing company team. Access is never granted automatically.");
      setGate(true);resolveInitialAuth();return;
    }
    const saved=sessionStorage.getItem("billy-active-organization");
    const selection=memberships.find(m=>m.organization_id===saved)||memberships[0];
    organization={id:selection.organization_id,name:selection.organizations.name,role:selection.role};
    sessionStorage.setItem("billy-active-organization",organization.id);
    accountButton.hidden=false;
    renderProfile(user);
    $("teamName").textContent=organization.name;
    $("teamRole").textContent=organization.role.toUpperCase();
    $("teamId").value=organization.id;
    $("teamEmail").textContent=user.email||"";
    $("accountSwitcher").replaceChildren();
    for(const m of memberships){
      const option=document.createElement("option");
      option.value=m.organization_id;option.textContent=m.organizations.name;
      $("accountSwitcher").appendChild(option);
    }
    $("accountSwitcher").value=organization.id;
    $("adminJoinSection").hidden=organization.role!=="owner";
    closePanel();
    setGate(false);
    resolveInitialAuth();
    window.dispatchEvent(new CustomEvent("billy:account-ready",{detail:{
      organizationId:organization.id, role:organization.role,
      firstName:firstNameFor(user)
    }}));
    if(organization.role==="owner") refreshJoinRequests();
  }
  async function refreshJoinRequests(){
    if(!organization||organization.role!=="owner")return;
    const {data,error}=await client.from("organization_join_requests")
      .select("id,user_id,created_at,status")
      .eq("organization_id",organization.id).eq("status","pending");
    if(error){$("joinQueue").textContent=fmtError(error);return;}
    const requests=data||[];
    const profiles=await client.from("account_profiles").select("user_id,display_name,email")
      .in("user_id",requests.length?requests.map(x=>x.user_id):["00000000-0000-0000-0000-000000000000"]);
    const lookup=new Map((profiles.data||[]).map(p=>[p.user_id,p]));
    const container=$("joinQueue");container.replaceChildren();
    if(!requests.length){container.textContent="No pending requests.";return;}
    for(const item of requests){
      const profile=lookup.get(item.user_id);
      const card=document.createElement("div");card.className="join-request";
      const name=document.createElement("strong");name.textContent=profile?.email||profile?.display_name||("Account "+item.user_id.slice(0,8));
      const approve=document.createElement("button");approve.type="button";approve.textContent="Approve as operator";
      approve.addEventListener("click",async()=>{
        approve.disabled=true;
        const {error:insertError}=await client.from("organization_memberships")
          .insert({organization_id:organization.id,user_id:item.user_id,role:"operator"});
        if(insertError){approve.disabled=false;alert("Approval failed: "+fmtError(insertError));return;}
        await client.from("organization_join_requests")
          .update({status:"approved",reviewed_at:new Date().toISOString()}).eq("id",item.id);
        refreshJoinRequests();
      });
      card.append(name,approve);container.appendChild(card);
    }
  }
  async function handleAccount(event){
    event.preventDefault();
    if(!client)return;
    $("accountSubmit").disabled=true;status("");
    const email=$("accountEmailInput").value.trim();
    const password=$("accountPasswordInput").value;
    try{
      let data,error;
      if(mode==="login"){
        ({data,error}=await client.auth.signInWithPassword({email,password}));
      }else if(mode==="signup"){
        ({data,error}=await client.auth.signUp({
          email,password,options:{
            data:{full_name:$("accountNameInput").value.trim()},
            emailRedirectTo:location.origin+location.pathname
          }
        }));
      }else if(mode==="forgot"){
        ({error}=await client.auth.resetPasswordForEmail(email,{
          redirectTo:location.origin+location.pathname
        }));
      }else{
        ({error}=await client.auth.updateUser({password}));
      }
      if(error)throw error;
      if(mode==="signup"&&!data.session)status("Check your email to confirm the account, then log in.");
      else if(mode==="forgot")status("If the address is registered, a password reset email will arrive.");
      else if(mode==="new-password"){status("Password updated.");await loadWorkspace();}
      else await loadWorkspace();
    }catch(error){status(fmtError(error),true);}
    finally{$("accountSubmit").disabled=false;}
  }
  async function createWorkspace(event){
    event.preventDefault();const name=$("workspaceName").value.trim();
    if(name.length<2){status("Enter a team name (at least 2 characters).",true);return;}
    const {error}=await client.from("organizations").insert({name,created_by:user.id});
    if(error){status(fmtError(error),true);return;}
    await loadWorkspace();
  }
  async function joinWorkspace(event){
    event.preventDefault();const id=$("workspaceInvite").value.trim();
    if(!uuid(id)){status("Use a valid organization ID shared by your team owner.",true);return;}
    const {error}=await client.from("organization_join_requests").insert({organization_id:id,user_id:user.id,status:"pending"});
    if(error){status("Request could not be created. Ask the owner to verify the team ID, or check if a request already exists.",true);return;}
    status("Join request sent. An organization owner must approve you before you can access company documents.");
  }
  function initialize(){
    setGate(true);
    const ready=config.url&&config.publishableKey&&/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url);
    if(!ready||!window.supabase?.createClient){
      login.hidden=true;setup.hidden=true;
      gateHeading.textContent="BillyDPI Accounts setup.";
      status("The team identity provider is not connected yet. Configure the public Supabase project URL and publishable key in account-config.js and apply the database migration. No documents can be processed while accounts are unavailable.",true);
      resolveInitialAuth();
      return;
    }
    client=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    client.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY")setTimeout(()=>showMode("new-password"),0);
      else if(event==="SIGNED_OUT"){
        user=null;organization=null;memberships=[];sequence++;closeProfileMenu();
        setTimeout(()=>showMode("login"),0);
      }else if(event==="SIGNED_IN"||event==="INITIAL_SESSION"||event==="TOKEN_REFRESHED"){
        if(session?.access_token)setTimeout(()=>loadWorkspace(),0);
      }
    });
    loadWorkspace();
  }
  $("accountForm").addEventListener("submit",handleAccount);
  $("accountSwitch").addEventListener("click",()=>showMode(mode==="login"?"signup":"login"));
  $("accountForgot").addEventListener("click",()=>showMode("forgot"));
  $("createWorkspace").addEventListener("submit",createWorkspace);
  $("joinWorkspace").addEventListener("submit",joinWorkspace);
  accountButton.addEventListener("click",toggleProfileMenu);
  $("profileMyAccount").addEventListener("click",()=>openAccountSheet(false));
  $("profileWorkspace").addEventListener("click",()=>openAccountSheet(true));
  $("profileSignOut").addEventListener("click",async()=>{
    closeProfileMenu();
    if(client){await client.auth.signOut();location.reload();}
  });
  document.addEventListener("click",event=>{
    if(!$("profileWrap").contains(event.target))closeProfileMenu();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"){
      closeProfileMenu();
      if(!accountPanel.hidden)closePanel();
    }
  });
  $("accountClose").addEventListener("click",closePanel);
  $("setupSignOut").addEventListener("click",async()=>{if(client){await client.auth.signOut();location.reload();}});
  $("accountSignOut").addEventListener("click",async()=>{
    if(client){await client.auth.signOut();location.reload();}
  });
  $("copyTeamId").addEventListener("click",()=>navigator.clipboard.writeText($("teamId").value));
  $("refreshRequests").addEventListener("click",refreshJoinRequests);
  $("accountSwitcher").addEventListener("change",(event)=>{
    sessionStorage.setItem("billy-active-organization",event.target.value);
    location.reload();
  });

  window.BillyAccounts={
    configured:()=>Boolean(client),
    active:()=>Boolean(client&&user&&organization),
    firstName:()=>firstNameFor(user),
    sessionHeaders:async()=>{
      if(!client||!organization)throw Error("Sign in to an approved team first.");
      const {data,error}=await client.auth.getSession();
      if(error||!data.session?.access_token)throw Error("Session expired; sign in again.");
      return {"Authorization":"Bearer "+data.session.access_token,"X-Billy-Organization":organization.id,"apikey":config.publishableKey};
    },
  };
  initialize();
})();
