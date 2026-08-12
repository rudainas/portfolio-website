import type { ImageMetadata } from "astro";

import basquiat from "../assets/projects/basquiat-covers.jpg";
import yoko from "../assets/projects/yoko.jpg";
import dwa from "../assets/projects/dwa.jpg";
import bees from "../assets/projects/bees.jpg";

import blobPrints from "../assets/nav/blob-prints.svg?raw";
import blobBrand from "../assets/nav/blob-brand.svg?raw";
import blobUiDesign from "../assets/nav/blob-ui-design.svg?raw";

/**
 * The four projects, in the order Figma cycles them.
 *
 * Names, categories and titles are taken from the Figma frame names and label
 * text: Basquiat-Book-Covers (1521:3352), Yoko (1737:499), DWA (1748:644),
 * Bees (1748:721).
 *
 * Each category blob is a different shape AND angle, not just a recolour:
 *   Prints    blue   95.4723 x 48  rotated -10.56deg
 *   Brand     pink   95.4717 x 48  rotated +11.69deg
 *   UI Design yellow 112.473 x 48  upright
 *
 * NOTE: the Bees frame's title label in Figma reads "Delete Where Applicable"
 * — the same string as the DWA frame — and every title frame is named
 * "label-yoko". Both are copy-paste leftovers in the file. The real title is
 * "Visualizing Data", confirmed by the designer.
 */

export type Project = {
  /** Figma frame name; also the DOM key. */
  key: string;
  /** Category pill text and its blob. */
  category: string;
  categoryBlob: string;
  /** Blob aspect ratio, width / 48. */
  categoryAspect: string;
  /** Tilt applied to the whole category pill, in degrees. */
  categoryRotate: number;
  /** Title pill text. */
  title: string;
  image: ImageMetadata;
  alt: string;
  /** Whether clicking the featured card opens a case-study popup. */
  caseStudy?: boolean;
};

export const PROJECTS: Project[] = [
  {
    key: "basquiat",
    category: "Prints",
    categoryBlob: blobPrints,
    categoryAspect: "95.4723 / 48",
    categoryRotate: -10.56,
    title: "Basquiat- Book Covers",
    image: basquiat,
    alt: "Jean-Michel Basquiat book covers laid out on a leather couch",
    caseStudy: true,
  },
  {
    key: "yoko",
    // label-on-yoko (1744:629). The case study's own kicker reads "Branding"
    // (1796:6065) — that is the longer form and stays as it is.
    category: "Brand",
    categoryBlob: blobBrand,
    categoryAspect: "95.4717 / 48",
    categoryRotate: 11.69,
    title: "Yoko Matcha",
    image: yoko,
    alt: "Yoko Matcha storefront window with green lettering",
    caseStudy: true,
  },
  {
    key: "dwa",
    category: "Prints",
    categoryBlob: blobPrints,
    categoryAspect: "95.4723 / 48",
    categoryRotate: -10.56,
    title: "Delete Where Applicable",
    image: dwa,
    alt: "Yellow bound publication titled Delete Where Applicable",
    caseStudy: true,
  },
  {
    key: "bees",
    category: "UI Design",
    categoryBlob: blobUiDesign,
    categoryAspect: "112.473 / 48",
    categoryRotate: 0,
    title: "Visualizing Data",
    image: bees,
    alt: "Interactive exhibition screen showing a honey processing sequence",
    caseStudy: true,
  },
];
