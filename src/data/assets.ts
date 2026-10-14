/**
 * Login illustrations, served from /public. Vector SVGs exported from the Figma file
 * "SMART-TB login illustration" (https://www.figma.com/design/kvxTM7imhpNOLBKGpMtyL6), so they stay sharp
 * at any size and are passed through next/image unoptimized.
 *   login-hero-desktop.svg  (1536×1024, art on the right, dark copy-space on the left)
 *   login-hero-mobile.svg   (1024×1536, art on top, dark copy-space below)
 * Set a value to '' to fall back to the CSS gradient backdrop.
 */
export const HERO_DESKTOP_URL = '/login-hero-desktop.svg';
export const HERO_MOBILE_URL = '/login-hero-mobile.svg';

/** Brand backdrop used behind the login art and on the loading screen. */
export const HERO_FALLBACK =
  'radial-gradient(ellipse 70% 60% at 95% 100%, rgba(0,237,100,0.85) 0%, rgba(0,104,74,0.75) 40%, rgba(2,47,56,0) 75%), radial-gradient(ellipse 45% 55% at 85% 15%, rgba(127,227,211,0.22) 0%, rgba(2,47,56,0) 70%), #022f38';
