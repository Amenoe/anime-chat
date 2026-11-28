import { IsDefined } from 'class-validator';

/**
 * 更新单条系统配置。
 *
 * `ValidationPipe` 开启了 `whitelist + forbidNonWhitelisted`，
 * 必须显式声明 `value`；具体类型与值域由 `AdminConfigService` 按白名单定义校验。
 */
export class UpdateSystemConfigDto {
  @IsDefined({ message: '缺少配置值 value' })
  value: boolean | number | string;
}
