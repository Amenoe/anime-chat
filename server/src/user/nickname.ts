import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * 昵称规则（注册 / 改资料共用）。
 *
 * 昵称只是**展示名**，不是账号，所以只挡真正会出问题的输入：
 * 长度 1–20 个字符（按 Unicode 码点算，一个 emoji 算 1 个），
 * 不允许换行 / 制表 / 零宽分隔等控制字符，首尾空白会被裁掉。
 *
 * 其余一概放开：空格、中英文、标点、颜文字、emoji 都能用。
 * 旧规则 `/^[a-zA-Z0-9一-龥]{1,10}$/` 把「夜刀神十香🌸」「kirito · 桐人」
 * 这类再正常不过的名字挡在门外，属于限制过度。
 */
export const NICKNAME_MAX_LENGTH = 20;

/**
 * `u` 标志让 `{1,20}` 按码点计数，否则一个 emoji 会被算成 2 个字符。
 * 字符类里排除 C0/C1 控制字符与 Unicode 行/段分隔符。
 */
export const NICKNAME_PATTERN = /^[^\u0000-\u001f\u007f\u2028\u2029]{1,20}$/u;

export const NICKNAME_HINT = `昵称需为 1-${NICKNAME_MAX_LENGTH} 个字符，不能包含换行等控制字符`;

/** 统一去掉首尾空白；非字符串原样返回，交给 @IsString 报错 */
export function normalizeNickname<T>(value: T): T {
  return (typeof value === 'string' ? value.trim() : value) as T;
}

/**
 * 昵称校验装饰器。
 *
 * 写成装饰器而不是 `@IsNotEmpty()` + `@Matches()`：两个装饰器会在
 * 「只输入了空格」时同时失败，返回一句 `…不能包含换行…; 昵称不能为空` 的拼接文案。
 * 这里用一条规则给出**一句**准确的提示。
 */
export function IsNickname(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNickname',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const name = value.trim();
          return name.length > 0 && NICKNAME_PATTERN.test(name);
        },
        defaultMessage(args: ValidationArguments) {
          const value = args.value;
          if (typeof value === 'string' && value.trim().length === 0) {
            return '昵称不能为空';
          }
          return NICKNAME_HINT;
        },
      },
    });
  };
}
