import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { IsNickname, normalizeNickname } from '../nickname';

/** ≥6 位，须含字母与数字 */
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

export class CreateUserDto {
  @IsNotEmpty({ message: '用户名不能为空' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{3,10}$/, {
    message: '用户名需为 3-10 位字母或数字',
  })
  username: string;

  @IsNotEmpty({ message: '密码不能为空' })
  @IsString()
  @Matches(PASSWORD_PATTERN, {
    message: '密码至少 6 位，须包含英文字母和数字',
  })
  password: string;

  /** 昵称只做长度与换行限制，空格/标点/emoji 都允许（规则见 `../nickname.ts`） */
  @Transform(({ value }) => normalizeNickname(value))
  @IsString({ message: '昵称格式不正确' })
  @IsNickname()
  nickname: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
