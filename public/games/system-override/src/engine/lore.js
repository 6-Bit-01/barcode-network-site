// Collection notices for authored records. Reading uses the same LoreRecords catalog.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/lore.js', exports: ['LoreSystem', 'loreSystem', 'initLore'], dependencies: ['BARCODE.LoreRecords'] });
window.LoreSystem = class LoreSystem {
  constructor() { this.reset(); }
  reset() { this._overlayPanels = {}; this.currentLore = null; this.currentRecordId = null; this.pending = []; this.elapsedMs = 0; this.displayDuration = 12000; this.textOpacity = 0; this.panelLayout = null; }
  getPanelLayout() {
    const record=window.BARCODE.LoreRecords.get(this.currentRecordId);
    const measure={measureText:text=>({width:text.length*13})};
    const lines=window.BARCODE.LoreRecords.wrap(measure,record?record.paragraphs[0]:this.currentLore,820);
    return window.BARCODE.OverlayLayout.present(this,'lore',[{width:900,height:96+lines.length*29}]);
  }
  isBlocked() {
    return !!(window.isPaused || window.gameState?.paused || window.gameState?.gameOver || window.gameState?.victory ||
      window.tutorialSystem?.isActive?.() || window.hackingSystem?.isActive?.() || window.hackingSystem?.feedback || window.hackingSystem?.resultFx ||
      window.BARCODE?.stageFX?.ratEvent || window.BARCODE?.stageFX?.message || window.sector1Progression?.isGameplaySuppressed?.());
  }
  begin(notice) {
    this.currentLore = notice.text; this.currentRecordId = notice.id; this.elapsedMs = 0; this.textOpacity = 0;
    this.panelLayout = null; this._overlayPanels = {};
  }
  displayLoreMessage(text, id = null) {
    const record = id ? window.BARCODE.LoreRecords.get(id) : null;
    if (id && !record) return false;
    if (typeof text !== 'string' || !text.trim()) return false;
    const notice = { id, text: record ? window.BARCODE.LoreRecords.preview(id) : text };
    if (id && (this.currentRecordId === id || this.pending.some(item => item.id === id))) return false;
    // A collected record replaces a generic route reminder. Rapid successive
    // collections remain distinct; the persistent archive is readable at once.
    if (!this.currentLore || !this.currentRecordId) this.begin(notice);
    else if (id && this.pending.length < window.BARCODE.LoreRecords.level1.length) this.pending.push(notice);
    return true;
  }
  update(ms) {
    if (this.isBlocked() || !this.currentLore || !this.getPanelLayout().readable || !Number.isFinite(ms) || ms < 0) return;
    this.elapsedMs += ms;
    if (this.elapsedMs >= this.displayDuration) {
      const next = this.pending.shift();
      if (next) this.begin(next); else { this.currentLore = null; this.currentRecordId = null; this.textOpacity = 0; }
      return;
    }
    this.textOpacity = Math.min(1, this.elapsedMs / 250, (this.displayDuration - this.elapsedMs) / 600);
  }
  draw(ctx) {
    if (!ctx || this.isBlocked() || !this.currentLore || this.textOpacity <= 0) return;
    const record = window.BARCODE.LoreRecords.get(this.currentRecordId);
    ctx.save(); ctx.globalAlpha = this.textOpacity; ctx.shadowBlur = 0;
    ctx.font = '21px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const lines = window.BARCODE.LoreRecords.wrap(ctx, record ? record.paragraphs[0] : this.currentLore, 820);
    this.panelLayout = this.getPanelLayout();
    const {height,x,y,width} = this.panelLayout;
    window.BARCODE.OverlayLayout.begin(ctx,this.panelLayout);
    if(this.panelLayout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,this.panelLayout,'DISTRICT TRANSMISSION');ctx.restore();return;}
    ctx.fillStyle = 'rgba(7,16,30,0.96)'; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#9f82c7'; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = '#caa4ff'; ctx.font = 'bold 19px monospace';
    ctx.fillText(record ? `ARCHIVE ${record.number} // ${record.title.toUpperCase()}` : 'DISTRICT TRANSMISSION', x + 36, y + 18);
    ctx.font = '21px monospace'; ctx.fillStyle = '#edf3ff';
    lines.forEach((line, index) => ctx.fillText(line, x + 36, y + 49 + index * 29));
    ctx.font = '17px monospace'; ctx.fillStyle = '#9ff2da';
    ctx.fillText(record ? `${record.author}  ·  P > LORE ARCHIVE: READ THE FULL RECORD` : 'P > LORE ARCHIVE: RECOVERED RECORDS', x + 36, y + height - 26);
    ctx.restore();
  }
  // Compatibility entrypoints never schedule or select random lore.
  scheduleNextLore() {}
  startLoreDisplay() {}
  allLoreCollected() { return !!window.lostDataSystem?.allFragmentsCollected?.(); }
  diagnostics() { return { currentRecordId: this.currentRecordId, queued: this.pending.map(item => item.id), elapsedMs: this.elapsedMs, blocked: this.isBlocked() }; }
};
window.loreSystem = null;
window.initLore = function() { window.loreSystem ||= new window.LoreSystem(); return true; };
window.activateLoreSystem = function() { return !!window.loreSystem; };
window.testLoreDisplay = function(message = 'Archive display diagnostic') {
  return window.BARCODE?.DEBUG_LEVEL_1_SESSION ? !!window.loreSystem?.displayLoreMessage(message) : false;
};
window.checkLoreSystemStatus = function() { return window.loreSystem?.diagnostics?.() || null; };
