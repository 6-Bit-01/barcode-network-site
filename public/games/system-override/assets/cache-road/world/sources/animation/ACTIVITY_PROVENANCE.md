# Cache Road street activities

Created September 29–30, 2026 with the built-in image-generation editor,
using the existing still cutouts in `world/props/` as identity references.
Original stills and earlier animation sheets remain unchanged.

All requests specified the same painted comic/game style, original identity,
outfit, equipment, camera and scale; four complete figures in a 2×2 atlas,
transparent alpha, gutters, no labels/grid/background, and planted contacts
for work/seated actions. The requested action directions were:

- **Sweeper:** broom out right, halfway inward, finish inward with elbow/torso
  work, halfway outward; visible broom travel with fixed boots. The generated
  fourth cel clipped the broom. Packing uses the complete middle cel for the
  return stroke: 0, 1, 2, 1. This is an intentional ping-pong loop.
- **Gardener:** tilt and pour, extend the pour, raise the can/reduce flow,
  return; visible arms, can and water, fixed boots and planter.
- **Electrician:** kneeling woman tightens a screw, eases back, works a lower
  screw and returns; forearm/tool movement, fixed knees, feet and cabinet.
- **Street cook:** circular spoon/stirring arm action, a small lean toward the
  pot and changing steam; the other hand grips the pot. Fixed feet/cart.
- **Waving resident:** elderly woman waves her right hand and forearm outward,
  halfway inward, inward, halfway outward. Fixed torso, boots and grocery bag.
- **Board player:** seated woman hovers her right hand above the board, picks
  up a piece, reaches across/places it, and returns; small thoughtful head
  motion, fixed stool, boots, knees and board. No locomotion.
- **Handheld player:** left-facing walk while using the device with both hands;
  alternating contact/passing poses, same body center/camera/scale, no turning.
- **Vendor cart:** preserve weathered red metal, orange/red canopy, warm lamps,
  pots, wheel and support feet. Only organic steam curls and loose right cloth
  flutter. Explicitly reject the old rectangular steam strips and matte fringe.

Generated source files end in `-activity-source.png`. Reproducible technical
assembly is in `tools/pack-cache-road-activities.py`; it partitions complete
silhouettes, retains antialiased fringes, removes isolated transparent specks,
registers measured ground/body contacts, applies one uniform scale per actor,
then packs four horizontal runtime cels. It does not redraw body parts.
`activity-registration.json` records crops, contact points, scale and offsets.
The optimized `-activity-frames.webp` files contain the resulting cels.

The six facade SVGs are deterministic native vector art, built by
`tools/build-cache-road-practicals.py`: rising steam, interior window activity,
rotating vent blades, swaying foliage, data scans and transit chevrons.
They use measured sockets on the existing building art; no new building
geometry, collision or gameplay clock is introduced.
