import type { WelcomePresetCopyMap } from './types';

/** 展示顺序（对应 assets/welcome-presets/video/{id}.mp4） */
export const VIDEO_PRESET_ORDER = [
  'ghibli-summer',
  'beef-burger',
  'xianxia-fox',
  'tang-changan',
  'beauty-perfume',
] as const;

export type VideoPresetId = (typeof VIDEO_PRESET_ORDER)[number];

export const VIDEO_PRESET_PROMPTS: WelcomePresetCopyMap = {
  'ghibli-summer': {
    zh: '吉卜力动画，手绘水彩，夏日乡间小路，茂密绿植，穿透树叶的金色丁达尔光，斑驳光影，清爽高中生男女并肩行走，青涩暧昧，柔和逆光，复古动画质感，慢节奏，微风飘动野草，极简干净画面',
    en: 'Ghibli-style animation, hand-painted watercolor, summer country path, lush greenery, golden god rays through leaves, dappled light, fresh high-school boy and girl walking side by side, subtle romance, soft backlight, vintage anime texture, slow pace, breeze in the grass, minimal clean frame',
  },
  'beef-burger': {
    zh: '超大牛肉汉堡，按压瞬间肉汁流淌，芝士缓缓拉丝，生菜轻晃，热气袅袅，暖光美食动态，流畅特写，商业美食大片',
    en: 'Oversized beef burger, juice flowing the moment it is pressed, cheese stretching slowly, lettuce swaying gently, rising steam, warm food lighting, smooth close-up motion, commercial food film look',
  },
  'xianxia-fox': {
    zh: '镜头从浮空仙阁快速推近，瞬间定格在龙角男子与九尾狐的画面，鎏金纹理随镜头推进亮起。镜头以男子为中心快速旋转，九尾狐的霓虹火焰瞬间点燃，周身流光缠绕，背景的佛像头部从水墨晕染中缓缓浮现，实现两张画面的无缝叠化。镜头拉升至尾帧画面，佛像的釉面光泽与男子的双眼同时亮起，画面定格后随鼓点渐暗，留下鎏金与霓虹交织的余韵。',
    en: 'Camera pushes fast from a floating immortal pavilion and locks on a horned man and a nine-tailed fox; gilded patterns ignite as the lens advances. Orbit around the man, neon fox fire erupts with flowing light; a Buddha head emerges from ink wash in the background for a seamless dissolve. Pull up to the final frame as glazed Buddha sheen and the man’s eyes brighten together, then fade on the beat leaving gold and neon afterglow',
  },
  'tang-changan': {
    zh: '云上盛世长安，浮空大唐古城，热闹繁华市井烟火，长街商铺林立人声鼎沸，千盏红灯笼彻夜通明，游人往来车马穿行，唐风仕女巡游街头，街边杂耍市井百态，灯火璀璨盛唐夜景，实景实拍质感，街巷漫游运镜，8K 高清古风大片',
    en: 'Cloudborne golden-age Chang’an, floating Tang dynasty city, bustling streets and market life, shops and crowds along long avenues, thousands of red lanterns at night, travelers and carriages, Tang-style ladies parading, street performers, radiant Tang nightscape, live-action realism, roaming street camera, 8K cinematic ancient-China epic',
  },
  'beauty-perfume': {
    zh: '从沙漠晨光的静谧暖调，缓缓过渡到水面涟漪的温柔柔光，香奈儿香水瓶从沙漠移至水面，白色百合与鸢尾环绕，镜头从远景推近香水瓶，光影从沙漠的暖金过渡到水面的通透柔光，水面波纹扩散，倒影晃动，氛围从热烈转为治愈，电影级慢镜头，4K 超清，高级质感，浪漫升温，氛围感拉满。',
    en: 'From quiet warm desert dawn, transition gently to soft rippling water light; a Chanel perfume bottle moves from desert to water surrounded by white lilies and irises. Push in from wide to the bottle as light shifts from warm gold to translucent water glow, ripples spread and reflections sway, mood turns from vivid to healing, cinematic slow motion, 4K ultra HD, premium texture, romantic atmosphere',
  },
};
