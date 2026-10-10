import test from 'node:test';import assert from 'node:assert/strict';
import {createGameScreenHost} from '../public/games/system-clash/play/game-screen-host.mjs';
test('a featured child returns through the nearest lounge while fullscreen belongs to the outer host',()=>{
 const outer={document:{documentElement:{dataset:{systemClashHost:'1'}}}},messages=[];outer.parent=outer;
 const lounge={document:{documentElement:{dataset:{systemClashLounge:'1'}}},parent:outer,postMessage:(data,origin)=>messages.push({data,origin})};
 const doc={documentElement:{dataset:{}},querySelectorAll:()=>[],addEventListener(){}},win={parent:lounge,document:doc,location:{href:'https://example.test/games/system-clash/play/online.html'},addEventListener(){}};
 const host=createGameScreenHost({window:win,document:doc});assert.equal(host.navigate('tournament-online.html?event=ABC123'),true);assert.equal(messages[0]?.data.type,'system-clash:navigate');assert.equal(messages[0]?.data.url,'https://example.test/games/system-clash/play/tournament-online.html?event=ABC123');assert.equal(doc.documentElement.dataset.systemClashLoungeChild,'1');
});
test('a lounge intercepts only validated child navigation without spawning an overlay',()=>{
 const seen=[],doc={documentElement:{dataset:{}},querySelectorAll:()=>[],addEventListener(){}},win={document:doc,location:{href:'https://example.test/games/system-clash/play/tournament-online.html'},addEventListener(){}};win.parent=win;
 const host=createGameScreenHost({window:win,document:doc,onNavigate:url=>{seen.push(url.href);return true;}});assert.equal(host.navigate('online.html'),true);assert.equal(host.active,false);assert.equal(host.navigate('https://outside.test/online.html'),false);assert.equal(seen.length,1);
});
