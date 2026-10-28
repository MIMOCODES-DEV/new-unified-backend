import { Injectable } from '@nestjs/common';
import { AuthorizeStaffUseCase } from '../../../modules/staff/index.js';
import { StaffAccess, type StaffAccessDecision } from '../../../shared/auth/staff-access.js';

/** The guard's staff check, answered by the staff module (STF-3). */
@Injectable()
export class StaffAccessAdapter extends StaffAccess {
  constructor(private readonly authorize: AuthorizeStaffUseCase) {
    super();
  }

  async check(
    staffId: string,
    permission: string | null,
    brandSlug: string | null,
  ): Promise<StaffAccessDecision> {
    const result = await this.authorize.execute({ staffId, permission, brandSlug });
    if (result.ok) return { allowed: true };
    const { code, message } = result.error;
    return { allowed: false, status: code === 'staff.unauthenticated' ? 401 : 403, code, message };
  }
}
