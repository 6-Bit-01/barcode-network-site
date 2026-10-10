import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url),React=require("react");
function mount(){
 const values=[];let cursor=0,effectStarted=false;
 const calls=[];
 const react={...React,useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],value=>{values[i]=typeof value==="function"?value(values[i]):value;}];},useEffect(fn){if(!effectStarted){effectStarted=true;fn();}}};
 function load(file){const target={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:target,exports:target.exports,AbortController,fetch:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith("/get-session")?null:{ok:true});},require:id=>id==="react"?react:id==="next/link"?({children,...props})=>React.createElement("a",props,children):id==="@/components/MemberAccessNavigation"?{MemberAccessNavigation:()=>null}:id==="@/components/MemberRadioHistory"?{MemberRadioHistory:()=>null}:id==="@/lib/member-terms"?load("../src/lib/member-terms.ts"):require(id)});return target.exports;}
 const component=load("../src/components/MemberAccount.tsx").MemberAccount;
 const render=()=>{cursor=0;return component({initialMode:"signup"});};
 const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));return render();};
 render();
 return{render,settle,calls};
}
function find(tree,predicate){if(!tree||typeof tree!=="object")return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
const markup=tree=>require("react-dom/server").renderToStaticMarkup(tree);
const form=tree=>find(tree,node=>node.type==="form");
const button=(tree,label)=>find(tree,node=>node.type==="button"&&node.props.children===label);
function fill(ui){for(const [autocomplete,value]of [["nickname","Example Artist"],["email","artist@example.invalid"],["new-password","synthetic-test-password"]]){const input=find(ui.render(),node=>node.type==="input"&&node.props.autoComplete===autocomplete);assert.ok(input);input.props.onChange({target:{value}});}}
const signupCalls=ui=>ui.calls.filter(call=>call.url.endsWith("/sign-up/email"));
async function review(ui){await ui.settle();fill(ui);await form(ui.render()).props.onSubmit({preventDefault(){}});const tree=ui.render();assert.equal(signupCalls(ui).length,0);assert.match(markup(tree),/Before you join the Network/);return tree;}

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

test("explicit current acceptance submits once then clears password and acceptance",async()=>{
 const ui=mount();await review(ui);
 find(ui.render(),node=>node.type==="input"&&node.props.type==="checkbox").props.onChange({target:{checked:true}});
 assert.equal(button(ui.render(),"Agree and create account").props.disabled,false);
 await form(ui.render()).props.onSubmit({preventDefault(){}});
 assert.equal(signupCalls(ui).length,1);
 const payload=JSON.parse(signupCalls(ui)[0].options.body);
 assert.equal(payload.termsAccepted,true);assert.equal(payload.termsVersion,"1.4");
 assert.equal(payload.email,"artist@example.invalid");
 const tree=await ui.settle();
 assert.match(markup(tree),/Check your email/);
 assert.equal(find(tree,node=>node.type==="input"&&node.props.type==="password").props.value,"");
 await form(tree).props.onSubmit({preventDefault(){}});
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.type==="checkbox").props.checked,false);
});

test("editing signup details or switching to sign in cannot reuse acceptance",async()=>{
 const ui=mount();await review(ui);
 find(ui.render(),node=>node.type==="input"&&node.props.type==="checkbox").props.onChange({target:{checked:true}});
 button(ui.render(),"Back to account details").props.onClick();
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.autoComplete==="email").props.value,"artist@example.invalid");
 await form(ui.render()).props.onSubmit({preventDefault(){}});
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.type==="checkbox").props.checked,false);
 button(ui.render(),"Sign in").props.onClick();
 assert.doesNotMatch(markup(ui.render()),/Before you join the Network/);
 assert.equal(find(ui.render(),node=>node.type==="input"&&node.props.type==="password").props.value,"");
});

test("signup acceptance version matches the canonical Legal Center",()=>{
 const terms=fs.readFileSync(new URL("../src/lib/member-terms.ts",import.meta.url),"utf8");
 const version=terms.match(/MEMBER_TERMS_VERSION = "([^"]+)"/)?.[1];assert.ok(version);
 const legal=fs.readFileSync(new URL("../docs/legal/BARCODE_NETWORK_LEGAL_CENTER_2026-06-13.md",import.meta.url),"utf8");
 assert.ok(legal.includes("**Legal Center Version:** "+version));
 assert.doesNotMatch(legal,/Display names are not unique/);
});
