import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

/** 聊天图片/语音只认这些 MIME（带 codecs 参数时先剥掉） */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** 与 gateway 的媒体消息地址校验保持一致 */
export const CHAT_MEDIA_URL_RE =
  /^\/api\/chat\/media\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|webm|ogg|m4a|mp3|wav)$/;

const FILE_NAME_RE = /^[a-f0-9-]{36}\.([a-z0-9]+)$/;

export type ChatMediaFile = {
  mimetype: string;
  buffer: Buffer;
};

/**
 * 聊天图片 / 语音的本地落盘存储。
 *
 * 不放 MinIO：本机 MinIO 端口不可达时聊天会整个不可用（实测 8.130.120.172:19000
 * 连不上）；聊天媒体是低频小文件，直接写 `server/uploads/chat` 更稳。
 * 文件名用 uuid，URL 公开只读（img/audio 标签带不了 Authorization），随机名不可枚举。
 */
@Injectable()
export class ChatMediaService {
  /**
   * `__dirname` 在开发（dist/chat）与生产（server/dist/chat）都指向 `server/dist/chat`，
   * `../..` 稳定落在 `server/uploads`；不用 `process.cwd()`，避免 systemd 没配
   * WorkingDirectory 时把文件写到 `/uploads`。
   */
  private readonly dir = join(__dirname, '..', '..', 'uploads', 'chat');

  async save(file: ChatMediaFile) {
    const mime = file.mimetype.split(';')[0].trim().toLowerCase();
    const ext = MIME_EXT[mime];
    if (!ext) {
      throw new BadRequestException('仅支持图片或语音文件');
    }

    const name = `${randomUUID()}.${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, name), file.buffer);

    return {
      url: `/api/chat/media/${name}`,
      type: mime.startsWith('image/') ? ('image' as const) : ('audio' as const),
      size: file.buffer.length,
    };
  }

  open(name: string) {
    const match = FILE_NAME_RE.exec(name);
    const mime = match ? EXT_MIME[match[1]] : '';
    if (!match || !mime) {
      throw new BadRequestException('无效的文件名');
    }
    const path = join(this.dir, name);
    if (!existsSync(path)) {
      throw new NotFoundException('文件不存在');
    }
    return { path, mime };
  }
}
