/**
 * Case-study content, one entry per project that has one.
 *
 * Figma builds each case study as two frames — a windowed popup and the
 * full-bleed study — but they are one component in two states, so a single
 * entry here drives both. See components/ProjectPopup.astro.
 *
 *   Basquiat  Project-Pop-up-Basquait (1785:3512) / Case-Study-Basquiat (1765:1104)
 *   Yoko      Project-Pop-up-Yoko     (1787:4355) / Case-Study-Yoko     (1785:3221)
 *
 * The two studies are NOT the same shape, which is the whole reason this is
 * data rather than markup: Basquiat has an "Additional Details ;)" panel where
 * Yoko has "Problem", Basquiat's media column carries animated doodles and a
 * sketch strip that Yoko has no equivalent of, and Yoko ends on a vector type
 * specimen that Basquiat has no equivalent of.
 */

import type { ImageMetadata } from "astro";

/** A run of copy. `italic` is for titles cited mid-sentence. */
export type Run = { text: string; italic?: boolean };

export type Panel = {
  /** DOM key; also namespaces the inlined accordion icons. */
  key: string;
  title: string;
  /** Exactly one panel per study starts open, matching Figma. */
  open: boolean;
  /** Paragraphs, each a list of runs. */
  body: Run[][];
  /** Credit blocks run as consecutive lines, not spaced paragraphs. */
  tight?: boolean;
};

export type Swatch = {
  /** Flat fill. Omitted when the card is a photograph instead — see `image`. */
  hex?: string;
  /**
   * A swatch that is a picture rather than a colour. DWA's first card is a
   * scan of the yellow cotton stock, because the paper's texture is the point
   * — a flat fill would say nothing about it.
   */
  image?: ImageMetadata;
  /**
   * Label text. Absent on cards Figma leaves unlabelled — the paper swatch has
   * no single hex to quote.
   */
  label?: string;
  /**
   * Label colour, set per card rather than derived. Figma flips the label to
   * paper on the dark swatches and keeps ink on the light ones; a computed
   * contrast pick would disagree with the file on the mid-tones.
   */
  ink: string;
};

/**
 * A horizontally scrolling strip of a physical artefact — Basquiat's sketches
 * (Frame 200, 1775:1621) and DWA's book spreads (Frame 143, 1796:6146).
 *
 * The same component in two very different dresses, so everything that differs
 * between them is configured rather than branched on: Basquiat's cards sit
 * spaced out on a yellow card, DWA's are full-height and OVERLAP each other
 * like a fanned book. Hence a negative gap being legal here.
 */
export type Strip = {
  /** Figma frame aspect, e.g. "1572 / 603". */
  frame: string;
  /** Frame fill; transparent where the artwork carries its own ground. */
  background: string;
  /** Card height as a percentage of the frame's. */
  cardHeight: string;
  /** Inset at each end, as a percentage of frame width. */
  pad: string;
  /** Space between cards. Negative overlaps them. */
  gap: string;
  /**
   * Corner radius on the FRAME. Omit for the site's usual rounding.
   */
  radius?: string;
  /**
   * Corner radius on each CARD, kept separate from the frame's.
   *
   * Bees rounds the rail hard (65px) while leaving its slides square — the
   * screens abut, so rounding them would punch notches of background out
   * between each pair, and the frame's own clip is what shapes the ends.
   */
  cardRadius?: string;
  /**
   * Card widths in Figma units, in order, against `cardWidthBasis`. Cycled if
   * there are more images than entries. Listed rather than read from the files
   * because touching an ImageMetadata property makes Vite emit the untouched
   * original into the build.
   */
  widths: number[];
  /** The height those widths are quoted against. */
  cardWidthBasis: number;
};

/**
 * A slot in the media column that is BUILT rather than uploaded.
 *
 * Uploaded photographs take their position from their filename prefix, so
 * these carry an explicit `at` to interleave with them. Numbers not claimed
 * here are the ones a file should be named for.
 */
export type BuiltSlot =
  | { at: number; kind: "doodles" }
  | { at: number; kind: "palette" }
  | { at: number; kind: "strip" }
  /* `motion` names a script that animates this vector once it scrolls into
     view; without it the frame is a still. */
  | { at: number; kind: "svg"; svg: string; alt: string; motion?: "elements" };

export type CaseStudy = {
  /** Matches Project.key, and the folder under src/assets/case-study/. */
  key: string;
  /** Bold lead-in of the intro sentence; uppercased in CSS. */
  title: string;
  /** The rest of the intro sentence. */
  lede: string;
  /** The category line under it. */
  kicker: string;
  panels: Panel[];
  palette: Swatch[];
  /**
   * Distance between palette card origins, in Figma units, against a card
   * width of 450. Their difference is the overlap.
   *
   * Needed because the count varies: three cards sit 278 apart, four sit 187.
   * Both rows still fill their block exactly — n cards less (n-1) overlaps
   * always comes back to the container width — so the component derives the
   * percentages from this one number rather than carrying a table of them.
   */
  paletteSpacing?: number;
  /**
   * Per-slot `object-position`, keyed by slot — "3", or "4a" for one half of a
   * pair.
   *
   * Every frame is Figma's 1008 x 690, so a portrait source has to be cropped
   * to fit. Centring is the right default but not always the right answer: it
   * is the middle of the FILE, which is rarely the middle of the subject. A
   * page with a wide blank margin at the top wastes half the frame on nothing
   * and then clips the content at the bottom.
   *
   * Higher percentages pull the image up, revealing more of its lower half.
   */
  crop?: Record<string, string>;
  /**
   * Per-slot `object-fit`, keyed the same way as `crop`.
   *
   * `cover` is the default and right for photographs: the frame is Figma's
   * 1008 x 690 whatever the source, and losing a little of a photograph's edge
   * costs nothing. It is wrong for a screen recording, where the cropped edge
   * is someone's interface — text and controls get sliced off. `contain` fits
   * the whole thing inside the frame instead; the frame's own black ground
   * fills whatever is left over.
   */
  fit?: Record<string, "cover" | "contain">;
  /**
   * Outbound link — Figma Link (1825:6364). Its own section in the accordion
   * column, sitting after the last panel rather than inside one: it is a way
   * out of the case study, not a fact about it.
   */
  link?: { label: string; href: string };
  /** Present only on studies whose column carries one. */
  strip?: Strip;
  built: BuiltSlot[];
  /**
   * Frames whose bitmaps have not been uploaded yet, shown as marked
   * placeholders so an empty slot never reads as a finished section. Listed
   * with the Figma node id and frame size so an export can be matched to its
   * slot without reopening the file.
   *
   * `at` is the number to name the file for, and also sorts the placeholder
   * into its Figma position among the built slots — so the empty state
   * previews the real running order rather than bunching at the end.
   *
   * `lane` is the letter suffix for slots that hold a pair. Each placeholder
   * disappears on its own as soon as its own file lands, so the column stays a
   * useful checklist while it is being filled in rather than all-or-nothing.
   */
  placeholders: { at: number; lane?: string; name: string; node: string; size: string }[];
};

/* Figma exports Frame 176 as a single vector — the whole specimen, black card
   and all — so it ships as SVG rather than a bitmap. ?raw keeps it inlinable,
   which is what lets inlineSvg() namespace its ids against the other inlined
   SVGs on the page. */
import yokoTypeface from "../assets/case-study-built/yoko-typeface.svg?raw";
import dwaTypeface from "../assets/case-study-built/dwa-typeface.svg?raw";
import dwaPaperSwatch from "../assets/case-study-built/dwa-swatch-paper.png";
import beesElements from "../assets/case-study-built/bees-elements.svg?raw";
import beesDiagram1 from "../assets/case-study-built/bees-diagram-1.svg?raw";
import beesDiagram2 from "../assets/case-study-built/bees-diagram-2.svg?raw";

export const CASE_STUDIES: CaseStudy[] = [
  {
    key: "basquiat",
    title: "Basquiat- Book Covers.",
    lede:
      "Every line, every colour, can be transformed to bring in life and energy. " +
      "Basquiat has proven time and time again, through his work, that art can be " +
      "expressive and unconventional. Take a look at the streets and how it works " +
      "so well with Basquiat’s principles.",
    kicker: "Print",
    panels: [
      {
        key: "starting",
        title: "Starting From Scratch",
        open: true,
        body: [
          [
            { text: "Redesign two book covers for " },
            { text: "Jean-Michel Basquiat: Of Symbols and Signs", italic: true },
            {
              text:
                ", one type-based and one image-based. Each cover had to feel " +
                "distinct while staying true to Basquiat's visual language.",
            },
          ],
        ],
      },
      {
        key: "context",
        title: "Context",
        open: false,
        body: [
          [
            {
              text:
                "Basquiat's work is loud, expressive, political, and deeply personal. " +
                "His work is built on raw mark-making, street culture, primary colours, " +
                "and handwritten text; nothing formal, nothing polished for politeness. " +
                "The original cover's typography felt like it belonged to a different " +
                "artist entirely.",
            },
          ],
        ],
      },
      {
        key: "concept",
        title: "Concept & Connections",
        open: false,
        body: [
          [
            {
              text:
                "One of the main issues I had with the original book cover was the " +
                "typography. The font used was very strong and formal, which did not " +
                "convey the intended feeling. When I think of Basquiat and his work, I " +
                "think of very loud and expressive art; nothing close to being formal " +
                "or rigid. This inspired me to convey that message using typography in " +
                "the cover. I started with a Basquiat-inspired font built from his " +
                "handwriting, and then created the “loud expressions” through the " +
                "colours and doodles he uses throughout his work. Since I still wanted " +
                "the text to be the main focus, I used graphics to emphasize it. To keep " +
                "cohesion throughout the book, I drew the doodles on the spine and back " +
                "cover as well.",
            },
          ],
          [
            {
              text:
                "Reflecting on Basquiat’s work, he uses a lot of lines and sometimes has " +
                "graffiti or street style that he uses in his art. Using actual graffiti " +
                "of a face I found in the streets of downtown Toronto, I decided to " +
                "incorporate it into my cover. I wanted it to be loud and in your face. " +
                "To put my own spin on it, I tried to make it look like a collage, as if " +
                "it were paper pasted onto another. I continued this theme with the " +
                "graphics on the back cover. I wanted to keep that informal text he uses " +
                "but also keep a simple background as the images themselves were loud " +
                "enough.",
            },
          ],
        ],
      },
      {
        key: "details",
        title: "Additional Details ;)",
        open: false,
        body: [
          [
            {
              text:
                "This project didn't feel like work. There was no rigid plan, no " +
                "predetermined steps, no dread, just starting and then not being able to " +
                "stop. Both covers ultimately make the same argument in different ways: " +
                "that authenticity and intention aren't opposites. The type cover " +
                "channels Basquiat's visual vocabulary directly through his marks, his " +
                "colours, his handwriting, while the image cover finds that same spirit " +
                "on Toronto's streets, suggesting that what Basquiat was doing wasn't so " +
                "different from what anonymous artists do on city walls every day. " +
                "Neither one was made with an agenda. It was creativity for its own sake.",
            },
          ],
        ],
      },
      {
        key: "made",
        title: "Made...",
        open: false,
        tight: true,
        body: [
          [{ text: "By: Rudaina Suwaiba" }],
          [{ text: "Using: Photoshop + InDesign" }],
          [{ text: "In November of 2024" }],
        ],
      },
    ],
    /* Figma colour-pallete (1767:1592). The blue card takes a paper label for
       contrast; red and yellow keep ink. */
    palette: [
      { hex: "FA0000", label: "HEX: FA0000", ink: "var(--color-ink)" },
      { hex: "00B8FF", label: "HEX: 00B8FF", ink: "var(--color-paper)" },
      { hex: "FFE900", label: "HEX: FFE900", ink: "var(--color-ink)" },
    ],
    /* Figma Frame 200 (1775:1621) — cards spaced out on a yellow card, each
       keeping its own drawn width. */
    strip: {
      frame: "1572 / 603",
      background: "#F3E10B",
      cardHeight: "86.235%",
      pad: "2.545%",
      gap: "2.036%",
      widths: [402, 432, 402, 431, 402, 431, 401, 431],
      cardWidthBasis: 520,
    },
    built: [
      { at: 3, kind: "doodles" },
      { at: 7, kind: "palette" },
      { at: 8, kind: "strip" },
    ],
    placeholders: [
      { at: 1, name: "Frame 144", node: "1790:5811", size: "1008 × 690" },
      { at: 2, name: "Frame 145", node: "1790:5812", size: "1008 × 690" },
      { at: 4, name: "Frame 202", node: "1790:5825", size: "1008 × 690" },
      { at: 5, name: "Frame 179", node: "1790:5826", size: "1008 × 690" },
      { at: 6, name: "Frame 180 — a / B / s lettering", node: "1790:5828", size: "1008 × 690" },
    ],
  },

  {
    key: "yoko",
    title: "Yoko Matcha.",
    lede:
      "In a fast paced city, the moments that are grounded are so cherished. " +
      "Matcha is born in remote and quiet farm, bringing in tranquility with " +
      "every sip. Enjoy the slow moments, even through the hustle culture.",
    kicker: "Branding",
    panels: [
      {
        key: "starting",
        title: "Starting From Scratch",
        open: true,
        body: [
          [
            {
              text:
                "Design a brand identity and menu card for Yokō, a Japanese matcha " +
                "café inspired by Tokyo's quiet side streets and fast-paced city life.",
            },
          ],
        ],
      },
      {
        key: "context",
        title: "Context",
        open: false,
        body: [
          [
            {
              text:
                "Matcha is a rural, harvested product. Slow, ceremonial, and deeply " +
                "tied to nature. The brief asked for a brand that could hold that " +
                "origin while living in an urban environment. Feeling the tension " +
                "between those two worlds became the design direction I chose.",
            },
          ],
        ],
      },
      {
        key: "problem",
        title: "Problem",
        open: false,
        body: [
          [
            {
              text:
                "As my first branding project, it was a fun challenge to find ways to " +
                "build a brand. The big question was, how do you translate something " +
                "as earthy and slow as matcha into a visual language that belongs in " +
                "the city without losing its soul?",
            },
          ],
        ],
      },
      {
        key: "concept",
        title: "Concept & Connections",
        open: false,
        body: [
          [
            {
              text:
                "The dark palette does the heavy lifting here and reads as industrial, " +
                "urban texture, the kind of café tucked into a Tokyo backstreet. " +
                "However, the green still stands out unmistakably as matcha. It's the " +
                "countryside brought into the city without softening it.",
            },
          ],
          [
            {
              text:
                "Besides the colours, the typefaces were the main highlight. Aptly " +
                "Bold, was the prominent twist. Wide, rounded, almost playful, it " +
                "contrasts the seriousness of the dark palette in the same way matcha " +
                "contrasts its setting; something natural and light-hearted surviving " +
                "in a fast environment. It also made a standalone wordmark possible; " +
                "the type is the identity.",
            },
          ],
          [
            {
              text:
                "Space Mono for body text reinforces the urban, practical side; a " +
                "monospaced type carries a quiet industrial energy that grounds the " +
                "warmer elements of the café interior.",
            },
          ],
        ],
      },
      {
        key: "made",
        title: "Made...",
        open: false,
        tight: true,
        body: [
          [{ text: "By: Rudaina Suwaiba" }],
          [{ text: "Using: Figma + Photoshop + Illustrator + Lightroom" }],
          [{ text: "In July of 2025" }],
        ],
      },
    ],
    /* Figma colour-pallete (1796:6079). The near-black card takes a paper
       label; the matcha green and the light grey keep ink. */
    palette: [
      { hex: "718355", label: "HEX: 718355", ink: "var(--color-ink)" },
      { hex: "1E1E1E", label: "HEX: 1E1E1E", ink: "var(--color-paper)" },
      { hex: "D9D9D9", label: "HEX: D9D9D9", ink: "var(--color-ink)" },
    ],
    /* Slot 4 is a PAIR (Frame 172 — two 460x690 frames side by side). It needs
       no entry here: two uploads sharing a prefix render as a row. See
       ProjectPopup.astro. */
    built: [
      { at: 6, kind: "svg", svg: yokoTypeface, alt: "Aptly Bold typeface specimen" },
      { at: 7, kind: "palette" },
    ],
    placeholders: [
      { at: 1, name: "Frame 144", node: "1796:6069", size: "1008 × 690" },
      { at: 2, name: "Frame 145", node: "1796:6070", size: "1008 × 690" },
      { at: 3, name: "Frame 153", node: "1796:6071", size: "1008 × 690" },
      // Slot 4 is Figma's paired row — two files, 04a and 04b.
      { at: 4, lane: "a", name: "Frame 154 — 04a, left of pair", node: "1796:6073", size: "460 × 690" },
      { at: 4, lane: "b", name: "Frame 158 — 04b, right of pair", node: "1796:6074", size: "460 × 690" },
      { at: 5, name: "Frame 174", node: "1796:6075", size: "1008 × 690" },
    ],
  },

  {
    key: "dwa",
    title: "Delete Where Applicable.",
    lede:
      "The art of simplicity and slowing down changes over time. Let us travel " +
      "back to the 20th century, where luxuries were limited. Photographs were " +
      "reduced to the essence of memory. Cut the noise, colour, and " +
      "distractions; find purpose in the core of the output.",
    kicker: "Publication",
    panels: [
      {
        key: "starting",
        title: "Starting From Scratch",
        open: true,
        body: [
          [
            {
              text:
                "“Delete Where Applicable” was the title that I set eyes on apart " +
                "from the hundreds of others given. I developed a concept and " +
                "brought this title to life; a book dedicated to being a pause " +
                "from the clutter of modern society.",
            },
          ],
        ],
      },
      {
        key: "problem",
        title: "Problem",
        open: false,
        body: [
          [
            {
              text:
                "Developing a cohesive story through images, text, and pacing for " +
                "a physical book was a curve to navigate. Translating a " +
                "screen-design mindset into a tactile design involved battling the " +
                "tension between dumping every thought into the book and " +
                "simplifying it. The book needed to have character whilst keeping " +
                "the minimalist message without it being too literal. I wanted to " +
                "keep at least one spread to contrast the idea of minimalism while " +
                "keeping the elements consistent throughout the whole book.",
            },
          ],
        ],
      },
      {
        key: "concept",
        title: "Concept & Connections",
        open: false,
        body: [
          [
            {
              text:
                "I find myself minimizing wherever I can in life, whether it's the " +
                "material items I own or connections that no longer bring purpose. " +
                "When we cut off excess unnecessary weight in our lives, we feel " +
                "lighter and clearer-minded. The black & white imagery throughout " +
                "the book embodies this message of reducing to the necessities. " +
                "Colour, noise, and distraction are gone. What remains is form, " +
                "light, and subject. The monochrome images don't just illustrate " +
                "the text; they perform it. In the early to mid 20th century, the " +
                "luxuries of materialistic wealth were not considered the standard. " +
                "Consumerism has become a globalized issue, and it even boils down " +
                "to the technology we use. Everything has become a means of " +
                "convenience rather than a source of gratitude for the little " +
                "things in life. The primary subjects are people, ordinary moments, " +
                "and human connection. When we talk about decluttering, we're " +
                "usually talking about relationships, expectations, and the " +
                "emotional weight we carry from others. The photographs quietly " +
                "hold that truth without stating it. However, excessive " +
                "decluttering can leave a person feeling lonely and disconnected. " +
                "As humans, we crave connection and need it to grow; that is why " +
                "there is one spread highlighting a setting where people come to " +
                "connect. Deleting where applicable, does not mean deleting " +
                "everything in life, but where you can.",
            },
          ],
        ],
      },
      {
        key: "details",
        title: "Additional Details ;)",
        open: false,
        body: [
          [
            {
              text:
                "This book was a petite canvas to work on, a 5.25 x 7.75-in paper. " +
                "Minimizing the size was intentional to keep only the necessary " +
                "contents. The fun alignment of the images and text was the most " +
                "enjoyable part of creating the book's flow and pacing. There are " +
                "pages in the book where the photo is aligned and sized to the " +
                "text, but it is only visible when the light hits the page, with " +
                "the alignment visible as a transparency. Creating the book's " +
                "pacing allowed for the calmness it implies. Yellow is the most " +
                "visually “loud” colour, so the minimalism makes the yellow louder. " +
                "It represents clutter you chose to keep; the joy that wasn’t " +
                "edited out. The yellow paper contains 45% cotton, which adds " +
                "texture and makes it engaging to the touch. These fun elements " +
                "brought the piece together!",
            },
          ],
        ],
      },
      {
        key: "made",
        title: "Made...",
        open: false,
        tight: true,
        body: [
          [{ text: "By: Rudaina Suwaiba" }],
          [{ text: "Using: InDesign + Photoshop" }],
          [{ text: "In November of 2025" }],
        ],
      },
    ],
    /* The monochrome spread is a tall portrait page whose top third is empty
       margin. Centred, the frame filled with blank paper and clipped the last
       line of the passage and the girls' feet; pulled up, the whole text block
       and both figures sit inside it. */
    crop: { "3": "center 65%" },
    /* Figma colour-pallete (1796:6140). The first card is a scan of the yellow
       cotton stock rather than a fill, and Figma leaves it unlabelled — there
       is no single hex to quote for a textured paper. */
    palette: [
      { image: dwaPaperSwatch, ink: "var(--color-ink)" },
      { hex: "FFFFFF", label: "HEX: FFFFFF", ink: "var(--color-ink)" },
      { hex: "000000", label: "HEX: 000000", ink: "var(--color-paper)" },
    ],
    /* Figma Frame 143 (1796:6146) — seventeen book spreads at full frame
       height, each sitting ON the one before it. The overlap is what gives the
       fanned-book look, and is why the gap is negative.

       Figma overlaps them by 261 of 1575 (16.6%), but its frames are crops of
       the book alone. The photographs are the book on a wide black ground, so
       at that overlap the next card's black margin covered the previous page.
       Pulled back to 8%: still clearly fanned, but each spread is fully
       visible before the following one begins. */
    strip: {
      frame: "1575 / 603",
      background: "transparent",
      cardHeight: "100%",
      pad: "0%",
      gap: "-8%",
      widths: [886.735],
      cardWidthBasis: 603,
    },
    built: [
      { at: 6, kind: "svg", svg: dwaTypeface, alt: "Book typeface specimen" },
      { at: 7, kind: "palette" },
      { at: 8, kind: "strip" },
    ],
    placeholders: [
      { at: 1, name: "Frame 144 — cover on black", node: "1796:6132", size: "1008 × 690" },
      { at: 2, name: "Frame 145 — spread with inset photo", node: "1796:6133", size: "1008 × 690" },
      { at: 3, name: "Frame 153 — monochrome spread", node: "1796:6134", size: "1008 × 690" },
      { at: 4, name: "Frame 154 — yellow stock close-up", node: "1796:6135", size: "1008 × 690" },
      { at: 5, name: "Frame 176 — book with white pages", node: "1796:6136", size: "1008 × 690" },
    ],
  },

  {
    key: "bees",
    title: "The Loss of Liquid Gold.",
    lede:
      "Common processes that are well known tend to get overlooked. The " +
      "importance of bees seem to have lost it’s value amongst society. So what " +
      "if there really was a world where bees no longer existed and no one knew " +
      "what they were?",
    kicker: "Interactive Design",
    panels: [
      {
        key: "starting",
        title: "Starting From Scratch",
        open: true,
        body: [
          [
            {
              text:
                "Visualizing information is an effective way to communicate and " +
                "digest information. This project aimed to visualize processes, " +
                "specifically how bees make honey, through an interactive interface.",
            },
          ],
        ],
      },
      {
        key: "context",
        title: "Context",
        open: false,
        body: [
          [
            {
              text:
                "Set in a dystopian future where bees have gone extinct and honey " +
                "no longer exists. The audience is reframed as people in a " +
                "futuristic world interacting with a holographic projection device, " +
                "similar to scrolling on a tablet, learning about something their " +
                "world has entirely lost.",
            },
          ],
        ],
      },
      {
        key: "problem",
        title: "Problem",
        open: false,
        body: [
          [
            {
              text:
                "The brief asked for a process to be broken into clear steps, but a " +
                "literal explainer felt flat for the subject. Bee extinction isn't " +
                "just informational; it's a loss. The challenge was building a " +
                "system that could teach the process of honey-making while making " +
                "the audience feel its absence.",
            },
          ],
        ],
      },
      {
        key: "concept",
        title: "Concept & Connections",
        open: false,
        body: [
          [
            {
              text:
                "The whole interface runs on one extended metaphor: honey as liquid " +
                "gold, light as life. The landing page opens with an eclipse, the " +
                "sun blocked, since the sun and bees both give life, and losing " +
                "either signifies their disappearance. The gold light glowing " +
                "through the eclipse stands in for the honey itself.",
            },
          ],
          [
            {
              text:
                "Hexagons are used throughout the story to symbolize the root of the " +
                "process: a home. Hexagons are full and empty to represent nectar " +
                "passing from bee to bee. A hexagon at the centre acts as the bee's " +
                "stomach, storing nectar, the imagery suggesting something almost " +
                "like a black hole pulling it in. By the end, the hive reappears as " +
                "a filed report, beekeepers once harvested honey, and the emptying " +
                "hexagons represent the honey being taken.",
            },
          ],
          [
            {
              text:
                "Interaction design reinforces the futuristic, tactile world the " +
                "brief invented. Static electricity animations on key images, " +
                "typewriter text revealing each step, and small arrow indicators all " +
                "mimic the gestures of a holographic device, something meant to be " +
                "tapped and scrolled through by hand.",
            },
          ],
          [
            {
              text:
                "Colour went through its own rethink. The instinct for sci-fi and " +
                "holograms is usually cool tones, blacks and whites. Looking to Dune " +
                "shifted that: deserts are lifeless but warm-toned, and that " +
                "contrast (warmth representing life, even in a barren setting) fits " +
                "the honey and bee theme more honestly than the expected cool " +
                "palette would.",
            },
          ],
        ],
      },
      {
        key: "made",
        title: "Made...",
        open: false,
        tight: true,
        body: [
          [{ text: "By: Rudaina Suwaiba" }],
          [{ text: "Using: Photoshop + Figma" }],
          [{ text: "In January of 2026" }],
        ],
      },
    ],
    link: {
      label: "Link",
      href:
        "https://www.figma.com/proto/1wi5qZrZoogcv2UQokboa4/" +
        "Project-1--Visualizing-a-Process?node-id=251-352&viewport=78%2C303%2C0.07" +
        "&scaling=scale-down-width&content-scaling=fixed" +
        "&starting-point-node-id=251%3A352&page-id=251%3A338",
    },
    /* Figma colour-pallete (1796:6269) — FOUR cards rather than three, so they
       sit closer together to fill the same block.

       NOTE: at 187 apart the visible strip of each card is narrower than its
       own hex label, so every label but the last is clipped by the card that
       follows it. That is what the file does — the three-card palettes do not
       show it because 278 leaves room. Fixable by painting the cards in
       reverse, first on top, which is what the DWA strip does; left matching
       Figma until that is a decision rather than a guess. */
    palette: [
      { hex: "F0C800", label: "HEX: F0C800", ink: "var(--color-ink)" },
      { hex: "C7891A", label: "HEX: C7891A", ink: "var(--color-ink)" },
      { hex: "360800", label: "HEX: 360800", ink: "var(--color-paper)" },
      { hex: "000000", label: "HEX: 000000", ink: "var(--color-paper)" },
    ],
    paletteSpacing: 187,
    /* The landing recording is 1440x930 against a 1008x690 frame — cropping it
       to fill sliced the interface, so it is fitted whole and the frame's black
       ground carries the remainder. */
    fit: { "1": "contain" },
    /* Figma Frame 182 (1796:6278) — eleven 16:9 slides laid edge to edge. No
       overlap here, unlike DWA's book: these are screens, and a screen half
       behind another reads as broken rather than fanned. */
    strip: {
      /* Taller than Figma's 1575 x 603 letterbox, which rendered only 348px
         high — barely half of every other frame in the column, so the screens
         read as thumbnails rather than as the work.

         Sized so a slide fills about five sixths of the rail: big enough to
         read, while the next one still shows at the edge. Matching the column's
         full 1008 x 690 was too far — one screen filled the rail exactly and
         nothing followed it, so the strip stopped looking scrollable. */
      frame: "1575 / 738",
      background: "transparent",
      cardHeight: "100%",
      pad: "0%",
      gap: "0%",
      /* Figma Frame 182 (1788:5358) rounds the rail by 65px and leaves the
         slides square.

         Quoted against the FRAME rather than the canvas — 65 of its 1575 width
         — because a cqw value is calibrated to the 1728 canvas, which made the
         corner ~44% too round given how much narrower the rail renders.

         The two percentages are the horizontal and vertical radii. The second
         is derived from the frame's aspect so both resolve to the same pixel
         value, keeping the corner a true quarter-circle; it has to be redone
         whenever `frame` changes, or the corner turns elliptical. */
      radius: "4.127% / 8.808%",
      cardRadius: "0",
      widths: [1071.8578],
      cardWidthBasis: 602.92,
    },
    built: [
      {
        at: 4,
        kind: "svg",
        svg: beesElements,
        alt: "Interface elements — reticle, hexagons and panel outlines",
        motion: "elements",
      },
      { at: 5, kind: "svg", svg: beesDiagram1, alt: "Process diagram, part one" },
      { at: 6, kind: "svg", svg: beesDiagram2, alt: "Process diagram, part two" },
      { at: 7, kind: "palette" },
      { at: 8, kind: "strip" },
    ],
    placeholders: [
      { at: 1, name: "Frame 145", node: "1796:6209", size: "1008 × 690" },
      { at: 2, name: "Frame 144", node: "1796:6210", size: "1008 × 690" },
      { at: 3, name: "Frame 173", node: "1796:6211", size: "1008 × 690" },
    ],
  },
];

export const CASE_STUDY_KEYS = CASE_STUDIES.map((study) => study.key);
