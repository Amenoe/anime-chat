import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { ChatMediaService } from './chat-media.service';

// multer 为 @nestjs/platform-express 的传递依赖；无 @types/multer 时用 require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { memoryStorage } = require('multer') as {
  memoryStorage: () => unknown;
};

/**
 * 聊天媒体：
 * - POST /api/chat/media  登录用户上传图片/语音，返回 `/api/chat/media/<uuid>.<ext>`
 * - GET  /api/chat/media/:filename  公开只读（img/audio 无法带 JWT）
 */
@Controller('chat')
export class ChatMediaController {
  constructor(private readonly media: ChatMediaService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请选择图片或语音文件');
    }
    return this.media.save(file);
  }

  @Get('media/:filename')
  async get(@Param('filename') filename: string, @Res() res: Response) {
    const { path, mime } = this.media.open(filename);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(path).pipe(res);
  }
}
