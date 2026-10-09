/** Reviewed against each fighter's own idle skull/trunk; native RGBA and vertical scale stay intact.
 * Static source rules also cover pixel-identical grab/deletion aliases. Extended limbs are never used
 * as a body-width reference. Stolz's existing small brace/suspended poses remain unchanged.
 */
const SOURCE_WIDTHS=Object.freeze({
  "assets/fighters/6-bit/defense-kick": 0.74,
  "assets/arcade/6-bit/low-attacks-v3": 0.76,
  "assets/arcade/6-bit/air-uppercut-v1": 0.74,
  "assets/arcade/6-bit/contextual-attacks-v1": 0.74,
  "assets/arcade/6-bit/crouch-combos-v3": 0.78,
  "assets/arcade/6-bit/power-kick-v5": 0.76,
  "assets/deletions/6-bit/attacker-poses-v1": 0.86,
  "assets/fighters/6-bit/walk-smooth-v3": 0.8,
  "assets/fighters/6-bit/movement": 0.82,
  "assets/arcade/cache-back/air-uppercut-v2": 0.76,
  "assets/arcade/cache-back/contextual-attacks-v1": 0.8,
  "assets/arcade/cache-back/crouch-combos-v4": 0.88,
  "assets/deletions/cache-back/shove-smooth-v2": 0.84,
  "assets/deletions/cache-back/attacker-poses-v2": 0.84,
  "assets/arcade/cache-back/low-attacks-v1": 0.94,
  "assets/arcade/dj-floppydisc/low-attacks-v1": 0.84,
  "assets/arcade/dj-floppydisc/air-uppercut-v1": 0.8,
  "assets/arcade/dj-floppydisc/contextual-attacks-v1": 0.82,
  "assets/fighters/dj-floppydisc/walk-smooth-v3": 0.9,
  "assets/fighters/dj-floppydisc/movement-v1": 0.9,
  "assets/arcade/cliff/air-uppercut-v1": 0.84,
  "assets/arcade/cliff/contextual-attacks-v1": 0.86,
  "assets/arcade/mr-nice-guy/low-attacks-v3": 0.86,
  "assets/arcade/mr-nice-guy/air-uppercut-v1": 0.84,
  "assets/arcade/mr-nice-guy/contextual-attacks-v1": 0.86,
  "assets/arcade/wittyf0x/low-attacks-v2": 0.88,
  "assets/arcade/wittyf0x/air-uppercut-v1": 0.86,
  "assets/arcade/wittyf0x/contextual-attacks-v2": 0.86,
  "assets/arcade/wittyf0x/crouch-combos-v1": 0.88,
  "assets/deletions/wittyf0x/attacker-poses-v1": 0.9,
  "assets/arcade/ms-mayhem/air-uppercut-v3": 0.67,
  "assets/arcade/ms-mayhem/contextual-attacks-v1": 0.85,
  "assets/arcade/9-bit/air-uppercut-v2": 0.8,
  "assets/arcade/papa-oak/jump": 0.82,
  "assets/arcade/papa-oak/uppercut": 0.82,
  "assets/arcade/papa-oak/crouch-high-kick": 0.82,
  "assets/arcade/papa-oak/double-punch": 0.82,
  "assets/deletions/papa-oak/compressed": 0.82,
  "assets/deletions/papa-oak/crumpled": 0.82,
  "assets/fighters/stolz/hurt": 0.9,
  "assets/arcade/dr3wbaby/contextual-attacks-v1": 0.9
});
const CELL_WIDTHS=Object.freeze({
  "597ed4d33eb452052ce38df9387428ce5a674656d1aae89ebc111bd901efa64a": 0.88,
  "60fe3f4fdb31f70764a789f53527ac2b7d9ba00afebead92ad16e3bcdaaf241b": 0.88,
  "8e538ac3676985635bae8ed0241b7fda48b262ef6770604b344c6aed8886b0a9": 0.88,
  "93fdd9b751569e267ce6f52b8859a50028b62fc0c29d152b29a83ba070b607f8": 0.88,
  "9e62b561aa79fec1b486638c75292fbb2df678b7b8c64529d5e91160b947f931": 0.88,
  "c5785a7537ea829a7aff3f263b441c644d56316f362e129390cddecbefd5c2cd": 0.88,
  "d8d65bd74034de5b1e83fd4134707757e71adc0dd73e79dddcbdd50b4763a74b": 0.88,
  "ef32eecbd0018eed2addd81a132ebbdf14b3605c07d528530b07d9a14a16f1d6": 0.88
});
const sourceKey=file=>file?.replace(/(?:\.(?:runtime|clarity))?\.(?:png|webp)$/,'');
export function poseWidthFactor(asset,frame) {
  if(Number.isFinite(asset.poseWidthFactor)&&asset.poseWidthFactor>0)return asset.poseWidthFactor;
  const rgba=frame.nativeSource?.pixelSha256??frame.combatProfile?.sourceRgbaSha256??frame.pixelSha256;
  const source=frame.nativeSource?.file??frame.combatProfile?.sourceFile;
  return CELL_WIDTHS[rgba]??SOURCE_WIDTHS[sourceKey(source)]??1;
}
