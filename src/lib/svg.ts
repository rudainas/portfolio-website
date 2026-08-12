/**
 * Prepare a Figma-exported SVG string for inlining into the DOM.
 *
 * Figma exports are inlined rather than used as <img> for one reason: GSAP can
 * only animate individual letters/shapes if their paths are real DOM nodes.
 *
 * Three problems with the raw exports that this fixes:
 *
 * 1. Duplicate ids. Every export numbers its layers from scratch, so two
 *    inlined files both contain id="Vector", id="Group", etc. Beyond being
 *    invalid HTML, colliding ids break `url(#clip...)` clip-path references —
 *    the second file's shapes get clipped by the first file's clipPath.
 *    Each id is namespaced with a per-file prefix, along with every reference.
 *
 * 2. `preserveAspectRatio="none"`. Figma sets this so the export matches its
 *    frame exactly, but it stretches the artwork whenever the container's
 *    aspect ratio drifts. Removed so the default (xMidYMid meet) applies.
 *
 * 3. Fixed width/height on the root <svg>. Replaced with 100% so the wrapper
 *    controls size. Only the root tag is touched — inner <rect width=...>
 *    elements inside clipPaths must keep their dimensions or clipping breaks.
 */
export function inlineSvg(raw: string, prefix: string): string {
  let out = raw;

  const ids = new Set<string>();
  for (const match of raw.matchAll(/\bid="([^"]+)"/g)) {
    ids.add(match[1]);
  }

  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Figma layer names can contain spaces ("Group 80"); slugify for safety.
    const next = `${prefix}-${id.replace(/\s+/g, "-")}`;

    out = out
      .replace(new RegExp(`\\bid="${escaped}"`, "g"), `id="${next}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, "g"), `url(#${next})`)
      .replace(new RegExp(`\\bhref="#${escaped}"`, "g"), `href="#${next}"`);
  }

  // Root <svg> tag only.
  out = out.replace(/<svg([^>]*)>/, (_full, attrs: string) => {
    const cleaned = attrs
      .replace(/\s(?:width|height)="[^"]*"/g, "")
      .replace(/\spreserveAspectRatio="[^"]*"/g, "")
      .replace(/\sstyle="[^"]*"/g, "");
    return `<svg${cleaned} width="100%" height="100%" focusable="false" aria-hidden="true">`;
  });

  return out;
}
