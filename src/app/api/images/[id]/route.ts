import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../../server/auth';
import { ApiError } from '../../../../server/errors';
import { errorResponse } from '../../../../server/http';
import { readPhoto } from '../../../../server/images';
import { reader } from '../../../../server/mongo/tx';

/**
 * A stored Module 5 photo, for anyone signed in: the original as taken, or `?size=thumb` for a small preview.
 * Never cached by the browser or anything in between.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, 'Your session has ended. Please log in again.');
    const { id } = await params;
    const photo = await readPhoto(reader, id, { thumb: new URL(req.url).searchParams.get('size') === 'thumb' });
    return new NextResponse(new Uint8Array(photo.bytes), {
      headers: {
        'Content-Type': photo.mime,
        'Content-Length': String(photo.bytes.length),
        'Content-Disposition': `inline; filename="${photo.name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
