import { type CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../../../shared/config/app-config.js';

/** Dev-only routes do not exist in production: they answer 404 there. */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(): boolean {
    if (this.config.isProduction) throw new NotFoundException();
    return true;
  }
}
