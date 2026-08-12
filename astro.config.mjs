// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  /**
   * The deployed address. Not cosmetic: `og:image` and canonical links have to
   * be absolute URLs — a relative path is silently ignored by every social
   * platform — and Astro builds them from this value. If the domain ever
   * changes, this is the one line to change.
   */
  site: 'https://rudainasuwaiba.com',
});
