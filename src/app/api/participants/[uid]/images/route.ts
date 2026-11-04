import { apiHandler } from '../../../../../server/http';
import { ApiError } from '../../../../../server/errors';
import { MAX_PHOTO_BYTES, MAX_PHOTO_LABEL, listPhotos, savePhoto } from '../../../../../server/images';
import { reader, withTransaction } from '../../../../../server/mongo/tx';

type Ctx = { params: Promise<{ uid: string }> };

/** The current Module 5 photos of a participant (anyone signed in may see study data). */
export async function GET(_req: Request, { params }: Ctx) {
  const { uid } = await params;
  return apiHandler(async () => ({ photos: await listPhotos(reader, uid) }));
}

/** Attach a photo: multipart form with `file`, `timepoint`, `kind` (blood | plasma), `shot` (1-4) and `imageId` (the 4-digit ID). */
export async function POST(req: Request, { params }: Ctx) {
  const { uid } = await params;
  return apiHandler(
    async (user) => {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new ApiError(400, 'Send the photo as a form upload');
      }
      const file = form.get('file');
      if (!(file instanceof Blob)) throw new ApiError(400, 'No photo was sent');
      if (file.size > MAX_PHOTO_BYTES) throw new ApiError(413, `The photo is too large (${MAX_PHOTO_LABEL} at most)`);
      const bytes = Buffer.from(await file.arrayBuffer());
      const photo = await withTransaction({ userId: user.id, reason: 'Module 5 photo attached' }, (tx) =>
        savePhoto(tx, user, uid, { timepoint: form.get('timepoint'), kind: form.get('kind'), shot: form.get('shot'), imageId: form.get('imageId'), bytes }),
      );
      return { photo };
    },
    { mutating: true },
  );
}
