/** The staff check's answer: let in, or refused with a stable code. */
export type StaffAccessDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly status: 401 | 403;
      readonly code: string;
      readonly message: string;
    };

/**
 * STF-3, as the guard sees it: reads the member, role and permission on every request. Bound by the
 * HTTP root to the staff module (shared code may not import modules).
 */
export abstract class StaffAccess {
  abstract check(
    staffId: string,
    permission: string | null,
    brandSlug: string | null,
  ): Promise<StaffAccessDecision>;
}
