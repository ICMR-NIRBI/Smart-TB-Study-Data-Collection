import { apiHandler } from '../../../server/http';
import { systemHealth } from '../../../server/health';
import { reader } from '../../../server/mongo/tx';
import { serverActionsStatus } from '../../../server/serverActions';
import { readSiteSettings } from '../../../server/siteSettings';
import { listStaff } from '../../../server/staff';
import { assertSystemAdmin, systemLogs, systemStatus } from '../../../server/system';

/** Everything the system control page shows: health, server actions, site switches, accounts and the logs. */
export async function GET() {
  return apiHandler(async (user) => {
    assertSystemAdmin(user);
    const staff = await listStaff(reader);
    return {
      status: await systemStatus(),
      health: await systemHealth(),
      actions: serverActionsStatus(),
      site: await readSiteSettings(),
      accounts: staff.map((s) => ({ id: s.id, name: s.name, email: s.email, roleLabel: s.roleLabel, status: s.status, isSelf: s.id === user.id })),
      logs: await systemLogs(),
    };
  });
}
