/**
 * Play page — Figma Play (1525:3680).
 *
 * An endless field of work the reader scrolls or drags through. Figma lays out
 * one screen of it; that screen is the CELL, and the cell repeats in every
 * direction, so the layout below is a tile pattern rather than a page.
 */

/** The Figma canvas the positions below are measured against. */
export const CELL = { width: 1728, height: 1117 };

export type Slot = {
  /** Top-left of the frame within the cell, in Figma units. */
  x: number;
  y: number;
  /** Frame width. Height comes from the artwork — see PlayField. */
  width: number;
  /**
   * Not from Figma. Drives the parallax: pieces at different depths lag by
   * different amounts as the field moves, so the plane reads as having some
   * thickness rather than being a flat sheet of stickers. 1 is planted, lower
   * floats more.
   */
  depth: number;
};

export type Piece = {
  /** Filename without extension, which is how a file finds its entry. */
  file: string;
  caption: string;
  /** Live work. The caption is underlined to say so. */
  href?: string;
  slot: Slot;
};

/**
 * Every piece, its caption, and where it sits.
 *
 * Scattered rather than gridded, following Figma's own arrangement: pieces sit
 * at unrelated heights, several run off the cell's edges, and no two share a
 * row or column. Positions were solved rather than eyeballed — each piece's
 * true height (its file's aspect, plus however many lines its caption wraps to)
 * checked against every other in all NINE wrapped positions, since a piece
 * crossing an edge reappears on the far side. The result clears by 57px at its
 * tightest.
 *
 * Re-solving is worth doing if pieces are added: the constraint is tight enough
 * that hand-placing a twelfth will almost certainly collide with something,
 * possibly only after it wraps.
 */
export const PIECES: Piece[] = [
  {
    file: "Clarity-Concept-Poster",
    caption: "Big Sean’s Clarity Concept Poster",
    slot: { x: 687, y: 623, width: 200, depth: 0.86 },
  },
  {
    file: "RS-Motion-Graphic",
    caption: "Motion Design Logo",
    slot: { x: 239, y: 14, width: 235, depth: 1.06 },
  },
  {
    file: "SZA-Poster",
    caption: "SZA Concept Poster",
    slot: { x: 1278, y: 699, width: 185, depth: 0.92 },
  },
  {
    file: "Scott-Pilgram-Poster",
    caption: "Scott Pilgram Concept Poster",
    slot: { x: 1521, y: 384, width: 215, depth: 1.08 },
  },
  {
    file: "Sleep-Interactive-UI-Visual",
    caption: "Interactive Infographic",
    href: "https://2021-project-3.vercel.app/",
    slot: { x: 934, y: 919, width: 230, depth: 0.9 },
  },
  {
    file: "Break-The-Ice",
    caption: "Editorial Poster of Jasper",
    slot: { x: 1364, y: 1033, width: 210, depth: 0.96 },
  },
  {
    file: "Scratch-Interactive",
    caption: "Interactive Brush Building Tool",
    href: "https://runny-tarot-80105519.figma.site/",
    slot: { x: 354, y: 805, width: 240, depth: 1.12 },
  },
  {
    file: "TTC-Poster",
    caption: "Futuristic Subway Advertisement",
    slot: { x: 1054, y: 314, width: 205, depth: 0.88 },
  },
  {
    file: "Kenya-Hara",
    caption: "Visual Poster inspired by Kenya Hara",
    slot: { x: 543, y: 40, width: 245, depth: 1.0 },
  },
  {
    file: "Memphis-Show",
    caption: "Memphis Era Poster",
    slot: { x: -26, y: 1022, width: 190, depth: 1.1 },
  },
  {
    file: "Little-Red-Riding-Hood",
    caption: "Interactive Fairy Tale",
    href:
      "https://www.figma.com/proto/HQHzyNT9uUrjsP2ugzILxm/" +
      "Rudaina--Little-Red-Riding-Hood--Copy-?node-id=372-396" +
      "&viewport=105%2C422%2C0.02&scaling=scale-down&content-scaling=fixed" +
      "&starting-point-node-id=372%3A396&page-id=372%3A395",
    slot: { x: 76, y: 499, width: 250, depth: 0.94 },
  },
];

/** Where an unlisted file lands, so a stray drop is still visible. */
export const FALLBACK_SLOT: Slot = { x: 560, y: -60, width: 300, depth: 1 };

/** `Big-Sean-Poster` -> `Big Sean Poster`, for files with no entry above. */
export function captionFromFile(file: string): string {
  return file.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Ink colours on the printer — Figma Frame 118 (1534:4370), left to right.
 * The value doubles as the swatch fill and the stroke the reader draws with.
 */
export const INKS = [
  { key: "sky", colour: "#95E1FF" },
  { key: "pink", colour: "#FF3A93" },
  { key: "yellow", colour: "#FFEA49" },
];
