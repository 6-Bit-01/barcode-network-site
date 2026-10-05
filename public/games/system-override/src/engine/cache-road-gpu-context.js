// Canvas-shaped scene commands for the retained Level 2 GPU renderer.
// This records scenery only. The existing loop, controls, audio and HUD remain owners.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/engine/cache-road-gpu-context.js',
  exports:['BARCODE.CacheRoadGPUContext'],dependencies:[]});
(function () {
  const B=window.BARCODE=window.BARCODE||{};
  const identity=()=>({a:1,b:0,c:0,d:1,e:0,f:0});
  const matrix=m=>({a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f});
  const multiply=(m,n)=>({a:m.a*n.a+m.c*n.b,b:m.b*n.a+m.d*n.b,
    c:m.a*n.c+m.c*n.d,d:m.b*n.c+m.d*n.d,
    e:m.a*n.e+m.c*n.f+m.e,f:m.b*n.e+m.d*n.f+m.f});
  const point=(m,x,y)=>[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];
  const styleKeys=['fillStyle','strokeStyle','globalAlpha','globalCompositeOperation',
    'lineWidth','lineCap','lineJoin','miterLimit','lineDashOffset','font','textAlign',
    'textBaseline','direction','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY',
    'imageSmoothingEnabled','imageSmoothingQuality','filter'];
  const defaults={fillStyle:'#000000',strokeStyle:'#000000',globalAlpha:1,
    globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',
    miterLimit:10,lineDashOffset:0,font:'10px sans-serif',textAlign:'start',
    textBaseline:'alphabetic',direction:'inherit',shadowColor:'#00000000',shadowBlur:0,
    shadowOffsetX:0,shadowOffsetY:0,imageSmoothingEnabled:true,
    imageSmoothingQuality:'high',filter:'none'};
  const clonePaths=paths=>paths.map(p=>({points:p.points.slice(),closed:p.closed}));
  const immutablePaths=paths=>Object.freeze(paths.map(path=>Object.freeze({
    points:Object.freeze(path.points.slice()),closed:path.closed})));
  const sameMatrix=(a,b)=>Object.is(a.a,b.a)&&Object.is(a.b,b.b)&&
    Object.is(a.c,b.c)&&Object.is(a.d,b.d)&&Object.is(a.e,b.e)&&Object.is(a.f,b.f);
  const snapshotStyle=value=>value instanceof SceneGradient?{type:value.type,
    args:value.args.slice(),transform:matrix(value.transform),
    stops:value.stops.map(stop=>({...stop}))}:value;
  function strokePaths(paths,m) {
    const det=m.a*m.d-m.b*m.c;
    if(!Number.isFinite(det)||Math.abs(det)<1e-12)return [];
    return paths.map(path=>({closed:path.closed,points:path.points.map((value,i,all)=>{
      const x=all[i-i%2]-m.e,y=all[i-i%2+1]-m.f;
      return i%2?(-m.b*x+m.a*y)/det:(m.d*x-m.c*y)/det;
    })}));
  }
  function distanceToLine(p,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    return length?Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/length:
      Math.hypot(p[0]-a[0],p[1]-a[1]);
  }
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  function flattenCubic(a,b,c,d,append,depth=0) {
    if(depth>=10||Math.max(distanceToLine(b,a,d),distanceToLine(c,a,d))<=.2){append(d);return;}
    const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
    flattenCubic(a,ab,abc,center,append,depth+1);
    flattenCubic(center,bcd,cd,d,append,depth+1);
  }
  class ScenePath {
    constructor(){this.operations=[];this.revision=0;}
    _append(method,args){this.operations.push([method,args]);this.revision++;}
    moveTo(...args){this._append('moveTo',args);}
    lineTo(...args){this._append('lineTo',args);}
    closePath(){this._append('closePath',[]);}
    rect(...args){this._append('rect',args);}
    arc(...args){this._append('arc',args);}
    ellipse(...args){this._append('ellipse',args);}
    bezierCurveTo(...args){this._append('bezierCurveTo',args);}
    quadraticCurveTo(...args){this._append('quadraticCurveTo',args);}
    roundRect(...args){this._append('roundRect',args);}
    toNative(){const result=new window.Path2D();for(const [method,args]of this.operations)result[method](...args);return result;}
  }
  class SceneGradient {
    constructor(context,type,args){this.type=type;this.args=args;this.transform=matrix(context._matrix);this.stops=[];this.context=context;}
    addColorStop(offset,color){if(!Number.isFinite(offset)||offset<0||offset>1)throw RangeError('Gradient stop outside 0..1');
      this.stops.push({offset,color});this.context._operations.push({type:'gradientStop',gradient:this,offset,color});}
  }
  class SceneContext {
    constructor(nativeContext,options={}){
      this.isGpuScene=true;this.canvas=nativeContext.canvas;this.options=options;
      this.commands=[];this._operations=[];this._native=nativeContext;
      this._matrix=matrix(nativeContext.getTransform?.()||identity());
      this._initialMatrix=matrix(this._matrix);this._styles={};
      for(const key of styleKeys)this._styles[key]=nativeContext[key]??defaults[key];
      this._initialStyles={...this._styles};this._dash=Array.from(nativeContext.getLineDash?.()||[]);
      this._initialDash=this._dash.slice();
      this._stack=[];this._clips=[];this._paths=[];this._current=null;this._underflow=false;
      // Frame-local weak ownership: published paths/clips remain immutable,
      // while another transform or an authored path edit gets new geometry.
      this._pathCache=new WeakMap();
      Object.defineProperty(this.commands,'balanced',{get:()=>!this._underflow&&this._stack.length===0});
    }
    createPath(){return new ScenePath();}
    _call(method,args){this._operations.push({type:'call',method,args:Array.from(args,value=>{
      if(!(value instanceof ScenePath))return value;
      const copy=new ScenePath();copy.operations=value.operations.map(([name,values])=>[name,values.slice()]);return copy;
    })});}
    _ensurePath(p){if(!this._current){this._current={points:p.slice(),closed:false};this._paths.push(this._current);}return this._current;}
    _last(){const p=this._current?.points;return p?.length?[p[p.length-2],p[p.length-1]]:null;}
    _append(p){this._ensurePath(p).points.push(...p);}
    _pathMove(x,y){const p=point(this._matrix,x,y);this._current={points:p,closed:false};this._paths.push(this._current);}
    beginPath(){this._call('beginPath',arguments);this._paths=[];this._current=null;}
    moveTo(x,y){this._call('moveTo',arguments);this._pathMove(x,y);}
    lineTo(x,y){this._call('lineTo',arguments);const p=point(this._matrix,x,y);if(this._current)this._append(p);else this._pathMove(x,y);}
    closePath(){this._call('closePath',arguments);if(this._current){
      this._current.closed=true;
      this._current={points:this._current.points.slice(0,2),closed:false};this._paths.push(this._current);
    }}
    rect(x,y,w,h){this._call('rect',arguments);const p={points:[...point(this._matrix,x,y),...point(this._matrix,x+w,y),
      ...point(this._matrix,x+w,y+h),...point(this._matrix,x,y+h)],closed:true};this._paths.push(p);
      this._current={points:point(this._matrix,x,y),closed:false};this._paths.push(this._current);}
    bezierCurveTo(x1,y1,x2,y2,x,y){this._call('bezierCurveTo',arguments);const b=point(this._matrix,x1,y1),
      c=point(this._matrix,x2,y2),d=point(this._matrix,x,y),a=this._last()||b;
      this._ensurePath(a);flattenCubic(a,b,c,d,p=>this._append(p));}
    quadraticCurveTo(x1,y1,x,y){this._call('quadraticCurveTo',arguments);const b=point(this._matrix,x1,y1),
      d=point(this._matrix,x,y),a=this._last()||b;this._ensurePath(a);
      flattenCubic(a,[a[0]+2*(b[0]-a[0])/3,a[1]+2*(b[1]-a[1])/3],
        [d[0]+2*(b[0]-d[0])/3,d[1]+2*(b[1]-d[1])/3],d,p=>this._append(p));}
    _ellipse(x,y,rx,ry,rotation,start,end,anticlockwise=false){
      let span=end-start;if(!anticlockwise){if(span>=Math.PI*2)span=Math.PI*2;else span=(span%(Math.PI*2)+Math.PI*2)%(Math.PI*2);}
      else {if(-span>=Math.PI*2)span=-Math.PI*2;else span=-((-span%(Math.PI*2)+Math.PI*2)%(Math.PI*2));}
      const scale=Math.max(Math.hypot(this._matrix.a,this._matrix.b),Math.hypot(this._matrix.c,this._matrix.d));
      const radius=Math.max(rx,ry)*scale,step=radius>.2?2*Math.acos(Math.max(-1,1-.2/radius)):Math.PI/2;
      const count=Math.max(2,Math.min(256,Math.ceil(Math.abs(span)/Math.max(.005,step))));
      const cr=Math.cos(rotation),sr=Math.sin(rotation);
      for(let i=0;i<=count;i++){const angle=start+span*i/count,u=rx*Math.cos(angle),v=ry*Math.sin(angle),
        p=point(this._matrix,x+cr*u-sr*v,y+sr*u+cr*v);
        if(!this._current)this._ensurePath(p);else this._append(p);}
    }
    arc(x,y,r,start,end,anticlockwise=false){this._call('arc',arguments);this._ellipse(x,y,r,r,0,start,end,anticlockwise);}
    ellipse(x,y,rx,ry,rotation,start,end,anticlockwise=false){this._call('ellipse',arguments);this._ellipse(x,y,rx,ry,rotation,start,end,anticlockwise);}
    roundRect(x,y,w,h,radii=0){this._call('roundRect',arguments);let r=Array.isArray(radii)?radii[0]:radii;
      r=typeof r==='object'?Math.min(r.x,r.y):r;r=Math.max(0,Math.min(Number(r)||0,Math.abs(w)/2,Math.abs(h)/2));
      const savedOperations=this._operations;this._operations=[];
      this._pathMove(x+r,y);this.lineTo(x+w-r,y);this._ellipse(x+w-r,y+r,r,r,0,-Math.PI/2,0);
      this.lineTo(x+w,y+h-r);this._ellipse(x+w-r,y+h-r,r,r,0,0,Math.PI/2);
      this.lineTo(x+r,y+h);this._ellipse(x+r,y+h-r,r,r,0,Math.PI/2,Math.PI);
      this.lineTo(x,y+r);this._ellipse(x+r,y+r,r,r,0,Math.PI,Math.PI*1.5);this.closePath();
      this._current.points=point(this._matrix,x,y);
      this._operations=savedOperations;
    }
    _pathVariant(path){
      let cached=this._pathCache.get(path);
      if(!cached||cached.revision!==path.revision){
        cached={revision:path.revision,variants:[]};this._pathCache.set(path,cached);
      }
      for(const variant of cached.variants)if(sameMatrix(variant.transform,this._matrix))return variant;
      const recording=new SceneContext(this._native);
      recording._matrix=matrix(this._matrix);
      for(const [method,args]of path.operations)recording[method](...args);
      const variant={transform:matrix(this._matrix),paths:immutablePaths(recording._paths),clips:new Map()};
      cached.variants.push(variant);return variant;
    }
    _geometry(path){if(path instanceof ScenePath)return this._pathVariant(path).paths;if(path){
        // A native opaque Path2D cannot be introspected. Retain its original
        // operation for replay and reject this GPU frame before compositing.
        this.commands.push({kind:'unsupported',reason:'opaque-native-path'});return [];
      }return clonePaths(this._paths);}
    _paint(path,stroke=false,rule='nonzero'){
      const scale=Math.sqrt(Math.abs(this._matrix.a*this._matrix.d-this._matrix.b*this._matrix.c));
      const paths=this._geometry(path);
      this.commands.push({kind:'path',paths,rule,stroke,
        style:snapshotStyle(stroke?this.strokeStyle:this.fillStyle),lineWidth:this.lineWidth*scale,
        nativeLineWidth:this.lineWidth,strokeTransform:stroke?matrix(this._matrix):null,
        strokePaths:stroke?strokePaths(paths,this._matrix):null,lineCap:this.lineCap,
        lineJoin:this.lineJoin,miterLimit:this.miterLimit,dash:this._dash.slice(),dashOffset:this.lineDashOffset,
        alpha:this.globalAlpha,composite:this.globalCompositeOperation,clips:this._clips.slice(),
        filter:this.filter,shadowBlur:this.shadowBlur,shadowColor:this.shadowColor,
        shadowOffsetX:this.shadowOffsetX,shadowOffsetY:this.shadowOffsetY});
    }
    fill(path,rule){this._call('fill',arguments);if(typeof path==='string'){rule=path;path=null;}this._paint(path,false,rule||'nonzero');}
    stroke(path){this._call('stroke',arguments);this._paint(path,true);}
    _rectanglePaint(x,y,w,h,stroke){const prior=this._paths,current=this._current;
      this._paths=[{points:[...point(this._matrix,x,y),...point(this._matrix,x+w,y),
        ...point(this._matrix,x+w,y+h),...point(this._matrix,x,y+h)],closed:true}];this._paint(null,stroke);
      this._paths=prior;this._current=current;}
    fillRect(x,y,w,h){this._call('fillRect',arguments);this._rectanglePaint(x,y,w,h,false);}
    strokeRect(x,y,w,h){this._call('strokeRect',arguments);this._rectanglePaint(x,y,w,h,true);}
    clip(path,rule){this._call('clip',arguments);if(typeof path==='string'){rule=path;path=null;}
      rule=rule||'nonzero';let clip;
      if(path instanceof ScenePath){const variant=this._pathVariant(path);clip=variant.clips.get(rule);
        if(!clip){clip=Object.freeze({paths:variant.paths,rule});variant.clips.set(rule,clip);}
      }else clip={paths:this._geometry(path),rule};
      this._clips=this._clips.concat(clip);}
    save(){this._call('save',arguments);this._stack.push({styles:{...this._styles},transform:matrix(this._matrix),dash:this._dash.slice(),clips:this._clips.slice()});}
    restore(){this._call('restore',arguments);const s=this._stack.pop();if(s){this._styles=s.styles;this._matrix=s.transform;this._dash=s.dash;this._clips=s.clips;}
      else this._underflow=true;}
    translate(x,y){this._call('translate',arguments);this._matrix=multiply(this._matrix,{a:1,b:0,c:0,d:1,e:x,f:y});}
    scale(x,y){this._call('scale',arguments);this._matrix=multiply(this._matrix,{a:x,b:0,c:0,d:y,e:0,f:0});}
    rotate(angle){this._call('rotate',arguments);const c=Math.cos(angle),s=Math.sin(angle);this._matrix=multiply(this._matrix,{a:c,b:s,c:-s,d:c,e:0,f:0});}
    transform(a,b,c,d,e,f){this._call('transform',arguments);this._matrix=multiply(this._matrix,{a,b,c,d,e,f});}
    setTransform(a,b,c,d,e,f){this._call('setTransform',arguments);this._matrix=typeof a==='object'?matrix(a):{a,b,c,d,e,f};}
    resetTransform(){this._call('resetTransform',arguments);this._matrix=identity();}
    getTransform(){return matrix(this._matrix);}
    setLineDash(dash){this._call('setLineDash',arguments);this._dash=Array.from(dash);}
    getLineDash(){return this._dash.slice();}
    getContextAttributes(){return this._native.getContextAttributes?.()||{alpha:true,colorSpace:'srgb'};}
    createLinearGradient(...args){const g=new SceneGradient(this,'linear',args);this._operations.push({type:'gradient',gradient:g});return g;}
    createRadialGradient(...args){const g=new SceneGradient(this,'radial',args);this._operations.push({type:'gradient',gradient:g});return g;}
    drawImage(image,...args){this._call('drawImage',arguments);const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
      let source=[0,0,w,h],dest;if(args.length===2)dest=[args[0],args[1],w,h];
      else if(args.length===4)dest=args;else if(args.length===8){source=args.slice(0,4);dest=args.slice(4);}
      else throw Error('Unsupported image draw arguments');
      this.commands.push({kind:'image',image,source,dest,transform:matrix(this._matrix),alpha:this.globalAlpha,
        composite:this.globalCompositeOperation,smoothing:this.imageSmoothingEnabled,clips:this._clips.slice(),filter:this.filter,
        shadowBlur:this.shadowBlur,shadowColor:this.shadowColor,shadowOffsetX:this.shadowOffsetX,shadowOffsetY:this.shadowOffsetY});}
    fillText(text,x,y,maxWidth){this._call('fillText',arguments);this.commands.push({kind:'text',text:String(text),x,y,maxWidth,
      font:this.font,align:this.textAlign,baseline:this.textBaseline,transform:matrix(this._matrix),
      style:snapshotStyle(this.fillStyle),direction:this.direction,alpha:this.globalAlpha,
      composite:this.globalCompositeOperation,clips:this._clips.slice(),filter:this.filter,
      shadowBlur:this.shadowBlur,shadowColor:this.shadowColor,shadowOffsetX:this.shadowOffsetX,shadowOffsetY:this.shadowOffsetY});}
    measureText(text){return this._native.measureText(text);}
    replay(nativeContext){const gradients=new Map();const resolve=value=>value instanceof ScenePath?value.toNative():
      value instanceof SceneGradient?gradients.get(value):value;
      let depth=0;nativeContext.save();
      try {
        const initial=this._initialMatrix;
        nativeContext.setTransform(initial.a,initial.b,initial.c,initial.d,initial.e,initial.f);
        for(const key of styleKeys)nativeContext[key]=this._initialStyles[key];
        nativeContext.setLineDash(this._initialDash);
        for(const op of this._operations){
          if(op.type==='gradient'){const g=op.gradient;gradients.set(g,nativeContext[g.type==='linear'?'createLinearGradient':'createRadialGradient'](...g.args));}
          else if(op.type==='gradientStop')gradients.get(op.gradient).addColorStop(op.offset,op.color);
          else if(op.type==='set')nativeContext[op.key]=resolve(op.value);
          else {
            if(op.method==='restore'){if(!depth)continue;depth--;}
            else if(op.method==='save')depth++;
            nativeContext[op.method](...op.args.map(resolve));
          }
        }
      } finally {
        while(depth-->0)nativeContext.restore();nativeContext.restore();
      }
      this._applyState(nativeContext);
    }
    applyState(nativeContext){if(!this.commands.balanced)throw Error('Scenery state stack did not balance');
      this._applyState(nativeContext);
    }
    _applyState(nativeContext){
      for(const key of styleKeys){let value=this._styles[key];if(value instanceof SceneGradient){nativeContext.save();
        const m=value.transform;nativeContext.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
        const g=nativeContext[value.type==='linear'?'createLinearGradient':'createRadialGradient'](...value.args);
        for(const stop of value.stops)g.addColorStop(stop.offset,stop.color);nativeContext.restore();value=g;}
        nativeContext[key]=value;}
      const m=this._matrix;nativeContext.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);nativeContext.setLineDash(this._dash);
    }
  }
  for(const key of styleKeys)Object.defineProperty(SceneContext.prototype,key,{get(){return this._styles[key];},
    set(value){this._styles[key]=value;this._operations.push({type:'set',key,value});}});
  B.CacheRoadGPUContext=SceneContext;
})();
