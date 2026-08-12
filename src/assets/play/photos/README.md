# Play pieces

Drop images here and they appear on the Play page. No code change needed.

## Naming

The **numeric prefix orders them**. The rest of the name becomes the caption,
so write it as the caption you want:

```
01-big-sean-concept-poster.jpg   ->  BIG SEAN CONCEPT POSTER
02-motion-design-logo.jpg        ->  MOTION DESIGN LOGO
```

Words are title-cased automatically. If a caption needs casing a slug can't
carry (`SZA`, `UI`), add it to `CAPTIONS` in `src/data/play.ts` — `sza` is
already there as the example.

## Positions

Figma draws **five** positions, and the first five files take them in order.
Beyond that, extras are scattered on a fixed offset from the drawn ones so the
field stays evenly filled — and because the offset is deterministic, the field
still tiles against itself seamlessly.

To place a piece deliberately instead, add a slot to `SLOTS` in
`src/data/play.ts`. Each entry has `x`/`y`/`width`/`height` in Figma units
against the 1728 x 1117 cell, plus a `depth` — that one isn't in Figma, it sets
how much the piece lags during a drag, which is what gives the field its sense
of thickness. 1 is planted; lower floats more.

## Format

JPEG, around **900px wide** — they display at roughly 344px, so that covers
retina with room to spare. Astro generates the WebP variants.
