-- anime_chat 全量表结构（可手工执行；dev 也可依赖 TypeORM synchronize）
-- 数据库：CREATE DATABASE IF NOT EXISTS anime_chat DEFAULT CHARSET utf8mb4;
-- 与 TypeORM 实体保持同步：改实体后务必回来更新本文件

CREATE TABLE IF NOT EXISTS `user` (
  `user_id` char(36) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `nickname` varchar(255) NOT NULL,
  `avatar` varchar(255) NOT NULL DEFAULT '',
  `role` enum('root','user') NOT NULL DEFAULT 'user',
  -- status 是**在线状态**（登录 1 / 离开 0），不是封禁位。封禁看 disabled_at
  `status` tinyint NOT NULL DEFAULT 0,
  `disabled_at` datetime DEFAULT NULL,
  `disabled_reason` varchar(255) NOT NULL DEFAULT '',
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),,
  `danmaku_settings` json DEFAULT NULL COMMENT '播放器弹幕偏好（JSON，字段随播放器升级变化）'
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `IDX_user_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 双 token 会话（accessToken 不落库，只存 refreshToken） ─────
-- 只存 sha256(jwt)，不存明文：库被拖走也无法冒用
-- 轮换：每次刷新把旧行置 revoked=1 并写 replaced_by；旧行被再次使用视为泄露，整户吊销
CREATE TABLE IF NOT EXISTS `refresh_token` (
  `id` char(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked` tinyint NOT NULL DEFAULT 0,
  `replaced_by` varchar(36) NOT NULL DEFAULT '',
  `user_agent` varchar(255) NOT NULL DEFAULT '',
  `last_used_at` datetime DEFAULT NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_refresh_token_hash` (`token_hash`),
  KEY `IDX_refresh_token_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_anime` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `bangumi_id` int NOT NULL,
  `status` enum('wish','watching','done') NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `name_cn` varchar(255) DEFAULT NULL,
  `cover` varchar(512) DEFAULT NULL,
  `watched_episode` float NOT NULL DEFAULT 0 COMMENT '看到第几集（Bangumi sort，可为小数）',
  `total_episodes` int NOT NULL DEFAULT 0 COMMENT '总集数，0=未知',
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_user_anime_user_bangumi` (`user_id`,`bangumi_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 聊天 / 放映室 ───────────────────────────────────────────────

-- group：旧聊天室 + 放映室共用表
-- season_id 为放映室业务 key（随机 hex，全局 UNIQUE）；episode_* 仅内容绑定，非房间主键
CREATE TABLE IF NOT EXISTS `group` (
  `group_id` char(36) NOT NULL,
  `user_id` varchar(255) NOT NULL DEFAULT 'admin',
  `anime_id` int NOT NULL,
  `group_name` varchar(255) NOT NULL,
  `notice` varchar(255) NOT NULL DEFAULT '文明交流',
  `create_time` varchar(255) NOT NULL,
  `season_id` varchar(32) NOT NULL,
  `host_user_id` varchar(36) NOT NULL DEFAULT '',
  `is_public` tinyint NOT NULL DEFAULT 1,
  `episode_id` int DEFAULT NULL,
  `episode_sort` float DEFAULT NULL,
  `playback_status` varchar(16) NOT NULL DEFAULT 'idle',
  `playback_episode_sort` float DEFAULT NULL,
  `playback_episode_id` int DEFAULT NULL,
  `playback_session_id` varchar(36) NOT NULL DEFAULT '',
  `playback_stream_url` text,
  `playback_position` float NOT NULL DEFAULT 0,
  `playback_updated_at` datetime DEFAULT NULL,
  `playback_title` varchar(512) NOT NULL DEFAULT '',
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `IDX_group_season_id` (`season_id`),
  KEY `IDX_group_anime_id` (`anime_id`),
  KEY `IDX_group_anime_ep` (`anime_id`,`episode_sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `group_message` (
  `id` char(36) NOT NULL,
  `group_id` varchar(255) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `message_type` varchar(255) NOT NULL DEFAULT 'text',
  `time` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_group_message_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `group_user_map` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` varchar(255) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_group_user_map_group` (`group_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 播放会话（流媒体 / BT 边下边播） ───────────────────────────

CREATE TABLE IF NOT EXISTS `playback_session` (
  `id` char(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `group_id` varchar(36) NOT NULL DEFAULT '',
  `bangumi_id` int DEFAULT NULL,
  `episode_sort` float DEFAULT NULL,
  `source_uri` text NOT NULL,
  `info_hash` varchar(64) NOT NULL DEFAULT '',
  `file_index` int NOT NULL DEFAULT -1,
  `file_name` varchar(512) NOT NULL DEFAULT '',
  `local_path` varchar(1024) NOT NULL DEFAULT '',
  `minio_object` varchar(512) NOT NULL DEFAULT '',
  `status` varchar(32) NOT NULL DEFAULT 'created',
  `error_message` varchar(512) NOT NULL DEFAULT '',
  `progress` float NOT NULL DEFAULT 0,
  `size_bytes` bigint NOT NULL DEFAULT 0,
  `downloaded_bytes` bigint NOT NULL DEFAULT 0,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_playback_session_user` (`user_id`),
  KEY `IDX_playback_session_group` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 数据源订阅（用户浏览器拉取解析） ──────────────────────────

CREATE TABLE IF NOT EXISTS `media_source` (
  `id` char(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `name` varchar(128) NOT NULL DEFAULT '',
  `url` varchar(1024) NOT NULL,
  `url_hash` varchar(64) NOT NULL,
  `kind` varchar(16) NOT NULL DEFAULT 'mixed',
  `enabled` tinyint NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `last_fetched_at` datetime DEFAULT NULL,
  `last_error` varchar(512) NOT NULL DEFAULT '',
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_media_source_user_hash` (`user_id`,`url_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 本地番剧表（Bangumi 迁移后仅作兜底） ────────────────────────
-- ⚠️ `anime_ep` 表已于 2026-09-22 随番剧 HTTP 子系统一并移除：
--    `/api/anime` 全部端点无鉴权、写操作是脚手架桩、表 0 行、前端零调用。
--    `anime` 表**保留** —— `chat.gateway` 那个已标 deprecated 的 `addGroup`
--    路径仍在用它取标题兜底。等那条路径也下线时，这张表可以一起删。
CREATE TABLE IF NOT EXISTS `anime` (
  `anime_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `category` varchar(255) NOT NULL,
  `cover` varchar(255) NOT NULL,
  `pub_time` varchar(255) NOT NULL,
  `update_time` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `season` varchar(255) NOT NULL,
  `rank` varchar(255) NOT NULL,
  `region` varchar(255) NOT NULL,
  `status` varchar(255) NOT NULL,
  PRIMARY KEY (`anime_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── AI 助手（2026-09-21 新增） ─────────────────────────────────
-- 会话历史的权威来源是这三张表：anime-ai 服务是无状态的，
-- 每次对话由 anime-chat-server 把历史窗口送过去。

CREATE TABLE IF NOT EXISTS `ai_conversation` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_ai_conversation_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- tool_results 保存该轮工具返回的番剧卡片（JSON 数组）；
-- 不落库的话用户刷新页面后只剩文字、卡片全丢。
CREATE TABLE IF NOT EXISTS `ai_message` (
  `id` char(36) NOT NULL,
  `conversation_id` char(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `role` enum('user','assistant') NOT NULL,
  `content` text NOT NULL,
  `tool_results` json DEFAULT NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_ai_message_conversation` (`conversation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 按人按天的用量计数。(user_id, stat_date) 唯一，靠
-- INSERT ... ON DUPLICATE KEY UPDATE 原子自增，避免并发下丢更新导致配额失效。
CREATE TABLE IF NOT EXISTS `ai_usage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) NOT NULL,
  `stat_date` date NOT NULL,
  `request_count` int NOT NULL DEFAULT 0,
  `prompt_tokens` int NOT NULL DEFAULT 0,
  `completion_tokens` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_ai_usage_user_date` (`user_id`,`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 通用埋点（2026-09-21 新增，取代原 ai_request_log）──────────
-- 前端行为埋点与后端业务事件（ai.chat / page.view …）**共用这一张表**，
-- 管理员看板不必为每类数据各写一套查询。
-- props 用 JSON 存自定义属性，避免每加一个字段就改表结构；
-- client_ts 与 create_time 分开：前端是批量延迟上报的，入库时间可能晚几秒。
-- ⚠️ 代价是聚合要 JSON_EXTRACT。这个量级够用；量级上来后应另建物化汇总表，
--    而不是给这张通用表加业务专用列。
CREATE TABLE IF NOT EXISTS `track_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event` varchar(80) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `anonymous_id` varchar(64) DEFAULT NULL,
  `page` varchar(80) DEFAULT NULL,
  `target` varchar(120) DEFAULT NULL,
  `props` json DEFAULT NULL,
  `client_ts` datetime(3) DEFAULT NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_track_event_event_time` (`event`,`create_time`),
  KEY `IDX_track_event_user_time` (`user_id`,`create_time`),
  KEY `IDX_track_event_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 管理员审计（2026-09-22 新增）────────────────────────────────
-- **刻意不复用 track_event**，三条硬性理由：
--  1. TrackService.track() 的契约是「吞掉所有异常」（埋点失败不能影响业务），
--     而审计必须反过来 —— 留不下痕就不许操作成功。同一个方法满足不了两者。
--  2. 审计要与业务改动**同事务**（改角色成功但审计失败 = 不知道是谁提的权）；
--     埋点是旁路异步写，没有事务语义。
--  3. 检索维度与保留期不同：审计按 actor/action/target 查且长期保留，
--     埋点按事件/时间聚合且可定期清理。混在一起两边索引都做不好。
-- actor_username 存**快照**：操作者本人被删号后，记录仍要能读出「是谁干的」。
-- detail 绝不写密码/令牌明文。
CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actor_user_id` char(36) NOT NULL,
  `actor_username` varchar(255) NOT NULL,
  `action` varchar(64) NOT NULL,
  `target_type` varchar(32) NOT NULL,
  `target_id` varchar(64) NOT NULL DEFAULT '',
  `detail` json DEFAULT NULL,
  `ip` varchar(64) NOT NULL DEFAULT '',
  `user_agent` varchar(255) NOT NULL DEFAULT '',
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_admin_audit_actor_time` (`actor_user_id`,`create_time`),
  KEY `IDX_admin_audit_action_time` (`action`,`create_time`),
  KEY `IDX_admin_audit_target` (`target_type`,`target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
