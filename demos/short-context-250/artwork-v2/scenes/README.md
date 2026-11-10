# Scene artwork candidates — #250 revision 2

Eight selected illustrations for the short contextual demo: four literal-cat / closed-box positions and four matching-cottage locations. New artwork remains pending owner review; this folder does not approve production activation.

Generation used the built-in `image_gen` tool, one call per asset or targeted revision, with `transparent_background: true`. Nine original outputs are preserved byte-for-byte in `originals/`. The first box-left version was rejected for a landscape canvas and broad violet alpha glow; the selected v2 corrects those defects. The rejected original remains in the asset's `versions` history.

`requests.json` preserves all eight initial prompts, approved reference paths/roles and SHA256 hashes. `box-left-revision-v2-request.json` preserves the targeted edit. `records/` and `manifest.json` bind selected originals, generator output paths, exact prompts, hashes, alpha measurements and visual inspection notes. Only previously approved style/character/house sources were used as generation references. The unapproved first box-left candidate was used solely as its own edit target.

All eight selections are square RGBA PNGs with transparent exterior and opaque subject pixels. Full-size semantic inspection and 145px inspection over white, yellow, pink and lavender backgrounds passed; the browser decoded all 32 preview instances. See `review.html` and `review-145px.png`. `inspect.mjs` regenerates that manual review screenshot, separately from routine app tests.

The box-above option deliberately uses a separated-object spatial diagram with a clear gap, without adding furniture or invented supports. The correct box-below option shows the cat physically sitting on the closed lid. The four location scenes keep the same golden cottage and lavender roof, while changing only the broad location context.
