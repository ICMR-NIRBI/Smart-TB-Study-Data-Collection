import type { ModuleId } from '../types/crf';

/**
 * Who may enter which module. Proposed split, pending PI confirmation; the server enforces exactly these rules.
 * Everyone signed in can view all study data except participant contact details.
 */
export type RoleKey = 'pi' | 'research_officer' | 'phlebotomist' | 'pk_scientist' | 'data_manager';

export const ROLE_LABELS: Record<RoleKey, string> = {
  pi: 'Principal Investigator',
  research_officer: 'Research Officer',
  phlebotomist: 'Phlebotomist',
  pk_scientist: 'PK Scientist',
  data_manager: 'Data Manager',
};

/** Modules each role can fill in. */
const ROLE_ENTRY: Record<RoleKey, ModuleId[]> = {
  pi: [2, 9, 10],
  research_officer: [1, 2, 3, 4, 7, 8, 9, 10],
  phlebotomist: [5, 9],
  pk_scientist: [6],
  // Checks the data and corrects it (reopening with a reason); does not do first entry or sign-off.
  data_manager: [],
};

/** Modules that only the PI (or someone delegated that module) may sign off and lock. */
const PI_SIGN_OFF: ModuleId[] = [2, 10];

export interface Actor {
  role: RoleKey;
  isAdmin: boolean;
  /** Extra modules granted through the delegation log. */
  delegations: ModuleId[];
}

export function isRoleKey(v: string): v is RoleKey {
  return v in ROLE_LABELS;
}

export function roleModules(role: RoleKey): ModuleId[] {
  return ROLE_ENTRY[role];
}

export function canEnterModule(a: Actor, id: ModuleId): boolean {
  return ROLE_ENTRY[a.role].includes(id) || a.delegations.includes(id);
}

export function canCompleteModule(a: Actor, id: ModuleId): boolean {
  if (PI_SIGN_OFF.includes(id)) return a.role === 'pi' || a.delegations.includes(id);
  return canEnterModule(a, id);
}

/** Reopening a locked module (with a reason): whoever can enter it, and the PI or data manager for any module. */
export function canReopenModule(a: Actor, id: ModuleId): boolean {
  return a.role === 'pi' || a.role === 'data_manager' || canEnterModule(a, id);
}

export function canEnroll(a: Actor): boolean {
  return canEnterModule(a, 1);
}

export function canDiscontinue(a: Actor): boolean {
  return a.role === 'pi' || a.role === 'research_officer';
}

/** One-line summary of what a role does, shown on the staff admin page. */
export const ROLE_SUMMARY: Record<RoleKey, string> = {
  pi: 'Signs off eligibility (Module 2) and closeout (Module 10); can correct any module with a reason',
  research_officer: 'Enters Modules 1–4, 7, 8 and adverse events; prepares Modules 2 and 10 for PI sign-off',
  phlebotomist: 'Enters Day 8 PK sampling (Module 5) and adverse events',
  pk_scientist: 'Enters bioanalytical results and PK (Module 6)',
  data_manager: 'Reviews all data; can correct any locked module with a reason; no first entry or sign-off',
};

export const ROLE_KEYS = Object.keys(ROLE_LABELS) as RoleKey[];

/**
 * Phone and address: PI and admin always; whoever enters Module 1 only while it is open for entry,
 * so they can type and check what they entered.
 */
export function canSeeContacts(a: Actor, module1: { completed: boolean; editing: boolean }): boolean {
  if (a.role === 'pi' || a.isAdmin) return true;
  return canEnterModule(a, 1) && (!module1.completed || module1.editing);
}
