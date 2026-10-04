// Scene-authored dialogue uses the opening's locked comic format. This
// adapter owns only placement and cue visibility, never input or a clock.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/engine/comic-dialogue.js',exports:['BARCODE.ComicDialogue'],dependencies:['BARCODE.IntroSequence']});
(function(B) {
  'use strict';
  const opening=B.IntroSequence;
  function layouts(ctx,dialogue,placements,rect) {
    ctx.save();
    const result=dialogue.map(([label,body],i)=>{
      const p=placements[i],speaker=label.replace(/\s*\/\s*COMMS$/,'');
      const radio=p.radio===true||/\/\s*COMMS$/.test(label);
      const tail=!radio&&p.tail&&rect?[rect.x+p.tail[0]*rect.w,rect.y+p.tail[1]*rect.h]:null;
      return opening.measureBalloon(ctx,body,{...p,radio,tail},{speaker,serial:i+1});
    });
    ctx.restore();return result;
  }
  function draw(ctx,measured,{cue,cueElapsedMs,reduced}) {
    const shown=measured.slice(0,cue);
    function paint(l,part) {
      ctx.save();ctx.lineJoin='round';ctx.shadowBlur=0;
      ctx.globalAlpha*=!reduced&&cue===l.serial ? .35+.65*Math.min(1,Math.max(0,cueElapsedMs)/180):1;
      opening.drawBalloon(ctx,l.speaker,l,l.serial,part);ctx.restore();
    }
    // Pointers sit under every card, including the next speaker's.
    shown.forEach(l=>paint(l,{tailOnly:true}));shown.forEach(l=>paint(l,{hideTail:true}));
  }
  B.ComicDialogue=Object.freeze({layouts,draw,colors:opening.format.palette.crew});
})(window.BARCODE=window.BARCODE||{});
