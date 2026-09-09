# Slider photography refresh

The homepage's four hero photographs and six course photographs are replaced with individual ChatGPT Pro CDP generations. The previous school image used an owl-like toy and synthetic-looking wall lettering; other hero photographs used a simplified earlier mascot.

## Character and brand rules

- Baija (called Bajla in the application) is a purple pigeon. Use the final social-media-kit likeness: plump body, heavy half-closed eyelids, long lashes, three-feather crest, orange beak, purple collar and round bell, and a knowing expression.
- A photographed doll should have credible plush texture, seams, weight and contact shadows. Avoid owl facial discs, ear tufts, white belly patches and bead-eyed legacy toys.
- In-scene EnglishMetro branding uses the supplied horizontal skyline-and-wordmark logo. It is physically printed on attached posters or fabric banners, with material texture, perspective and light falloff. Generic serif lettering is not an acceptable substitute. Preserve the skyline on the left and the single-line wordmark.
- Mix dark and light printed materials. The light variant uses warm-white paper or fabric, navy `English`, purple/pink `Metro` and the smaller `.com`, following the user's light-logo reference and `public/brand/email/englishmetro-lockup-v2@2x.png`.
- Preserve varied adult learners and settings, including learners in their 20s through 60s, warm conversations, natural hands and believable video-call screens.
- Keep existing UI captions, translations, AI-generation notices and slider behaviour intact.

## Sources

Generation conversation: https://chatgpt.com/c/6aa09749-136c-83eb-b15c-c0c30525a0da

Character authority: `MASTER_Profile_Icon_1254x1254.png` from the final English Metro social-media kit. Brand authority: the user's current header-logo screenshot, supported by the existing `public/brand/email/englishmetro-lockup-dark-v2@2x.png` asset.

Generation and image revisions run exclusively in ChatGPT through the installed Pro CDP plugin. Local processing only resizes and encodes the generated images as WebP. Hero encoding preserves the original aspect ratio; the slider's 16:7 crop is reviewed separately. Course images are generated individually, replacing the previous small crops from a six-scene sheet.

No production publication has been performed by this change preparation.

The refreshed files use `/home/slider-20260909/` URLs to avoid stale image caches and to retain the previous image set for rollback. Existing slide copy and controls are preserved.

Validation: production build passed with npm run build -- --configLoader native; all ten assets are present in dist. WebP decoding, dimensions and copy hashes passed. Git diff whitespace checks passed.

