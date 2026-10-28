import type { ModuleId } from './crf';

/** A role as shown on the roles screen and in the role pickers. */
export interface RoleInfo {
  key: string;
  label: string;
  description: string;
  builtin: boolean;
  /** Modules holders of this role may fill in. */
  modules: ModuleId[];
  /** Accounts that currently hold the role. */
  members: number;
}
