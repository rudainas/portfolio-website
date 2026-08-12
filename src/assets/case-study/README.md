# Case-study images

One folder per case study, named after the project key:

```
src/assets/case-study/
  basquiat/
  yoko/
  dwa/
```

Studies with a scrolling strip keep those images separately, in
`src/assets/strip/<study>/` — they are a different shape and are laid out as a
rail rather than a column.

Drop files into the right folder and they appear on the page — no code change
needed. They are picked up at build time by `import.meta.glob` in
`src/components/ProjectPopup.astro`.

## Naming

The **numeric prefix sets the order**. Anything after it is used as the image's
alt text, so name it for what's in the picture:

```
01-storefront.jpg
02-laptop-mockup.jpg
```

A **letter suffix makes a row**: files sharing a number render side by side in
one frame. That's how Figma's paired frames are built.

```
04a-menu-board.jpg     ← left
04b-cup-in-hand.jpg    ← right
```

Some numbers are already taken by slots the site builds itself (the animated
doodles, the colour palette, the sketch strip, the type specimen). Skip those —
they're listed per study below.

## What's still needed

Open `/projects`, click a project, and the empty slots are labelled on screen
with their Figma frame name, node id and size. That list is the authority; the
tables below are a summary.

### basquiat

| Slot | Frame | Status |
|------|-------|--------|
| 01 | Frame 144 | uploaded |
| 02 | Frame 145 | uploaded |
| 03 | doodles-motion | built — animated SVGs |
| 04 | Frame 202 | uploaded |
| 05 | Frame 179 | uploaded |
| 06 | Frame 180 | uploaded |
| 07 | colour-pallete | built — draggable swatches |
| 08 | Frame 200 | built — scrollable sketch strip |

### yoko

| Slot | Frame | Status |
|------|-------|--------|
| 01 | Frame 144 — hero mockup | **needed** |
| 02 | Frame 145 — laptop, "Order Now" | **needed** |
| 03 | Frame 153 — storefront window | **needed** |
| 04a | Frame 154 — menu board | **needed** |
| 04b | Frame 158 — cup in hand | **needed** |
| 05 | Frame 174 — product lineup | **needed** |
| 06 | Frame 176 — type specimen | built — vector, `case-study-built/yoko-typeface.svg` |
| 07 | colour-pallete | built — draggable swatches |

### dwa

| Slot | Frame | Status |
|------|-------|--------|
| 01 | Frame 144 — cover on black | **needed** |
| 02 | Frame 145 — spread with inset photo | **needed** |
| 03 | Frame 153 — monochrome spread | **needed** |
| 04 | Frame 154 — yellow stock close-up | **needed** |
| 05 | Frame 176 — book with white pages | **needed** |
| 06 | Frame 175 — type specimen | built — vector, `case-study-built/dwa-typeface.svg` |
| 07 | colour-pallete | built — paper scan + white + black |
| 08 | Frame 143 — 17 book spreads | **needed** — goes in `src/assets/strip/dwa/` |

### bees

| Slot | Frame | Status |
|------|-------|--------|
| 01 | Frame 145 | **needed** |
| 02 | Frame 144 | **needed** |
| 03 | Frame 173 | **needed** |
| 04 | elements — eclipse / hexagons | built — vector |
| 05 | Frame 178 — process diagram 1 | built — vector |
| 06 | Frame 179 — process diagram 2 | built — vector |
| 07 | colour-pallete | built — four swatches |
| 08 | Frame 182 — 11 interface screens | **needed** — goes in `src/assets/strip/bees/` |

## Video

Video uses the same naming scheme as the stills — `03-storefront.mp4` takes
slot 3 just as `03-storefront.jpg` would. Supported: **`.mp4`** and `.webm`.

Videos play silently, loop, and have no controls: they are decoration in a
reading column, not something to operate. Readers who have asked for reduced
motion get them paused with controls instead.

One caveat: video does **not** go through Astro's image pipeline, so whatever
you export ships at that exact size. Compress it first — 1080p and a few MB at
most. Nothing will warn you if it is 200MB.

## Format and size

**JPEG for photographs, PNG only if the image needs transparency.** Astro
converts everything to WebP for delivery, so the source format only affects how
much quality survives that conversion — and a PNG photograph is a large file
for no gain.

Roughly **2064px wide** is the useful maximum: that's 2× the 1008px display
size, which covers retina. Astro generates 720 / 1080 / 1440 / 2064 variants
from whatever you give it, so anything larger is only bloating the repo.

> Two of the Basquiat sources are 9504px and 12MB each. The build output is
> unaffected (Astro downscales), but they sit in git at full weight forever.
> Worth re-exporting smaller before the first commit.

## Why `src/assets/` and not `public/`

Files in `public/` are copied to the build verbatim — full weight, no WebP, no
responsive variants. Only files under `src/assets/` go through `astro:assets`.
