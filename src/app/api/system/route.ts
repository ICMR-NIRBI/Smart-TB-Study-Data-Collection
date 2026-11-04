import { apiHandler } from '../../../server/http';
import { systemHealth } from '../../../server/health';
import { reader } from '../../../server/mongo/tx';
import { serverActionsStatus } from '../../../server/serverActions';
import { readSiteSettings } from '../../../server/siteSettings';
import { listStaff, ROLE_COOLDOWN_MINUTES } from '../../../server/staff';
import { listRoles } from '../../../server/roles';
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
      accounts: staff.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        roleLabel: s.roleLabel,
        roleLockedUntil: s.roleLockedUntil,
        status: s.status,
        isSelf: s.id === user.id,
      })),
      roles: (await listRoles(reader)).map((r) => ({ key: r.key, label: r.label })),
      roleCooldownMinutes: ROLE_COOLDOWN_MINUTES,
      logs: await systemLogs(),
    };
  });
}
