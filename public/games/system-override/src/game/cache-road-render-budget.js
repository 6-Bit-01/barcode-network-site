// Measure native presentation cost on the existing shared Canvas.
// It owns no gameplay clock, frame callback, input, audio or persisted state.
(function(){
  const B=window.BARCODE=window.BARCODE||{};
  const create=()=>({scale:1,slowFrames:0,fastFrames:0,lastCostMs:0});
  function observe(budget,costMs,{paused=false,frameIntervalMs=0}={}){
    if(!budget||paused||!Number.isFinite(costMs)||costMs<0)return;
    // The previous display interval includes raster work queued after draw
    // submission. Sustained missed 30 Hz frames need the same headroom as
    // expensive draws; ignore tab/background gaps and invalid host clocks.
    if(Number.isFinite(frameIntervalMs)&&frameIntervalMs>1000/30&&frameIntervalMs<200)
      costMs=Math.max(costMs,frameIntervalMs);
    budget.lastCostMs=costMs;
    // Expensive frames remain diagnostic evidence. They must never replace
    // the owner's painted world with a coarse enlarged backing.
    budget.scale=1;
    if(costMs>24){
      budget.fastFrames=0;
      budget.slowFrames++;
    }else{
      budget.slowFrames=0;
      budget.fastFrames=costMs<10?budget.fastFrames+1:0;
    }
  }
  B.CacheRoadRenderBudget={create,observe};
})();
