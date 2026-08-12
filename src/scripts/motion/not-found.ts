import gsap from "gsap";
import { DUR, EASE } from "./tokens";

/**
 * Motion for the 404's "Back Home" cloud.
 *
 * Same language as the hero CTA: an idle float on the whole button so the
 * label travels with the shape, and a hover squash on the shape alone so the
 * text never skews.
 *
 * Entrance and hover both live inside a matchMedia block, so the whole thing
 * reverts cleanly if the motion preference changes mid-session.
 */
export function initBackHome(button: HTMLElement): () => void {
  const shape = button.querySelector<HTMLElement>("[data-back-home-shape]");
  const label = button.querySelector<HTMLElement>(".back-home__label");

  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.from(button, {
      autoAlpha: 0,
      scale: 0.5,
      yPercent: 20,
      duration: DUR.slow,
      ease: EASE.popLoud,
      delay: 0.35,
    });

    // Idle float on the button, not the shape — see CloudButton.astro.
    const idle = gsap.to(button, {
      y: -7,
      duration: DUR.drift * 0.55,
      ease: EASE.loop,
      repeat: -1,
      yoyo: true,
      delay: 1.1,
    });

    if (!shape || !label) return () => idle.kill();

    const enter = () => {
      gsap.to(shape, {
        scaleX: 1.07,
        scaleY: 0.94,
        duration: DUR.fast,
        ease: EASE.pop,
        transformOrigin: "50% 100%",
      });
      gsap.to(label, { scale: 1.05, duration: DUR.fast, ease: EASE.pop });
    };
    const leave = () => {
      gsap.to(shape, {
        scaleX: 1,
        scaleY: 1,
        duration: DUR.base,
        ease: "elastic.out(1, 0.45)",
      });
      gsap.to(label, { scale: 1, duration: DUR.fast, ease: EASE.pop });
    };
    const press = () =>
      gsap.to(shape, { scaleX: 0.94, scaleY: 1.06, duration: 0.1, ease: "power2.out" });

    button.addEventListener("pointerenter", enter);
    button.addEventListener("pointerleave", leave);
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", enter);
    button.addEventListener("focus", enter);
    button.addEventListener("blur", leave);

    return () => {
      button.removeEventListener("pointerenter", enter);
      button.removeEventListener("pointerleave", leave);
      button.removeEventListener("pointerdown", press);
      button.removeEventListener("pointerup", enter);
      button.removeEventListener("focus", enter);
      button.removeEventListener("blur", leave);
      idle.kill();
    };
  });

  return () => mm.revert();
}
