import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Connection, Repository } from 'typeorm';
import { aiConfig, qbittorrentConfig } from 'src/core/config/config';
import { AdminAuditService } from './admin-audit.service';
import type { AdminActor } from './admin-user.service';
import { SystemConfig } from './entities/system-config.entity';

type ConfigValueType = 'boolean' | 'integer';

interface ConfigSpec<T extends boolean | number> {
  key: string;
  type: ConfigValueType;
  description: string;
  min?: number;
  max?: number;
  defaultValue: T;
  get: () => T;
  set: (value: T) => void;
}

export interface SystemConfigItemView {
  key: string;
  type: ConfigValueType;
  value: boolean | number;
  defaultValue: boolean | number;
  description: string;
  min?: number;
  max?: number;
  overridden: boolean;
  updateBy: string;
  updateTime: Date | null;
}

/**
 * 白名单系统配置热改（见 `docs/admin-roadmap.md` §7）。
 *
 * 硬边界：
 * - 只接受白名单键，`DB_PASSWORD` / `JWT_SECRET` / `AI_SERVICE_URL` 等一律 env-only；
 * - 写库与审计（`config.update`）在同一事务内完成，事务提交后再刷新内存；
 * - 多实例局限：单实例立即生效，多实例场景下其余实例重启后与 DB 一致。
 */
@Injectable()
export class AdminConfigService implements OnModuleInit {
  private readonly logger = new Logger(AdminConfigService.name);

  private readonly specs: ConfigSpec<any>[] = [
    {
      key: 'ai.enabled',
      type: 'boolean',
      description: 'AI 助手总开关（关闭后对话接口直接返回 503，可应急熔断）',
      defaultValue: aiConfig.enabled,
      get: () => aiConfig.enabled,
      set: (v: boolean) => {
        aiConfig.enabled = v;
      },
    },
    {
      key: 'ai.dailyQuota',
      type: 'integer',
      description: '每人每日 AI 对话次数上限（0 表示不限制）',
      min: 0,
      max: 10000,
      defaultValue: aiConfig.dailyQuota,
      get: () => aiConfig.dailyQuota,
      set: (v: number) => {
        aiConfig.dailyQuota = v;
      },
    },
    {
      key: 'ai.historyWindow',
      type: 'integer',
      description: '单次 AI 请求携带的最近历史消息条数（下次请求生效）',
      min: 2,
      max: 50,
      defaultValue: aiConfig.historyWindow,
      get: () => aiConfig.historyWindow,
      set: (v: number) => {
        aiConfig.historyWindow = v;
      },
    },
    {
      key: 'qb.enabled',
      type: 'boolean',
      description: 'BT / 磁力边下边播开关（关闭不影响普通流媒体播放）',
      defaultValue: qbittorrentConfig.enabled,
      get: () => qbittorrentConfig.enabled,
      set: (v: boolean) => {
        qbittorrentConfig.enabled = v;
      },
    },
  ];

  private readonly specMap = new Map<string, ConfigSpec<any>>(
    this.specs.map((spec) => [spec.key, spec]),
  );

  constructor(
    @InjectRepository(SystemConfig)
    private readonly repo: Repository<SystemConfig>,
    private readonly connection: Connection,
    private readonly audit: AdminAuditService,
  ) {}

  /** 启动时把 DB 里的持久化覆盖回填到内存配置对象 */
  async onModuleInit() {
    try {
      const rows = await this.repo.find();
      let applied = 0;
      for (const row of rows) {
        const spec = this.specMap.get(row.config_key);
        if (!spec) continue;
        try {
          const parsed = this.parseValue(spec, row.config_value);
          spec.set(parsed);
          applied += 1;
        } catch (err) {
          this.logger.warn(
            `忽略非法配置 ${row.config_key}=${row.config_value}: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }
      if (applied > 0) {
        this.logger.log(`已加载 ${applied} 条持久化系统配置`);
      }
    } catch (err) {
      this.logger.warn(
        `加载 system_config 失败（将沿用环境变量默认值）: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async list(): Promise<SystemConfigItemView[]> {
    const rows = await this.repo.find();
    const rowMap = new Map(rows.map((r) => [r.config_key, r]));
    return this.specs.map((spec) => {
      const row = rowMap.get(spec.key);
      return {
        key: spec.key,
        type: spec.type,
        value: spec.get(),
        defaultValue: spec.defaultValue,
        description: spec.description,
        ...(spec.min !== undefined ? { min: spec.min } : {}),
        ...(spec.max !== undefined ? { max: spec.max } : {}),
        overridden: Boolean(row),
        updateBy: row?.update_by ?? '',
        updateTime: row?.update_time ?? null,
      };
    });
  }

  async update(
    actor: AdminActor,
    key: string,
    rawValue: boolean | number | string,
  ): Promise<SystemConfigItemView> {
    const spec = this.specMap.get(key);
    if (!spec) {
      throw new BadRequestException(`不支持修改该配置项：${key}`);
    }

    const nextValue = this.parseValue(spec, rawValue);
    const prevValue = spec.get();
    const serialized = String(nextValue);

    const saved = await this.connection.transaction(async (manager) => {
      const configRepo = manager.getRepository(SystemConfig);
      const record = await configRepo.save(
        configRepo.create({
          config_key: spec.key,
          config_value: serialized,
          description: spec.description,
          update_by: actor.username || actor.userId,
        }),
      );
      await this.audit.record(
        {
          actorUserId: actor.userId,
          actorUsername: actor.username,
          action: 'config.update',
          targetType: 'system_config',
          targetId: spec.key,
          detail: { from: prevValue, to: nextValue },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return record;
    });

    // 仅在事务成功提交后刷新内存，避免写库/审计回滚导致内存脏态
    spec.set(nextValue);

    return {
      key: spec.key,
      type: spec.type,
      value: spec.get(),
      defaultValue: spec.defaultValue,
      description: spec.description,
      ...(spec.min !== undefined ? { min: spec.min } : {}),
      ...(spec.max !== undefined ? { max: spec.max } : {}),
      overridden: true,
      updateBy: saved.update_by,
      updateTime: saved.update_time,
    };
  }

  private parseValue(
    spec: ConfigSpec<any>,
    raw: boolean | number | string,
  ): boolean | number {
    if (spec.type === 'boolean') {
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') {
        const lower = raw.trim().toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
      }
      throw new BadRequestException(`${spec.key} 必须为布尔值`);
    }

    const num =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN;
    if (!Number.isInteger(num)) {
      throw new BadRequestException(`${spec.key} 必须为整数`);
    }
    if (spec.min !== undefined && num < spec.min) {
      throw new BadRequestException(`${spec.key} 不能小于 ${spec.min}`);
    }
    if (spec.max !== undefined && num > spec.max) {
      throw new BadRequestException(`${spec.key} 不能大于 ${spec.max}`);
    }
    return num;
  }
}
