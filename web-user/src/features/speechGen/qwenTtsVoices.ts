import type { AppLocale } from '../../i18n/config';

export type SpeechVoiceAge = 'child' | 'youth' | 'middle' | 'elderly';
export type SpeechVoiceGender = 'male' | 'female';
export type SpeechVoiceLangTag = 'chinese' | 'english' | 'japanese' | 'dialect' | 'minority';

/** 音色展示文案的多语言容器。未提供某语言时回退到 en，再回退到 zh-CN。 */
export type LocalizedVoiceText = Partial<Record<AppLocale, string>> & { 'zh-CN': string; en: string };

export interface QwenTtsVoice {
  /** 内部 id（小写，用于匹配与存储） */
  voice: string;
  /** API voice 参数（官方 PascalCase / 空格格式） */
  apiVoice: string;
  label: LocalizedVoiceText;
  description: LocalizedVoiceText;
  /** 卡片底部副标题，如「小姐姐」 */
  subtitle: LocalizedVoiceText;
  gender: SpeechVoiceGender;
  age: SpeechVoiceAge;
  langTags: SpeechVoiceLangTag[];
}

/** 按当前界面语言取音色展示文案，回退顺序：当前语言 → en → zh-CN。 */
export function pickVoiceText(text: LocalizedVoiceText, language: string): string {
  const locales = languageToLocales(language);
  for (const lng of locales) {
    const v = text[lng];
    if (v && v.trim()) return v;
  }
  return text.en || text['zh-CN'];
}

function languageToLocales(language: string): AppLocale[] {
  const raw = (language ?? '').trim().toLowerCase();
  if (!raw) return ['en', 'zh-CN'];
  if (raw === 'zh' || raw === 'zh-cn' || raw.startsWith('zh-hans')) return ['zh-CN'];
  if (raw.startsWith('en')) return ['en'];
  if (raw.startsWith('th')) return ['th'];
  if (raw.startsWith('vi')) return ['vi'];
  if (raw.startsWith('ms')) return ['ms'];
  return ['en', 'zh-CN'];
}

/** 百炼 Qwen-TTS 非实时音色精选表（27 款） */
export const QWEN_TTS_VOICES: QwenTtsVoice[] = [
  {
    voice: 'cherry', apiVoice: 'Cherry',
    label: { 'zh-CN': '芊悦', en: 'Cherry', th: 'เชอร์รี่', vi: 'Cherry', ms: 'Cherry' },
    description: { 'zh-CN': '阳光积极、亲切自然', en: 'Sunny, positive, and naturally friendly', th: 'สดใส มองโลกในแง่ดี เป็นธรรมชาติและเป็นกันเอง', vi: 'Lạc quan, vui vẻ, tự nhiên gần gũi', ms: 'Ceria, positif, dan mesra secara semula jadi' },
    subtitle: { 'zh-CN': '小姐姐', en: 'Young lady', th: 'หญิงสาว', vi: 'Cô gái trẻ', ms: 'Gadis muda' },
    gender: 'female', age: 'youth', langTags: ['chinese'],
  },
  {
    voice: 'chelsie', apiVoice: 'Chelsie',
    label: { 'zh-CN': '千雪', en: 'Chelsie', th: 'เชลซี', vi: 'Chelsie', ms: 'Chelsie' },
    description: { 'zh-CN': '二次元虚拟女友', en: 'Anime-style virtual girlfriend', th: 'แฟนเสมือนจริงสไตล์อนิเมะ', vi: 'Bạn gái ảo phong cách anime', ms: 'Teman wanita maya gaya anime' },
    subtitle: { 'zh-CN': '虚拟女友', en: 'Virtual girlfriend', th: 'แฟนเสมือนจริง', vi: 'Bạn gái ảo', ms: ' Teman wanita maya' },
    gender: 'female', age: 'youth', langTags: ['chinese'],
  },
  {
    voice: 'jennifer', apiVoice: 'Jennifer',
    label: { 'zh-CN': '詹妮弗', en: 'Jennifer', th: 'เจนนิเฟอร์', vi: 'Jennifer', ms: 'Jennifer' },
    description: { 'zh-CN': '品牌级、电影质感般美语', en: 'Brand-grade, cinematic American English', th: 'อังกฤษแบบอเมริกันระดับแบรนด์ คุณภาพระดับภาพยนตร์', vi: 'Tiếng Anh Mỹ cấp thương hiệu, chất lượng điện ảnh', ms: 'Bahasa Inggeris Amerika gred jenama, kualiti sinematik' },
    subtitle: { 'zh-CN': '美语女声', en: 'American female voice', th: 'เสียงหญิงอเมริกัน', vi: 'Giọng nữ Mỹ', ms: 'Suara wanita Amerika' },
    gender: 'female', age: 'middle', langTags: ['english'],
  },
  {
    voice: 'katerina', apiVoice: 'Katerina',
    label: { 'zh-CN': '卡捷琳娜', en: 'Katerina', th: 'คาเตรินา', vi: 'Katerina', ms: 'Katerina' },
    description: { 'zh-CN': '御姐音色，韵律回味十足', en: 'Mature female voice with rich rhythm', th: 'เสียงหญิงผู้ใหญ่ จังหวะเด่นสะดุดตา', vi: 'Giọng nữ trưởng thành, nhịp điệu cuốn hút', ms: 'Suara wanita matang, rentak yang menonjol' },
    subtitle: { 'zh-CN': '御姐音色', en: 'Mature female voice', th: 'เสียงหญิงผู้ใหญ่', vi: 'Giọng nữ trưởng thành', ms: 'Suara wanita matang' },
    gender: 'female', age: 'middle', langTags: ['chinese'],
  },
  {
    voice: 'ono anna', apiVoice: 'Ono Anna',
    label: { 'zh-CN': '小野杏', en: 'Ono Anna', th: 'โอโนะ อันนะ', vi: 'Ono Anna', ms: 'Ono Anna' },
    description: { 'zh-CN': '鬼灵精怪的青梅竹马', en: 'Quirky childhood friend', th: 'เพื่อนสมัยเด็กที่ซนและน่ารัก', vi: 'Bạn thanh mai trúc mã tinh nghịch', ms: 'Kawan zaman kanak-kanak yang nakal lagi comel' },
    subtitle: { 'zh-CN': '青梅竹马', en: 'Childhood friend', th: 'เพื่อนสมัยเด็ก', vi: 'Thanh mai trúc mã', ms: 'Kawan zaman kanak-kanak' },
    gender: 'female', age: 'youth', langTags: ['japanese'],
  },
  {
    voice: 'ethan', apiVoice: 'Ethan',
    label: { 'zh-CN': '晨煦', en: 'Ethan', th: 'อีธาน', vi: 'Ethan', ms: 'Ethan' },
    description: { 'zh-CN': '标准普通话，阳光温暖活力朝气', en: 'Standard Mandarin, warm and energetic', th: 'แมนดารินมาตรฐาน อบอุ่นและพลังงานเต็ม', vi: 'Phổ thông thoại chuẩn, ấm áp và năng động', ms: 'Mandarin standard, hangat dan bertenaga' },
    subtitle: { 'zh-CN': '阳光男声', en: 'Sunny male voice', th: 'เสียงชายสดใส', vi: 'Giọng nam nắng ấm', ms: 'Suara lelaki ceria' },
    gender: 'male', age: 'youth', langTags: ['chinese'],
  },
  {
    voice: 'kai', apiVoice: 'Kai',
    label: { 'zh-CN': '凯', en: 'Kai', th: 'ไค', vi: 'Kai', ms: 'Kai' },
    description: { 'zh-CN': '耳朵的一场 SPA', en: 'A spa for your ears', th: 'สปาให้หูของคุณ', vi: 'SPA cho đôi tai', ms: 'SPA untuk telinga anda' },
    subtitle: { 'zh-CN': '治愈男声', en: 'Healing male voice', th: 'เสียงชายผ่อนคลาย', vi: 'Giọng nam chữa lành', ms: 'Suara lelaki yang menenangkan' },
    gender: 'male', age: 'middle', langTags: ['chinese'],
  },
  {
    voice: 'nofish', apiVoice: 'Nofish',
    label: { 'zh-CN': '不吃鱼', en: 'Nofish', th: 'โนฟิช', vi: 'Nofish', ms: 'Nofish' },
    description: { 'zh-CN': '不会翘舌音的设计师', en: 'Designer who skips retroflex sounds', th: 'นักออกแบบที่ไม่ออกเสียงม้วนลิ้น', vi: 'Designer không phát âm cuống lưỡi', ms: 'Pereka bentuk yang tidak sebut bunyi gulung lidah' },
    subtitle: { 'zh-CN': '设计师', en: 'Designer', th: 'นักออกแบบ', vi: 'Designer', ms: 'Pereka bentuk' },
    gender: 'male', age: 'youth', langTags: ['chinese'],
  },
  {
    voice: 'ryan', apiVoice: 'Ryan',
    label: { 'zh-CN': '甜茶', en: 'Ryan', th: 'ไรอัน', vi: 'Ryan', ms: 'Ryan' },
    description: { 'zh-CN': '节奏拉满，戏感炸裂', en: 'High energy, dramatic flair', th: 'พลังงานเต็ม เด่นเร้าใจ', vi: 'Nhịp độ cao, diễn xuất bùng nổ', ms: 'Tenaga tinggi, dramatik' },
    subtitle: { 'zh-CN': '戏感男声', en: 'Dramatic male voice', th: 'เสียงชายเด่น', vi: 'Giọng nam diễn xuất', ms: 'Suara lelaki dramatik' },
    gender: 'male', age: 'youth', langTags: ['chinese'],
  },
  {
    voice: 'aiden', apiVoice: 'Aiden',
    label: { 'zh-CN': '艾登', en: 'Aiden', th: 'เอเดน', vi: 'Aiden', ms: 'Aiden' },
    description: { 'zh-CN': '精通厨艺的美语大男孩', en: 'American guy skilled at cooking', th: 'หนุ่มอเมริกันที่เก่งการทำอาหาร', vi: 'Chàng trai Mỹ giỏi nấu ăn', ms: 'Budak Amerika yang mahir memasak' },
    subtitle: { 'zh-CN': '美语男孩', en: 'American boy', th: 'หนุ่มอเมริกัน', vi: 'Chàng trai Mỹ', ms: 'Budak Amerika' },
    gender: 'male', age: 'youth', langTags: ['english'],
  },
  {
    voice: 'vincent', apiVoice: 'Vincent',
    label: { 'zh-CN': '田叔', en: 'Vincent', th: 'วินเซนต์', vi: 'Vincent', ms: 'Vincent' },
    description: { 'zh-CN': '独特的沙哑烟嗓，江湖豪情', en: 'Husky voice with bold spirit', th: 'เสียงแหบพราก แสดงถึงความเด็ดเดี่ยว', vi: 'Giọng khàn đặc trưng, hào sảng', ms: 'Suara serak yang berani dan lantang' },
    subtitle: { 'zh-CN': '烟嗓大叔', en: 'Husky-voiced uncle', th: 'ลุงเสียงแหบ', vi: 'Giọng khàn', ms: 'Bapa saudara bersuara serak' },
    gender: 'male', age: 'middle', langTags: ['chinese'],
  },
  {
    voice: 'eldric sage', apiVoice: 'Eldric Sage',
    label: { 'zh-CN': '沧明子', en: 'Eldric Sage', th: 'เอลดริก เซจ', vi: 'Eldric Sage', ms: 'Eldric Sage' },
    description: { 'zh-CN': '沉稳睿智的老者，沧桑如松', en: 'Calm, wise elder, steadfast as pine', th: 'ผู้สูงอายุสุขุมและมีปัญญา มั่นคงดั่งสน', vi: 'Lão giả điềm tĩnh trí tuệ, vững như tùng', ms: 'Tua-tua yang tenang dan bijaksana, teguh seperti pain' },
    subtitle: { 'zh-CN': '睿智老者', en: 'Wise elder', th: 'ผู้สูงอายุผู้มีปัญญา', vi: 'Bậc lão thông thái', ms: 'Tua-tua yang bijaksana' },
    gender: 'male', age: 'elderly', langTags: ['chinese'],
  },
  {
    voice: 'mochi', apiVoice: 'Mochi',
    label: { 'zh-CN': '沙小弥', en: 'Mochi', th: 'โมจิ', vi: 'Mochi', ms: 'Mochi' },
    description: { 'zh-CN': '聪明伶俐的小大人', en: 'Clever and articulate little adult', th: 'เด็กเล็กที่ฉลาดและพูดเก่ง', vi: 'Đứa trẻ thông minh hoạt bát', ms: 'Kanak-kanak yang bijak dan cakap teratur' },
    subtitle: { 'zh-CN': '小大人', en: 'Little adult', th: 'เด็กผู้ใหญ่', vi: 'Trẻ người lớn', ms: 'Kanak-kanak dewasa' },
    gender: 'male', age: 'child', langTags: ['chinese'],
  },
  {
    voice: 'nini', apiVoice: 'Nini',
    label: { 'zh-CN': '邻家妹妹', en: 'Nini', th: 'นินิ', vi: 'Nini', ms: 'Nini' },
    description: { 'zh-CN': '软糯黏人的嗓音', en: 'Soft, sweet, clingy voice', th: 'เสียงนุ่มหวานและออดอ้อน', vi: 'Giọng êm ái ngọt ngào bám người', ms: 'Suara lembut, manis, dan melekat' },
    subtitle: { 'zh-CN': '软糯嗓音', en: 'Soft sweet voice', th: 'เสียงนุ่มหวาน', vi: 'Giọng êm ái', ms: 'Suara lembut dan manis' },
    gender: 'female', age: 'child', langTags: ['chinese'],
  },
  {
    voice: 'pip', apiVoice: 'Pip',
    label: { 'zh-CN': '顽屁小孩', en: 'Pip', th: 'ปิป', vi: 'Pip', ms: 'Pip' },
    description: { 'zh-CN': '调皮捣蛋却充满童真', en: 'Naughty yet full of innocence', th: 'ซนแต่บริสุทธิ์', vi: 'Vòi bậy nhưng hồn nhiên', ms: 'Nakal tetapi penuh kepolosan' },
    subtitle: { 'zh-CN': '童真男孩', en: 'Innocent boy', th: 'เด็กชายบริสุทธิ์', vi: 'Bé trai hồn nhiên', ms: 'Budak lelaki yang polos' },
    gender: 'male', age: 'child', langTags: ['chinese'],
  },
  {
    voice: 'bunny', apiVoice: 'Bunny',
    label: { 'zh-CN': '萌小姬', en: 'Bunny', th: 'บันนี่', vi: 'Bunny', ms: 'Bunny' },
    description: { 'zh-CN': '萌属性爆棚的小萝莉', en: 'Super cute little girl voice', th: 'เสียงเด็กหญิงน่ารักสุดๆ', vi: 'Giọng loli cực kỳ đáng yêu', ms: 'Suara gadis kecil yang sangat comel' },
    subtitle: { 'zh-CN': '小萝莉', en: 'Cute little girl', th: 'เด็กหญิงน่ารัก', vi: 'Bé gái đáng yêu', ms: 'Gadis kecil comel' },
    gender: 'female', age: 'child', langTags: ['chinese'],
  },
  {
    voice: 'stella', apiVoice: 'Stella',
    label: { 'zh-CN': '少女阿月', en: 'Stella', th: 'สเตลลา', vi: 'Stella', ms: 'Stella' },
    description: { 'zh-CN': '甜到发腻的迷糊少女音', en: 'Sweet, dreamy teenage girl voice', th: 'เสียงสาวรุ่นหวานและเซ่อซ่า', vi: 'Giọng thiếu nữ ngọt ngào đãng đải', ms: 'Suara gadis remaja yang manis dan lupa-lupa' },
    subtitle: { 'zh-CN': '迷糊少女', en: 'Dreamy teen girl', th: 'สาวรุ่นเซ่อซ่า', vi: 'Thiếu nữ đãng đải', ms: 'Gadis remaja lupa-lupa' },
    gender: 'female', age: 'youth', langTags: ['chinese'],
  },
  {
    voice: 'neil', apiVoice: 'Neil',
    label: { 'zh-CN': '阿闻', en: 'Neil', th: 'นีล', vi: 'Neil', ms: 'Neil' },
    description: { 'zh-CN': '专业的新闻主持人', en: 'Professional news anchor', th: 'ผู้ประกาศข่าวมืออาชีพ', vi: 'MC thời sự chuyên nghiệp', ms: 'Pembaca berita profesional' },
    subtitle: { 'zh-CN': '主持人', en: 'Anchor', th: 'ผู้ประกาศ', vi: 'MC', ms: 'Penyampai berita' },
    gender: 'male', age: 'middle', langTags: ['chinese'],
  },
  {
    voice: 'elias', apiVoice: 'Elias',
    label: { 'zh-CN': '墨讲师', en: 'Elias', th: 'อีไลอัส', vi: 'Elias', ms: 'Elias' },
    description: { 'zh-CN': '学科严谨，叙事技巧出色', en: 'Rigorous scholar, excellent storyteller', th: 'นักวิชาการเข้มงวด เล่าเรื่องเก่ง', vi: 'Học giả nghiêm túc, kể chuyện xuất sắc', ms: 'Sarjana yang tegas, pencerita yang cemerlang' },
    subtitle: { 'zh-CN': '学科讲师', en: 'Lecturer', th: 'อาจารย์ผู้สอน', vi: 'Giảng viên', ms: 'Pensyarah' },
    gender: 'female', age: 'middle', langTags: ['chinese'],
  },
  {
    voice: 'bellona', apiVoice: 'Bellona',
    label: { 'zh-CN': '燕铮莺', en: 'Bellona', th: 'เบลโลนา', vi: 'Bellona', ms: 'Bellona' },
    description: { 'zh-CN': '声音洪亮，吐字清晰，人物鲜活', en: 'Loud, clear articulation, vivid persona', th: 'เสียงดัง ชัดเจน ตัวตนชัดเจน', vi: 'Giọng vang, phát âm rõ, nhân vật sống động', ms: 'Suara lantang, sebutan jelas, watak hidup' },
    subtitle: { 'zh-CN': '播音腔', en: 'Broadcast voice', th: 'เสียงประกาศ', vi: 'Giọng phát thanh', ms: 'Suara penyiaran' },
    gender: 'female', age: 'middle', langTags: ['chinese'],
  },
  {
    voice: 'jada', apiVoice: 'Jada',
    label: { 'zh-CN': '上海-阿珍', en: 'Jada (Shanghai)', th: 'จาดา (เซี่ยงไฮ้)', vi: 'Jada (Thượng Hải)', ms: 'Jada (Shanghai)' },
    description: { 'zh-CN': '风风火火的沪上阿姐', en: 'Energetic Shanghai auntie', th: 'ป้าเซี่ยงไฮ้พลังงานเต็ม', vi: 'Chị Thượng Hải năng nổ', ms: 'Makcik Shanghai yang bertenaga' },
    subtitle: { 'zh-CN': '沪上阿姐', en: 'Shanghai auntie', th: 'ป้าเซี่ยงไฮ้', vi: 'Chị Thượng Hải', ms: 'Makcik Shanghai' },
    gender: 'female', age: 'middle', langTags: ['dialect'],
  },
  {
    voice: 'dylan', apiVoice: 'Dylan',
    label: { 'zh-CN': '北京-晓东', en: 'Dylan (Beijing)', th: 'ดีแลน (ปักกิ่ง)', vi: 'Dylan (Bắc Kinh)', ms: 'Dylan (Beijing)' },
    description: { 'zh-CN': '北京胡同里长大的少年', en: 'Teenager raised in Beijing hutongs', th: 'วัยรุ่นที่โตในย่านหูทงปักกิ่ง', vi: 'Thiếu niên lớn lên ở cổng Bắc Kinh', ms: 'Remaja yang membesar di hutong Beijing' },
    subtitle: { 'zh-CN': '胡同少年', en: 'Hutong teen', th: 'วัยรุ่นหูทง', vi: 'Thiếu niên cổng', ms: 'Remaja hutong' },
    gender: 'male', age: 'youth', langTags: ['dialect'],
  },
  {
    voice: 'roy', apiVoice: 'Roy',
    label: { 'zh-CN': '闽南-阿杰', en: 'Roy (Hokkien)', th: 'รอย (หมิ่นหนาน)', vi: 'Roy (Mân Nam)', ms: 'Roy (Hokkien)' },
    description: { 'zh-CN': '诙谐直爽的台湾哥仔', en: 'Witty, straightforward Taiwanese guy', th: 'หนุ่มไต้หวันตลกและตรงไปตรงมา', vi: 'Chàng trai Đài Loan hài hước thẳng thắn', ms: 'Budak Taiwan yang lucu dan jujur' },
    subtitle: { 'zh-CN': '台湾哥仔', en: 'Taiwanese guy', th: 'หนุ่มไต้หวัน', vi: 'Chàng trai Đài Loan', ms: 'Budak Taiwan' },
    gender: 'male', age: 'youth', langTags: ['dialect'],
  },
  {
    voice: 'sunny', apiVoice: 'Sunny',
    label: { 'zh-CN': '四川-晴儿', en: 'Sunny (Sichuan)', th: 'ซันนี่ (เสฉวน)', vi: 'Sunny (Tứ Xuyên)', ms: 'Sunny (Sichuan)' },
    description: { 'zh-CN': '甜到你心里的川妹子', en: 'Sweet Sichuan girl', th: 'สาวเสฉวนที่หวานล้ำ', vi: 'Cô gái Tứ Xuyên ngọt ngào', ms: 'Gadis Sichuan yang manis' },
    subtitle: { 'zh-CN': '川妹子', en: 'Sichuan girl', th: 'สาวเสฉวน', vi: 'Gái Tứ Xuyên', ms: 'Gadis Sichuan' },
    gender: 'female', age: 'youth', langTags: ['dialect'],
  },
  {
    voice: 'eric', apiVoice: 'Eric',
    label: { 'zh-CN': '四川-程川', en: 'Eric (Sichuan)', th: 'อีริค (เสฉวน)', vi: 'Eric (Tứ Xuyên)', ms: 'Eric (Sichuan)' },
    description: { 'zh-CN': '跳脱市井的成都男子', en: 'Lively, street-smart Chengdu man', th: 'ชายเฉิงตูที่สดใสและฉลาดเอาตัวรอด', vi: 'Chàng trai Thành Đô hào nhoáng phố thị', ms: 'Lelaki Chengdu yang ceria dan pandai bertahan' },
    subtitle: { 'zh-CN': '成都男子', en: 'Chengdu man', th: 'ชายเฉิงตู', vi: 'Chàng trai Thành Đô', ms: 'Lelaki Chengdu' },
    gender: 'male', age: 'youth', langTags: ['dialect'],
  },
  {
    voice: 'rocky', apiVoice: 'Rocky',
    label: { 'zh-CN': '粤语-阿强', en: 'Rocky (Cantonese)', th: 'ร็อกกี้ (กวางตุ้ง)', vi: 'Rocky (Quảng Đông)', ms: 'Rocky (Canton)' },
    description: { 'zh-CN': '幽默风趣，在线陪聊', en: 'Humorous, great for chitchat', th: 'ตลกและสนุก เหมาะกับการคุยสนุกๆ', vi: 'Hài hước, hoạt ngôn, trò chuyện cùng bạn', ms: 'Lucu dan menarik, sesuai untuk bersembang' },
    subtitle: { 'zh-CN': '陪聊达人', en: 'Chitchat expert', th: 'เซียนคุย', vi: 'Tân bình luận', ms: ' Pakar bersembang' },
    gender: 'male', age: 'youth', langTags: ['dialect'],
  },
  {
    voice: 'kiki', apiVoice: 'Kiki',
    label: { 'zh-CN': '粤语-阿清', en: 'Kiki (Cantonese)', th: 'คิกิ้ (กวางตุ้ง)', vi: 'Kiki (Quảng Đông)', ms: 'Kiki (Canton)' },
    description: { 'zh-CN': '甜美的港妹闺蜜', en: 'Sweet Hong Kong girl bestie', th: 'เพื่อนสาวฮ่องกงหวานๆ', vi: 'Bạn thân gái Hồng Kông ngọt ngào', ms: 'Sahabat perempuan Hong Kong yang manis' },
    subtitle: { 'zh-CN': '港妹闺蜜', en: 'HK girl bestie', th: 'เพื่อนสาวฮ่องกง', vi: 'Bạn thân gái HK', ms: 'Sahabat perempuan HK' },
    gender: 'female', age: 'youth', langTags: ['dialect'],
  },
];

export function findTtsVoice(voice: string): QwenTtsVoice | undefined {
  const key = voice.trim().toLowerCase();
  return QWEN_TTS_VOICES.find((v) => v.voice.toLowerCase() === key);
}

/** 不在精选表内的音色视为未选择 */
export function normalizeTtsVoice(voice: string | undefined): string {
  const matched = findTtsVoice(voice ?? '');
  return matched?.voice ?? '';
}

/** 转为 API 请求的 voice 参数（官方 PascalCase） */
export function toTtsApiVoice(voice: string | undefined): string {
  const matched = findTtsVoice(voice ?? '');
  return matched?.apiVoice ?? '';
}

export type VoiceFilterState = {
  age: 'all' | SpeechVoiceAge;
  gender: 'all' | SpeechVoiceGender;
};

export function filterTtsVoices(
  voices: QwenTtsVoice[],
  filters: VoiceFilterState,
): QwenTtsVoice[] {
  return voices.filter((v) => {
    if (filters.age !== 'all' && v.age !== filters.age) return false;
    if (filters.gender !== 'all' && v.gender !== filters.gender) return false;
    return true;
  });
}
