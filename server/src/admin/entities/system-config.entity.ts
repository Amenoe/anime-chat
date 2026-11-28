import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * 管理员可热改的白名单系统配置（见 `docs/admin-roadmap.md` §7）。
 *
 * 只持久化被管理员修改过的白名单键；未写入的键沿用 `.env` 默认值。
 * DB 是唯一真相：服务启动时由 `AdminConfigService.onModuleInit` 回填到内存配置对象。
 */
@Entity('system_config')
export class SystemConfig {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  config_key: string;

  @Column({ type: 'varchar', length: 512 })
  config_value: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  @Column({ type: 'varchar', length: 36, default: '' })
  update_by: string;

  @UpdateDateColumn({ name: 'update_time', type: 'datetime' })
  update_time: Date;
}
