import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../../server/auth';
import { auditCsv, searchAudit } from '../../../../server/auditSearch';
import { ApiError } from '../../../../server/errors';
import { errorResponse } from '../../../../server/http';
import { assertSystemAdmin } from '../../../../server/system';

/**
 * Search the audit trail: `?participant=<study ID>&account=<email>&from=YYYY-MM-DD&to=YYYY-MM-DD`.
 * `&format=csv` downloads the result (up to 5,000 rows) as a CSV file.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, 'Your session has ended. Please log in again.');
    if (user.mustChangePassword) throw new ApiError(403, 'Choose a new password before continuing.');
    assertSystemAdmin(user);
    const params = Object.fromEntries(new URL(req.url).searchParams.entries());
    if (params.format === 'csv') {
      const { rows } = await searchAudit(params, 5000);
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(auditCsv(rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="smarttb-audit-${stamp}.csv"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return NextResponse.json(await searchAudit(params), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
