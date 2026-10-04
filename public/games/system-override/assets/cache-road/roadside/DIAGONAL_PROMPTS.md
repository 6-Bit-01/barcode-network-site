# Historical long-strip diagonal roadside source prompts

The owner rejected these joined scenes after reviewing the result. The
individual source art in `places/` replaces them. This prompt record is kept
to explain what was tried, not to direct current runtime art.

The six source PNGs were made with built-in image generation, using the prior
horizontal market/depot/frontage PNG only as a **style/architecture reference**.
Each request explicitly rejected the reference's horizontal elevation and
asked for true transparent alpha. The common style was weathered navy
industrial BARCODE city art, rain reflections, warm occupied windows and
restrained cyan/magenta/amber light; no road, car, sky, UI or legible signs.

| Output | Final composition instruction |
| --- | --- |
| Market left | Large close market/studio storefront and wide wet sidewalk at lower left; connected buildings, rooflines, doors and plinth shrink toward upper right. |
| Market right | Tiny connected shops at upper left grow toward large occupied storefront and broad pavement at lower right. |
| Depot left | Detailed foreground repair bay at lower left; connected relay workshops and loading platform converge toward upper right. |
| Depot right | Small service bays at upper left lead to a large close relay garage and tower at lower right. |
| Frontage left | Quieter, darker service row with few windows; continuous sidewalk goes from large lower left to tiny upper right. |
| Frontage right | Quieter service row with an unbroken plinth goes from tiny upper left to large lower right. |

The perspective is authored inside each image. Runtime placement registers its
painted near and far curb points to the road; it does not create the building
perspective by slicing a flat strip. Original generated outputs are retained
by the image workflow; the rejected repository reductions were removed in the
individual-places correction and remain available in Git history.
