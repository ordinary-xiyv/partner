import type { WelcomePresetCopyMap } from './types';

/** 展示顺序（对应 assets/welcome-presets/image/{id}.*） */
export const IMAGE_PRESET_ORDER = [
  'ai-robot',
  'gufeng-portrait',
  'office-team',
  'cleansing-oil',
  'fintech-banner',
] as const;

export type ImagePresetId = (typeof IMAGE_PRESET_ORDER)[number];

export const IMAGE_PRESET_PROMPTS: WelcomePresetCopyMap = {
  'ai-robot': {
    zh: 'AI助手卡通机器人,卡通，蓝色渐变，磨砂玻璃质感，透明感，UI设计风格，光线追踪，干净白色背景，参考Pinterest、Dribbble风格，使用0C渲染器，Blender 渲染，减少细节，16K',
    en: 'AI assistant cartoon robot, cartoon style, blue gradient, frosted glass texture, translucent UI design, ray tracing, clean white background, Pinterest/Dribbble inspired, Octane render, Blender, minimal detail, 16K',
  },
  'gufeng-portrait': {
    zh: '古风人物特写，故事感，戏剧化场面，情景再现，空间感， 水粉，水彩，水墨，唯美插画， 弥散渐变效果，晕染效果，画面拼贴， 色彩层次感，磨砂肌理，颗粒质感，色彩叠涂，大色块笔触，色彩饱满，明暗对比强烈， 人物面部高光， 大师级作品，细节丰富，水渍点染 长发少年，层叠的服饰，绸缎+刺绣， 主题怜悯，背景皇宫内殿， 华丽的服饰+衣服纹理， 仰视视角， 深色系，色彩晕染，冷色调，金色银色点缀， 大写意构图，意境构图，， 饱含情绪，浓重感情画面语言， 意识流，寂寥，意境深远，空灵，朦胧，迷幻，浪漫，梦幻',
    en: 'Close-up ancient-style character portrait, storytelling, dramatic scene, spatial depth, gouache and watercolor ink illustration, diffused gradients, blended washes, collage composition, rich color layers, frosted grain texture, bold brush strokes, strong contrast, facial highlights, masterwork detail, ink splatter, long-haired youth in layered silk robes with embroidery, theme of compassion, palace interior background, ornate garment textures, low-angle view, deep cool tones with gold and silver accents, expressive composition, ethereal dreamy romantic mood',
  },
  'office-team': {
    zh: '卡通风格插画，职场人物（2 女 2 男）：左侧女生黑色长卷发，开心举手；中间男生棕色短发，手持文件；右侧女生手放在嘴边；最右侧男生戴眼镜，黑色短发，手拿电脑挥手互动，全员表情愉悦开朗。场景：轻松愉快的氛围，背景纯色干净。风格：3D 卡通渲染、质感细腻柔和；色彩：明亮温暖，粉 / 蓝 / 橙 / 黄等明快柔和色系；构图：近景四人同框、排列紧凑有互动感、视觉中心聚焦人物群像，背景简洁不抢主体',
    en: 'Cartoon workplace illustration with four people (2 women, 2 men): left woman with long black curly hair waving happily; center man with brown short hair holding documents; woman with hand near mouth; right man with glasses holding a laptop and waving. Cheerful expressions, clean solid background, soft 3D cartoon render, bright warm pink/blue/orange/yellow palette, tight group close-up composition',
  },
  'cleansing-oil': {
    zh: '帮我生成一张卸妆油的电商主图，产品是黑色按压泵，透明瓶体，将产品放置在黑色太湖石上面，占据画面中心，画面右上角有竹子的投影，底部是波光粼粼的水面，画面采用金色背景，特写镜头，极简风格，简约大气，商业化',
    en: 'E-commerce hero image for cleansing oil: black pump, transparent bottle on black Taihu stone centered, bamboo leaf shadow top-right, rippling water at bottom, golden background, close-up, minimal premium commercial style',
  },
  'fintech-banner': {
    zh: '生成一幅金融科技风B端网页banner背景，采用2.5D等距视角构图。背景为浅蓝白色调，主体有钱包、银行、贷款、钱为主题，3D艺术，C4D，磨砂玻璃质感，透明感，光线追踪，干净浅蓝色背景，渲染风格：c4d，blender；8k超高清细节',
    en: 'Fintech B2B web banner background, 2.5D isometric view, light blue-white background, wallet bank loan money theme, 3D art C4D Blender, frosted glass, transparency, ray tracing, clean light blue background, 8K ultra HD',
  },
};
