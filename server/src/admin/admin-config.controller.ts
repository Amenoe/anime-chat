import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RootGuard } from 'src/auth/root.guard';
import { AdminConfigService } from './admin-config.service';
import type { AdminActor } from './admin-user.service';
import { UpdateSystemConfigDto } from './dto/admin-config.dto';

/**
 * 管理端系统配置（白名单热改）。
 *
 * 每个端点显式声明 `@UseGuards(AuthGuard('jwt'), RootGuard)`，顺序不可反。
 */
@Controller('admin/config')
export class AdminConfigController {
  constructor(private readonly configService: AdminConfigService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RootGuard)
  list() {
    return this.configService.list();
  }

  @Patch(':key')
  @UseGuards(AuthGuard('jwt'), RootGuard)
  update(
    @Req() req,
    @Param('key') key: string,
    @Body() dto: UpdateSystemConfigDto,
  ) {
    return this.configService.update(actorOf(req), key, dto.value);
  }
}

function actorOf(req: {
  user?: { user_id?: string; username?: string };
  ip?: string;
  headers?: Record<string, unknown>;
}): AdminActor {
  const ua = req.headers?.['user-agent'];
  return {
    userId: req.user?.user_id ?? '',
    username: req.user?.username ?? '',
    ip: req.ip ?? '',
    userAgent: typeof ua === 'string' ? ua : '',
  };
}
