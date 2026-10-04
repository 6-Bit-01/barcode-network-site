# Cache Road vehicle art

The transparent PNG sources were recovered from the owner's saved art review
files. The game loads optimized WebP copies beside this README:

| Runtime file | Recovered source title | Use |
| --- | --- | --- |
| `cache-center.webp` | Golden anime tuner with crest | Default Cache Back car |
| `cache-left.webp` | Left-steering golden tuner hatchback | Held right steer after owner visual correction |
| `cache-right.webp` | Right-steering golden tuner hatchback | Held left steer after owner visual correction |
| `cache-hit.webp` | Yellow Hatchback Collision Jolt | 650 ms collision reaction |
| `freight.webp` | Pixel-Art Rear-View Freight Truck | Freight traffic |
| `courier.webp` | Sea-glass broadcast courier hatchback | Van traffic |
| `barricade.webp` | Portable amber-striped road barricade | Fixed block |
| `rival.webp` | Rearview magenta scan vehicle | Final rival |

The original animation source was not saved with these images. In the game,
`drawVehicle` keeps the rear tire pixels at road contact while the chassis
rocks independently. Freight has a slower, larger suspension travel. Tread
detail moves through the rear tires, and a narrow side rim turns within the
visible wheel during steering. Cache throws wet spray and uses the recovered
collision pose with a decaying jolt. These are rebuilt runtime animations,
not a recovered sprite sheet. Reduced Motion holds bounce, spray and tire
movement. Procedural silhouettes remain as loading fallback for the other
traffic kinds and failed image requests.

The later visual-contact correction aligns each mask and its small dark
contact shadow to that pose's painted tire bottom, rather than the lower
bumper/exhaust edge of the image. The wheels stay in road coordinates while
short dark suspension links and the body move around them. Cache's straight
and two turn poses, hit pose, freight, courier and rival have separate contact
heights; the road texture and flying-traffic direction fixes are documented in
`docs/source-pack/CACHE_ROAD_VISUAL_CONTACT.md`.
The two steering paintings also show an outer front tire higher than the near
rear tire. After #118 review, each selected wheel clip and contact shadow has
its own top and bottom, including the raised outer tire in both directions.

The later camera pass makes the existing runtime suspension, tire spray and
rear-light motion readable in the 1280x720 drive. Traffic uses the same
anchored-wheel approach; Reduced Motion holds those effects. The recovered
paintings remain single poses, so this does not restore a missing sprite sheet.
