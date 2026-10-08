// Hidden gameplay balance, grounded in current native builds and authored fighting styles.
// Every fighter spends the same budget; source geometry remains the sole owner of reach.
export const FIGHT_STAT_KEYS=Object.freeze(['health','speed','power','technique']);
export const FIGHT_STAT_BUDGET=24;
export const BASELINE_FIGHT_STATS=Object.freeze({health:6,speed:6,power:6,technique:6});
const profile=(health,speed,power,technique)=>Object.freeze({health,speed,power,technique});

export const FIGHTER_STAT_PROFILES=Object.freeze({
 // Scrappy brawler, massive rooted powerhouse, precise martial technician and practical staffer.
 '6-bit':profile(6,6,7,5),
 '9-bit':profile(9,3,9,3),
 'cache-back':profile(5,7,4,8),
 'cliff':profile(6,6,5,7),
 // Mobile dancer, close clinch grappler, braced counterfighter and deliberate Hammer Enforcer.
 'dj-floppydisc':profile(5,8,4,7),
 'mac-modem':profile(7,4,8,5),
 'mr-nice-guy':profile(7,4,5,8),
 'ms-mayhem':profile(6,5,9,4),
 // Durable planted chrome-arm force, stocky power boxer, rangy performer and lighter mobile performer.
 'stolz':profile(9,3,8,4),
 'kaveman-brown':profile(8,4,7,5),
 'dr3wbaby':profile(5,8,5,6),
 'ash-flowers':profile(6,7,5,6),
 // Agile fox, small precise-mitten puppet, mobile cat-cyborg and towering rooted bark build.
 'wittyf0x':profile(4,9,4,7),
 'doofnoobler':profile(4,9,3,8),
 'lyra':profile(5,7,5,7),
 'papa-oak':profile(10,2,8,4),
});

/** Return a shared immutable four-stat profile; missing IDs stay neutral. */
export function fightStatProfile(id){
 return typeof id==='string'&&Object.hasOwn(FIGHTER_STAT_PROFILES,id)
  ?FIGHTER_STAT_PROFILES[id]:BASELINE_FIGHT_STATS;
}

// Preserve neutral score6 while giving both ends of1..10 the same modest scalar envelope.
function relativeStat(value){
 const score=Number.isFinite(value)?Math.max(1,Math.min(10,value)):6;
 return score>=6?(score-6)/4:(score-6)/5;
}

/**
 * Derive bounded scalars for engine-owned health, movement, damage and existing timing.
 * Higher Technique widens input/combination windows and shortens recovery modestly;
 * it does not change health, power or sprite-derived reach. Caller data is never edited.
 */
export function fightStatScalars(idOrProfile){
 const stats=typeof idOrProfile==='string'?fightStatProfile(idOrProfile)
  :idOrProfile&&typeof idOrProfile==='object'?idOrProfile:BASELINE_FIGHT_STATS;
 const health=relativeStat(stats.health),speed=relativeStat(stats.speed);
 const power=relativeStat(stats.power),technique=relativeStat(stats.technique);
 return Object.freeze({
  maxHealth:Math.round(100+32*health),
  speedScale:1+.15*speed,
  powerScale:1+.15*power,
  inputBufferScale:1+.10*technique,
  recoveryTimeScale:1-.08*technique,
  combinationWindowScale:1+.10*technique,
 });
}
