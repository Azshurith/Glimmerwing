// Painted background images for the meadows, if any. The sky scenery is procedural by default; images listed here
// replace its far layer (the sky and the distant islands) and scroll as ONE continuous strip.
//
// To add your own: put the PNGs under assets/scenery/, import them here and list them bottom to top, so each
// image's top edge continues into the next image's bottom edge, e.g.
//
//     import sky1 from '@/../assets/scenery/sky-1.png';
//     import sky2 from '@/../assets/scenery/sky-2.png';
//     export const SCENERY_STRIPS: string[] = [sky1, sky2];
//
// They're scaled to the meadow's width. After the last image the strip starts over from the first, so for an
// unbroken loop the last image's top should continue into the first image's bottom. The procedural mid and near
// layers (islands, trees, waterfalls) still scroll over them.

/** The far-layer images, bottom to top (data URLs from the build). Empty: the far layer is painted procedurally. */
export const SCENERY_STRIPS: string[] = [];
