import { apiHandler } from '../../../server/http';
import { reader } from '../../../server/mongo/tx';
import { listStaff } from '../../../server/staff';
import { assertSystemAdmin, systemLogs, systemStatus } from '../../../server/system';

/** Status, the accounts (for setting a password) and the logs, for the system control page. */
export async function GET() {
  return apiHandler(async (user) => {
    assertSystemAdmin(user);
    const staff = await listStaff(reader);
    return {
      status: await systemStatus(),
      accounts: staff.map((s) => ({ id: s.id, name: s.name, email: s.email, roleLabel: s.roleLabel, status: s.status, isSelf: s.id === user.id })),
      logs: await systemLogs(),
    };
  });
}
