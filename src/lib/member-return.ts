const paths=new Set(["/games/system-clash/play/online.html","/games/system-clash/play/tournament-online.html","/games/system-clash/play/tournament-watch.html"]);
/** A supplied game handoff can return only to these bounded same-origin online game surfaces. */
export function memberGameReturnPath(value:unknown):string|undefined{
 if(typeof value!=="string"||value.length>2048||!value.startsWith("/")||value.startsWith("//")||/[\\\u0000-\u001f\u007f]/.test(value))return;
 try{const url=new URL(value,"https://www.barcode-network.com");if(url.origin!=="https://www.barcode-network.com"||!paths.has(url.pathname)||url.hash)return;return url.pathname+url.search;}catch{return;}
}
