import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url),React=require("react");
function mount(initialMode="signup",respond=async url=>Response.json(url.endsWith("/get-session")?null:{ok:true})){
 const values=[],refs=[];let cursor=0,refCursor=0,effectCursor=0;const effects=new Map();
 let unmounted=false;const writesAfterUnmount=[];const calls=[],redirects=[];const router={replace:path=>redirects.push(path)};
 const react={...React,useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],value=>{if(unmounted)writesAfterUnmount.push(i);values[i]=typeof value==="function"?value(values[i]):value;}];},useRef(initial){return refs[refCursor++]??={current:initial};},useEffect(fn,deps){const i=effectCursor++,previous=effects.get(i);if(!previous||deps.some((value,j)=>value!==previous.deps[j])){previous?.cleanup?.();effects.set(i,{deps,cleanup:fn()});}}};
 function load(file){const target={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:target,exports:target.exports,AbortController,fetch:async(url,options)=>{calls.push({url,options});return respond(url,options);},require:id=>id==="react"?react:id==="next/link"?({children,...props})=>React.createElement("a",props,children):id==="@/components/MemberAccessNavigation"?{...load("../src/components/MemberAccessNavigation.tsx"),MemberAccessNavigation:()=>null}:id==="next/navigation"?{useRouter:()=>router}:id==="@/components/MemberRadioHistory"?{MemberRadioHistory:()=>null}:id==="@/lib/member-terms"?load("../src/lib/member-terms.ts"):require(id)});return target.exports;}
 const component=load("../src/components/MemberAccount.tsx").MemberAccount;
 const render=()=>{cursor=refCursor=effectCursor=0;return component({initialMode});};
 const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));return render();};
 render();
 return{render,settle,calls,redirects,writesAfterUnmount,unmount(){unmounted=true;for(const effect of effects.values())effect.cleanup?.();}};
}
function find(tree,predicate){if(!tree||typeof tree!=="object")return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
const markup=tree=>require("react-dom/server").renderToStaticMarkup(tree);
const form=tree=>find(tree,node=>node.type==="form");
const button=(tree,label)=>find(tree,node=>node.type==="button"&&node.props.children===label);
function fill(ui){for(const [autocomplete,value]of [["nickname","Example Artist"],["email","artist@example.invalid"],["new-password","synthetic-test-password"]]){const input=find(ui.render(),node=>node.type==="input"&&node.props.autoComplete===autocomplete);assert.ok(input);input.props.onChange({target:{value}});}}
const signupCalls=ui=>ui.calls.filter(call=>call.url.endsWith("/sign-up/email"));
async function review(ui){await ui.settle();fill(ui);await form(ui.render()).props.onSubmit({preventDefault(){}});const tree=ui.render();assert.equal(signupCalls(ui).length,0);assert.match(markup(tree),/Before you join the Network/);return tree;}
const accept=ui=>find(ui.render(),node=>node.type==="input"&&node.props.type==="checkbox").props.onChange({target:{checked:true}});

test("signup reviews terms before any account creation and refuses unchecked acceptance",async()=>{
 const ui=mount();const tree=await review(ui);
 assert.equal(signupCalls(ui).length,0);
 const html=markup(tree);
 assert.match(html,/Before you join the Network/);
 assert.match(html,/By signing up, you agree to/);
 assert.match(html,/\/legal#terms/);assert.match(html,/\/legal#privacy/);
 assert.match(html,/interdimensional/);
 const checkbox=find(tree,node=>node.type==="input"&&node.props.type==="checkbox");
 assert.ok(checkbox?.props.required);assert.equal(checkbox.props.checked,false);
 assert.equal(button(tree,"Agree and create account").props.disabled,true);
 await form(tree).props.onSubmit({preventDefault(){}});
 assert.equal(signupCalls(ui).length,0);
 assert.match(markup(ui.render()),/confirm you are at least 13/);
});

test("accepted signup leaves a verification next step instead of a second signup form",async()=>{
 const ui=mount();await review(ui);accept(ui);
 assert.equal(button(ui.render(),"Agree and create account").props.disabled,false);
 await form(ui.render()).props.onSubmit({preventDefault(){}});
 assert.equal(signupCalls(ui).length,1);
 const payload=JSON.parse(signupCalls(ui)[0].options.body);
 assert.equal(payload.termsAccepted,true);assert.equal(payload.termsVersion,"1.4");
 assert.equal(payload.email,"artist@example.invalid");
 const tree=await ui.settle();
 assert.match(markup(tree),/Check your email/);
 assert.ok(!form(tree),"signup cannot be submitted again after the successful request");
 assert.equal(find(tree,node=>node.type==="input"&&node.props.type==="password"),null);
 assert.match(markup(tree),/artist@example.invalid/);
 assert.doesNotMatch(markup(tree),/email (?:has been|was) sent|successfully delivered|Member · Active/);
 button(tree,"Sign in").props.onClick();
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.type==="password").props.value,"");
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.value,"artist@example.invalid");
 button(ui.render(),"Create account").props.onClick();
 await form(ui.render()).props.onSubmit({preventDefault(){}});
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.type==="checkbox").props.checked,false);
 assert.equal(signupCalls(ui).length,1);
});

test("editing signup details or switching to sign in cannot reuse acceptance",async()=>{
 const ui=mount();await review(ui);accept(ui);
 button(ui.render(),"Back to account details").props.onClick();
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.value,"artist@example.invalid");
 await form(ui.render()).props.onSubmit({preventDefault(){}});
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.type==="checkbox").props.checked,false);
 button(ui.render(),"Sign in").props.onClick();
 assert.doesNotMatch(markup(ui.render()),/Before you join the Network/);
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.type==="password").props.value,"");
});

test("entry choices show the selected route before its form and carry actionable focus styles",async()=>{
 const ui=mount("signin");const tree=await ui.settle();
 const choices=find(tree,node=>node.props?.["aria-label"]==="Account access");assert.ok(choices);
 assert.equal(button(choices,"Sign in").props["aria-pressed"],true);
 assert.equal(button(choices,"Create account").props["aria-pressed"],false);
 assert.ok(markup(tree).indexOf('aria-label="Account access"')<markup(tree).indexOf("<form"));
 for(const label of ["Sign in","Create account"]){assert.match(button(choices,label).props.className,/cursor-pointer/);assert.match(button(choices,label).props.className,/focus-visible:/);}
 button(choices,"Create account").props.onClick();
 assert.ok(find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="nickname"));
 assert.ok(find(ui.render(),node=>node.props?.["aria-current"]==="step"));
});

test("account creation names the pending action and blocks repeat submission until it settles",async()=>{
 let release;const response=new Promise(resolve=>{release=resolve;});
 const ui=mount("signup",async url=>url.endsWith("/sign-up/email")?response:Response.json(null));
 await review(ui);accept(ui);
 const submission=form(ui.render()).props.onSubmit({preventDefault(){}});
 const waiting=ui.render();
 assert.match(markup(find(waiting,node=>node.props?.role==="status")),/Creating account/);
 assert.equal(button(waiting,"Creating account…").props.disabled,true);
 assert.equal(button(waiting,"Back to account details").props.disabled,true);
 await form(waiting).props.onSubmit({preventDefault(){}});
 assert.equal(signupCalls(ui).length,1);
 release(Response.json({ok:true}));await submission;
 assert.equal(form(ui.render()),null);
});

test("a failed signup keeps details and allows a deliberate retry rather than showing verification",async()=>{
 const ui=mount("signup",async url=>url.endsWith("/sign-up/email")?Response.json({code:"NAME_UNAVAILABLE"},{status:400}):Response.json(null));
 await review(ui);accept(ui);await form(ui.render()).props.onSubmit({preventDefault(){}});
 const tree=ui.render();
 assert.match(markup(find(tree,node=>node.props?.role==="alert")),/display name is unavailable/);
 assert.ok(form(tree));assert.equal(button(tree,"Agree and create account").props.disabled,false);
 button(tree,"Back to account details").props.onClick();
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="nickname").props.value,"Example Artist");
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.value,"artist@example.invalid");
});

test("resending verification stays on the next step and reports a request without claiming delivery",async()=>{
 const ui=mount();await review(ui);accept(ui);await form(ui.render()).props.onSubmit({preventDefault(){}});
 const resend=button(ui.render(),"Request another verification link");assert.ok(resend);resend.props.onClick();await ui.settle();
 assert.equal(ui.calls.filter(call=>call.url.endsWith("/send-verification-email")).length,1);
 assert.equal(form(ui.render()),null);
 assert.match(markup(find(ui.render(),node=>node.props?.role==="status")),/If verification is needed/);
 assert.doesNotMatch(markup(ui.render()),/email (?:has been|was) sent|successfully delivered/);
});

test("recovery identifies the reset-link request while it is pending",async()=>{
 let release;const response=new Promise(resolve=>{release=resolve;});
 const ui=mount("recovery",async url=>url.endsWith("/request-password-reset")?response:Response.json(null));await ui.settle();
 find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.onChange({target:{value:"artist@example.invalid"}});
 const submission=form(ui.render()).props.onSubmit({preventDefault(){}});
 assert.match(markup(find(ui.render(),node=>node.props?.role==="status")),/Requesting reset link/);
 assert.equal(button(ui.render(),"Requesting reset link…").props.disabled,true);
 release(Response.json({ok:true}));await submission;
 assert.match(markup(ui.render()),/If this email has an account/);
});

test("signup acceptance version matches the canonical Legal Center",()=>{
 const terms=fs.readFileSync(new URL("../src/lib/member-terms.ts",import.meta.url),"utf8");
 const version=terms.match(/MEMBER_TERMS_VERSION = "([^"]+)"/)?.[1];assert.ok(version);
 const legal=fs.readFileSync(new URL("../docs/legal/BARCODE_NETWORK_LEGAL_CENTER_2026-06-13.md",import.meta.url),"utf8");
 assert.ok(legal.includes("**Legal Center Version:** "+version));
 assert.doesNotMatch(legal,/Display names are not unique/);
});
const signinMember={id:"member-id",name:"Example Member",email:"member@example.invalid",emailVerified:true};
const dashboardAccess=(changes={})=>({user:{id:"member-id",name:"Example Member"},session:{expiresAt:"2099-01-01T00:00:00Z"},access:{owner:false,crew:false,permissions:[],availablePermissions:[]},...changes});
async function signIn(ui){
 await ui.settle();
 find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.onChange({target:{value:"member@example.invalid"}});
 find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="current-password").props.onChange({target:{value:"synthetic-test-password"}});
 await form(ui.render()).props.onSubmit({preventDefault(){}});
}
function signinUI(access){
 let signedIn=false;
 return mount("signin",async url=>{
  if(url.endsWith("/sign-in/email")){signedIn=true;return Response.json({ok:true});}
  if(url.endsWith("/get-session"))return Response.json(signedIn?{user:signinMember}:null);
  if(url==="/api/member/access")return access instanceof Error?Promise.reject(access):Response.json(access);
  throw new Error("Unexpected account request");
 });
}

test("successful sign in uses fresh matching access and opens Owner before Crew",async()=>{
 const ui=signinUI(dashboardAccess({access:{owner:true,crew:true,permissions:[],availablePermissions:[]}}));
 await signIn(ui);
 assert.deepEqual(ui.redirects,["/account/owner"]);
 const reads=ui.calls.filter(call=>call.url==="/api/member/access");assert.equal(reads.length,1);
 assert.equal(reads[0].options.cache,"no-store");assert.equal(reads[0].options.credentials,"same-origin");
 assert.ok(ui.calls.findIndex(call=>call.url==="/api/member/access")>ui.calls.findIndex(call=>call.url.endsWith("/sign-in/email")));
 assert.match(markup(ui.render()),/Opening your Owner dashboard/);
});

test("Crew sign in opens the existing Crew dashboard",async()=>{
 const ui=signinUI(dashboardAccess({access:{owner:false,crew:true,permissions:[],availablePermissions:[]}}));
 await signIn(ui);assert.deepEqual(ui.redirects,["/account/crew"]);
});

test("ordinary Member or Artist sign in retains the existing account dashboard",async()=>{
 const ui=signinUI(dashboardAccess());await signIn(ui);
 assert.deepEqual(ui.redirects,[]);assert.match(markup(ui.render()),/Your account/);
 assert.match(markup(ui.render()),/Signed in/);
});

test("post-signin navigation fails closed for mismatched, expired, malformed or unavailable access",async()=>{
 for(const access of [dashboardAccess({user:{id:"other-member",name:"Other"}}),dashboardAccess({session:{expiresAt:"2000-01-01T00:00:00Z"}}),dashboardAccess({access:{owner:"true",crew:false,permissions:[],availablePermissions:[]}}),null,new Error("Transport unavailable")]){
  const ui=signinUI(access);await signIn(ui);assert.deepEqual(ui.redirects,[]);
  assert.match(markup(ui.render()),/Your account/);
  assert.doesNotMatch(markup(ui.render()),/Opening your (?:Owner|Crew) dashboard/);
 }
});

test("leaving during a slow dashboard lookup cancels navigation even if the response arrives late",async()=>{
 let signedIn=false,releaseAccess;const delayedAccess=new Promise(resolve=>{releaseAccess=resolve;});
 const ui=mount("signin",async url=>{
  if(url.endsWith("/sign-in/email")){signedIn=true;return Response.json({ok:true});}
  if(url.endsWith("/get-session"))return Response.json(signedIn?{user:signinMember}:null);
  if(url==="/api/member/access")return delayedAccess;
  throw new Error("Unexpected account request");
 });
 await ui.settle();
 find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.onChange({target:{value:"member@example.invalid"}});
 find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="current-password").props.onChange({target:{value:"synthetic-test-password"}});
 const submission=form(ui.render()).props.onSubmit({preventDefault(){}});
 await ui.settle();
 const accessRequest=ui.calls.find(call=>call.url==="/api/member/access");assert.ok(accessRequest);
 ui.unmount();
 releaseAccess(Response.json(dashboardAccess({access:{owner:true,crew:true,permissions:[],availablePermissions:[]}})));
 await submission;
 assert.deepEqual(ui.redirects,[],"a finished sign-in must not pull the user back after they leave");
 assert.deepEqual(ui.writesAfterUnmount,[],"late access cannot restore feedback or private account state");
 assert.equal(accessRequest.options.signal?.aborted,true);
});

test("leaving during sign-in session refresh cannot restore a private name or begin dashboard lookup",async()=>{
 let reads=0,releaseSession;const delayedSession=new Promise(resolve=>{releaseSession=resolve;});
 const ui=mount("signin",async url=>{
  if(url.endsWith("/sign-in/email"))return Response.json({ok:true});
  if(url.endsWith("/get-session"))return ++reads===1?Response.json(null):delayedSession;
  if(url==="/api/member/access")return Response.json(dashboardAccess({access:{owner:true,crew:false,permissions:[],availablePermissions:[]}}));
  throw new Error("Unexpected account request");
 });
 await ui.settle();
 find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.onChange({target:{value:"member@example.invalid"}});
 find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="current-password").props.onChange({target:{value:"synthetic-test-password"}});
 const submission=form(ui.render()).props.onSubmit({preventDefault(){}});
 await ui.settle();ui.unmount();
 releaseSession(Response.json({user:signinMember}));await submission;
 assert.equal(ui.calls.filter(call=>call.url==="/api/member/access").length,0);
 assert.deepEqual(ui.redirects,[]);assert.deepEqual(ui.writesAfterUnmount,[]);
});
