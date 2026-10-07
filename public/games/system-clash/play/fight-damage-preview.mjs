/** Review-only damage samples. No match, health or equipment is changed. */
export function previewBattleWear(fighter, condition = 'current') {
  if (condition === 'current') return {
    hp: fighter.hp,
    damageTaken: fighter.damageTaken ?? 0,
    damageTier: fighter.damageTier ?? 0,
    combatTime: fighter.combatTime ?? 0,
    damageMarks: (fighter.damageMarks ?? []).map(mark => ({...mark})),
    damageSites: Object.fromEntries(Object.entries(fighter.damageSites ?? {}).map(([site, value]) => [site, {...value}])),
  };
  const samples = {
    fresh: [],
    bloodied: [['head','bruise',8],['torso','bruise',10]],
    battered: [['head','bruise',8],['torso','bruise',10],['legs','bruise',7],['head','cut',10],['torso','cut',10]],
    ravaged: [['head','bruise',8],['torso','bruise',10],['legs','bruise',7],['head','cut',10],['torso','cut',10],['legs','cut',9],['torso','scorch',13],['head','bruise',9],['torso','bruise',10]],
  };
  const hits = samples[condition] ?? samples.fresh;
  const damageSites = Object.fromEntries(['head','torso','legs'].map(site => [site, {amount:0,hits:0,bruise:0,cut:0,scorch:0}]));
  const damageMarks = hits.map(([site,kind,amount], index) => {
    const total = damageSites[site]; total.amount += amount; total.hits++; total[kind] += amount;
    return {id:'review-wear-'+index,site,kind,amount,intensity:Math.min(1,amount/20),
      at:0,facing:'right',direction:-1,heightRatio:{head:.82,torso:.53,legs:.24}[site],seed:Math.imul(index+1,2654435761)>>>0};
  });
  const damageTaken = hits.reduce((sum, hit) => sum+hit[2], 0);
  return {hp:Math.max(0,(fighter.maxHp ?? 100)-damageTaken),damageTaken,combatTime:0,
    damageTier:damageTaken>=60?3:damageTaken>=30?2:damageTaken>0?1:0,damageMarks,damageSites};
}
