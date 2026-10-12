/**
 * Preloaded via `node --require` (see package.json scripts).
 *
 * This project lives on an exFAT drive, where Node's readlink fails with EISDIR for regular files instead of
 * EINVAL ("not a symlink"). Webpack treats EISDIR as fatal, so translate it back to the error it expects.
 * It must load before Next.js, whose bundled graceful-fs captures fs.readlink at require time.
 * Safe to delete (and drop the --require flags) if the project moves to an NTFS drive.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CommonJS preload, runs before any bundler
const fs = require('node:fs');

if (!fs.__exfatReadlinkPatched) {
  fs.__exfatReadlinkPatched = true;

  const toEinval = (err) => {
    if (err && err.code === 'EISDIR') {
      err.code = 'EINVAL';
      err.errno = -4071;
    }
    return err;
  };

  const readlink = fs.readlink;
  fs.readlink = function patchedReadlink(path, ...args) {
    const cb = args.pop();
    return readlink.call(fs, path, ...args, (err, link) => cb(toEinval(err), link));
  };

  const readlinkSync = fs.readlinkSync;
  fs.readlinkSync = function patchedReadlinkSync(...args) {
    try {
      return readlinkSync.apply(fs, args);
    } catch (err) {
      throw toEinval(err);
    }
  };

  const readlinkPromise = fs.promises.readlink;
  fs.promises.readlink = async function patchedReadlinkPromise(...args) {
    try {
      return await readlinkPromise.apply(fs.promises, args);
    } catch (err) {
      throw toEinval(err);
    }
  };
}
