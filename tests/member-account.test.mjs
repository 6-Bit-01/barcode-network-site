import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
function render(mode='signin',token){
 const testModule={exports:{}};
 const source=fs.readFileSync(new URL('../src/components/MemberAccount.tsx',import.meta.url),'utf8');
 const mock={...React,useEffect:()=>{},useState:(initial)=>[initial,()=>{}]};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:testModule,exports:testModule.exports,AbortController,require:(id)=>id==='react'?mock:id==='next/link'?({children,...props})=>React.createElement('a',props,children):require(id)});
 return require('react-dom/server').renderToStaticMarkup(React.createElement(testModule.exports.MemberAccount,{initialMode:mode,resetToken:token}));
}
test('account/reset pages are private and isolated from BNL and hidden games',()=>{
 const component=fs.readFileSync(new URL('../src/components/MemberAccount.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(component,/localStorage|\/games|\/world|\/api\/bnl|\/api\/queue/);
 assert.match(component,/credentials:"same-origin"/);
 assert.match(component,/cache:"no-store"/);
 const layout=fs.readFileSync(new URL('../src/app/account/layout.tsx',import.meta.url),'utf8');assert.match(layout,/index:false,follow:false/);assert.match(layout,/force-dynamic/);
 const config=fs.readFileSync(new URL('../next.config.ts',import.meta.url),'utf8');assert.match(config,/no-referrer/);
});
test('password reset exposes an accessible password field and never reveals hidden features',()=>{
 const markup=render('reset','private-reset-token');assert.match(markup,/type="password"/);assert.match(markup,/autoComplete="new-password"/);assert.match(markup,/minLength="12"/);assert.match(markup,/role="status"/);assert.doesNotMatch(markup,/private-reset-token|Games|World|Artist|Crew|Owner/);
 const missing=render('reset');assert.match(missing,/missing or invalid/);assert.doesNotMatch(missing,/type="password"/);
});
