/** Reviewed horizontal registration; source pixels, height and floor anchors stay intact. */
const NATIVE_X=Object.freeze({
  "a8de907fd40ed86bfbff4bd5913d16ddb7acfa1003e5a78efbf4a8c2e364e88b":-32,
  "ae2ecea0bc65501273ef63c32bc39012f44d044e3befffdb9481c0bb7f3456a6":-16,
  "e479ebca0eb530c658e7bb8d7a1da3f3c53e3503e8834db64fabbf4376fb5063":-34,
  "6f887d31bd382b6c0b91d4872e541ea565b83878844e9badc2b5445e2d611777":-28,
  "ea1dc067a9b80dd6cddf652937a04bc184c4a465c805005b848d8d6104b640f4":-8,
  "b80d58112e6b3cf240bacff5c788478feb3152f76b7fbfd4edf6c9d9e1a263ac":-36,
  "b6d8b01f345b97dc5f5461dd8cfa4d2ea356007881d68b4d821ab83bf3f4e01e":-44,
  "a5f95406de5dd27d8d9ae29859fd190924e68bf5b3705bc955a5581b9ee4be40":-19,
  "5fe8f3ee9e11ad41cc1e74466374bece70823b80a598e026b2fe813081e4854b":-46,
  "526aac1c30265ea33ad9eec9d5983231394735758a333989d0702afa587f1e3e":-23,
  "cc908be07763d4f26d14ae9a44706a9ab292300b41ba8e4f706400d014d82061":28,
  "5adee002fd56f1e211cdb40762e96e8b1571ce03a38d753ec997766cb2576e72":54,
  "e0924d3269fe531858874639f465c7eeb7f5cf818eb80ac8f289aa43ae54c78b":51,
  "b5d0817adf8ba1a7c033c0a8effe6378246ef1565c7adafd33d099b583dd3170":57,
  "5ee75054aace6632c2fd53ae764caaafa8d30d45180a290a70f0d1af65253ce8":66,
  "716d9e10fdd38b44411f06bcbd55af5403d2e452c5cc555637e52656b636fc08":-20,
  "e738725eef09cebc30d610add127a04901bdc8cb08b1cb0d6a5cfdd9d7e43caf":-16,
  "6fe6e486df7c63e2bdd5d709170b602c3febca42cedceb1937cfcef812f56cd6":-25,
  "18ff229be4d3209199ac5d7c2f5d237e995a272603a33c85b2675b9a237ddbb4":21,
});

const WORLD_X=Object.freeze({
  "ca86c5a42a6a42932257441769ed2bfcb9f92f23e70c75ad070a8b0af5e33849":6.7,
  "a392d54964410c38547ad05be4e0d29e8a90cff2f7dd42d912177a946fc23a2d":14.9,
  "6261a5914fe791d82257c344f98c015f8cf8019f431ad3553f04f717ea08d21b":-0.5,
  "4df6acf7eb48c1910a3403d28ee5130f667af567cb822521edc7bfe38f985f41":-1.2,
  "24e25500e3ed433d38430423d0b68f97b3f9b142871949bad38e0e8f8a78e9c1":9.1,
  "61cc2d19938562606df2f61a4449c808bf511599ad9db104457055fc80bfc6f1":1.2,
  "41451b9aaeaa2a06c47d21b09b2bf19a03e297da8f956e0df949988517533dc3":6.0,
});

const frameHash=frame=>frame.nativeSource?.pixelSha256??frame.combatProfile?.sourceRgbaSha256??frame.pixelSha256;
export function poseRegistration(asset,frame) {
  const fixture=asset.poseRegistration;
  if(fixture&&Number.isFinite(fixture.x)&&Number.isFinite(fixture.y))return fixture;
  const hash=frameHash(frame),scale=asset.scale*(frame.bodyCalibration??1);
  let x=(NATIVE_X[hash]??0)*scale+(WORLD_X[hash]??0);
  // A small authored lunge keeps Cliff's narrowed uppercut in physical head range.
  // The shared atlas is also used for jumping; only this attack receives the travel.
  if(asset.fighterId==='cliff'&&asset.name==='uppercut'){
    for(const facing of ['left','right']){
      const index=asset.data.frames[facing].indexOf(frame);
      if(index>=0){x+=([0,4,8,2][index]??0)*(facing==='left'?-1:1);break;}
    }
  }
  return {x,y:0};
}

/** Playback corrections use retained native key poses without rewriting atlas provenance. */
export function clipPlayback(data,manifest,name) {
  const identity=manifest.fighterId??manifest.baseId??manifest.id;
  if(name==='idle'&&['papa-oak','lost-marbles'].includes(identity)&&data.frames.right.length===4&&data.frames.left.length===4){
    // Reviewed native keys2 (and Lost's3) read as an attack/drop, not a guard.
    // Keep their atlas/provenance and the original six180ms playback slots.
    const order=identity==='papa-oak'?[0,1,3,1,0,1]:[0,1,0,1,0,1],nativeOrder=data.order??[0,1,2,3,2,1];
    const frameMs=nativeOrder.map((index,position)=>Array.isArray(data.frameMs)?data.frameMs[data.frameMs.length===nativeOrder.length?position:index]:data.frameMs??120);
    return {order,frameMs};
  }
  if(identity==='9-bit'&&name==='walk'&&data.frames.left.length===8&&data.frames.right.length===8)
    return {order:[0,2,4,6],frameMs:[150,150,150,150]};
  return undefined;
}
