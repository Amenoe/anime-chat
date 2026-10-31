/**
 * Bangumi 公共标签（meta_tags）常用分类
 * 参考：https://bgm.tv/wiki/tag/list
 * 搜索接口 filter.meta_tags 多值为「且」关系
 */

export type MetaTagCategory = {
  key: string
  label: string
  options: string[]
}

/** 搜索页展示的标签筛选项（动画向） */
export const SEARCH_META_TAG_CATEGORIES: MetaTagCategory[] = [
  {
    key: 'genre',
    label: '类型',
    options: [
      '科幻',
      '奇幻',
      '战斗',
      '冒险',
      '恋爱',
      '校园',
      '日常',
      '喜剧',
      '悬疑',
      '推理',
      '惊悚',
      '恐怖',
      '机战',
      '百合',
      '耽美',
      '后宫',
      '运动',
      '音乐',
      '萌系',
      '穿越',
      '历史',
      '美食',
      '职场',
      '剧情',
      '武侠',
      '玄幻',
    ],
  },
  {
    key: 'setting',
    label: '设定',
    options: [
      '异世界',
      '魔法少女',
      '超能力',
      '偶像',
      '乐队',
      '网游',
      '末世',
      '赛博朋克',
      '都市',
      '校园',
      '宫廷',
      '性转',
      '时间旅行',
      '平行世界',
      '虚拟现实',
    ],
  },
  {
    key: 'character',
    label: '角色',
    options: [
      '萝莉',
      '正太',
      '傲娇',
      '女仆',
      '兽耳',
      '伪娘',
      '吸血鬼',
      '美少女',
      '美少年',
      '群像',
      '兄控',
      '妹控',
      '电波',
      '制服',
      '僵尸',
    ],
  },
  {
    key: 'region',
    label: '地区',
    options: ['日本', '中国', '美国', '韩国', '欧美', '法国', '英国', '台湾', '香港'],
  },
  {
    key: 'emotion',
    label: '情感',
    options: ['热血', '治愈', '温情', '催泪', '纯爱', '友情', '致郁', '搞笑', '励志'],
  },
  {
    key: 'source',
    label: '来源',
    options: ['原创', '漫画改', '小说改', '游戏改', '动画改', '影视改', '轻小说改'],
  },
  {
    key: 'audience',
    label: '受众',
    options: ['少年向', '少女向', '青年向', '女性向', '子供向', 'BL', 'GL'],
  },
  {
    key: 'format',
    label: '分类',
    options: ['TV', '剧场版', 'OVA', 'ONA', 'WEB', '短片', '特别篇'],
  },
]
