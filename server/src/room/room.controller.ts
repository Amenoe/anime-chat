import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateVodRoomDto } from './dto/create-vod-room.dto';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  /** 公开活跃放映室大厅列表（无需登录；私人点播室 anime_id=0 / is_public=0 永不露出） */
  @Get('public')
  async listPublic(@Query('limit') limit?: string, @Query('q') q?: string) {
    const parsed = limit != null ? Number(limit) : 20;
    const safeLimit = Number.isFinite(parsed)
      ? Math.min(Math.max(Math.floor(parsed), 1), 50)
      : 20;
    return this.roomService.listPublic(safeLimit, q);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async list(
    @Query('anime_id') animeId: string,
    @Query('episode_sort') episodeSort?: string,
  ) {
    const aid = Number(animeId);
    if (!aid) return [];
    const sort = episodeSort != null ? Number(episodeSort) : undefined;
    return this.roomService.listByAnime(aid, sort);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async create(@Req() req, @Body() dto: CreateRoomDto) {
    return this.roomService.createRoom(req.user.user_id, dto);
  }

  /** 新建私人点播室（邀请制，不绑番剧、不进公开列表） */
  @Post('vod')
  @UseGuards(AuthGuard('jwt'))
  async createVod(@Req() req, @Body() dto: CreateVodRoomDto) {
    return this.roomService.createVodRoom(req.user.user_id, dto.name);
  }

  @Get('by-key/:seasonId')
  @UseGuards(AuthGuard('jwt'))
  async getByKey(@Param('seasonId') seasonId: string) {
    const room = await this.roomService.findBySeasonId(seasonId);
    if (!room) throw new NotFoundException('房间不存在');
    return room;
  }
}
