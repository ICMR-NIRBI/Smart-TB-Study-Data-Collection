/**
 * Preview mode: every module can be opened and stepped through with Previous / Next, without filling or locking
 * anything — for reviewing the pages. Locking a module still requires its turn in the sequence and valid data.
 *
 * On by default in `npm run dev`; off in production builds unless NEXT_PUBLIC_CRF_PREVIEW=true.
 * Set NEXT_PUBLIC_CRF_PREVIEW=false (e.g. in .env.local) to test the real strict gating locally.
 * Must be off before real participant data is entered.
 */
const flag = process.env.NEXT_PUBLIC_CRF_PREVIEW;

export const PREVIEW_MODE = flag === 'true' || (flag !== 'false' && process.env.NODE_ENV !== 'production');
