// ==========================================
// 1. 定数・マスターデータ・計算ロジック（完全版）
// ==========================================

// 苗字上位189件
const SURNAMES_TOP200 = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
  "山崎", "森", "池田", "橋本", "阿部", "石川", "山下", "中島", "石井", "小川",
  "前田", "岡田", "長谷川", "藤田", "後藤", "近藤", "村上", "遠藤", "青木", "坂本",
  "斉藤", "福田", "藤井", "西村", "三浦", "岡本", "松田", "中川", "中野", "原田",
  "小野", "田村", "竹内", "金子", "和田", "中山", "石田", "上田", "森田", "原",
  "柴田", "酒井", "工藤", "横山", "宮崎", "宮本", "内田", "高木", "安藤", "谷口",
  "大野", "丸山", "今井", "高田", "河野", "藤原", "武田", "村田", "上野", "杉山",
  "増田", "平野", "大塚", "千葉", "久保", "松井", "小島", "岩崎", "桜井", "野口",
  "松尾", "菊地", "野村", "新井", "渡部", "本田", "吉川", "菅原", "矢野", "市川",
  "大久保", "黒田", "杉田", "白井", "黒川", "青山", "菊池", "西尾", "長田", "森下",
  "小野寺", "岩本", "桜田", "大橋", "平松", "中谷", "中井", "浜田", "市原", "坂東",
  "諸星", "萩原", "土屋", "桐生", "星野", "桑原", "坂口", "大坪", "堀内", "荒木",
  "黒木", "白石", "畑中", "堀江", "松永", "西岡", "井口", "栗原", "園田", "柏木",
  "迫", "田代", "秋山", "河村", "岸本", "大島", "榎本", "神田", "須田", "倉田",
  "金城", "滝沢", "大川", "吉村", "安田", "小笠原", "菅野", "片桐", "大竹", "川島",
  "古川", "栗田", "中田", "永田", "小池", "沖田", "大原", "宮田", "川端", "谷本",
  "石原", "小田", "平田", "栗林", "松浦", "山内", "吉岡", "高松", "山中", "大村",
  "小西", "福島", "堀", "荒井", "大森", "阿久津", "内藤", "高瀬", "浦山", "落合",
  "宮島", "浅野", "浜口", "矢島", "瀬川", "坂田", "黒沢", "根岸", "栗栖", "川畑"
];

// 女性の読み上位199個 ＆ 漢字候補
const FEMALE_READINGS_MAP = {
  "えま": ["咲茉", "依舞", "愛真", "絵麻", "えま"],
  "つむぎ": ["紬", "紬希", "紡", "つむぎ"],
  "さくら": ["桜", "咲良", "櫻", "さくら"],
  "めい": ["芽依", "芽生", "明衣", "萌衣", "めい"],
  "みお": ["美緒", "美桜", "心央", "みお"],
  "こはる": ["心春", "小春", "心晴", "こはる"],
  "ひまり": ["陽葵", "日茉莉", "陽莉", "ひまり"],
  "あおい": ["葵", "碧", "蒼", "あおい"],
  "ゆい": ["結衣", "由依", "結", "唯", "ゆい"],
  "りん": ["凛", "凜", "鈴", "倫", "りん"],
  "あかり": ["朱莉", "明莉", "灯", "あかり"],
  "ひなた": ["日向", "陽菜", "日菜", "ひなた"],
  "ほのか": ["穂乃花", "穂香", "歩乃果", "ほのか"],
  "ゆな": ["結菜", "優奈", "佑奈", "ゆな"],
  "いちご": ["一期", "苺", "一瑚", "いちご"],
  "さな": ["紗奈", "咲那", "彩菜", "さな"],
  "かのん": ["花音", "果音", "佳音", "かのん"],
  "りこ": ["莉子", "理子", "りこ"],
  "すず": ["鈴", "涼", "すず"],
  "ふうか": ["楓香", "風花", "ふうか"],
  "ゆづき": ["結月", "優月", "悠月", "ゆづき"],
  "ことね": ["琴音", "言音", "ことね"],
  "さら": ["紗良", "咲良", "沙良", "彩良", "さら"],
  "ひな": ["陽菜", "日菜", "雛", "ひな"],
  "みつき": ["美月", "光希", "充希", "みつき"],
  "あすか": ["明日香", "飛鳥", "あすか"],
  "ななみ": ["七海", "菜々美", "奈々未", "ななみ"],
  "ゆいな": ["結菜", "唯奈", "由衣奈", "ゆいな"],
  "こころ": ["心", "心結", "こころ"],
  "るか": ["琉花", "瑠香", "留果", "るか"],
  "のあ": ["乃愛", "野亜", "希空", "のあ"],
  "ゆず": ["柚", "柚子", "優寿", "ゆず"],
  "みれい": ["美玲", "美麗", "未麗", "みれい"],
  "みゆ": ["美優", "未悠", "実優", "心結", "みゆ"],
  "しおり": ["詩織", "栞", "汐里", "史緒里", "しおり"],
  "まい": ["麻衣", "舞", "真衣", "まい"],
  "みさき": ["美咲", "実咲", "海咲", "みさき"],
  "まな": ["愛菜", "真菜", "愛", "まな"],
  "れい": ["玲", "怜", "麗", "澪", "れい"],
  "はな": ["花", "華", "羽奈", "はな"],
  "ちひろ": ["千尋", "千裕", "千紘", "ちひろ"],
  "みおり": ["澪莉", "美織", "心織", "みおり"],
  "かんな": ["環奈", "栞奈", "柑奈", "かんな"],
  "ゆめ": ["優芽", "結愛", "ゆめ"],
  "あやね": ["綾音", "彩音", "絢音", "あやね"],
  "るな": ["瑠奈", "月", "流奈", "るな"],
  "はるか": ["春香", "遥香", "晴香", "悠華", "はるか"],
  "ちさと": ["千里", "知里", "千聖", "ちさと"],
  "みく": ["美玖", "未来", "未久", "みく"],
  "なのか": ["菜乃花", "七香", "七和", "なのか"],
  "あいり": ["愛莉", "愛理", "藍梨", "あいり"],
  "ゆり": ["百合", "由梨", "優里", "ゆり"],
  "みなみ": ["美波", "南", "未奈美", "みなみ"],
  "わかな": ["若菜", "和花奈", "和奏", "わかな"],
  "みずき": ["瑞希", "美月", "水希", "みずき"],
  "りお": ["莉央", "里桜", "理央", "りお"],
  "ゆきの": ["雪乃", "幸乃", "有希乃", "ゆきの"],
  "さほ": ["紗歩", "咲帆", "沙保", "さほ"],
  "このか": ["好花", "心香", "このか"],
  "ほなみ": ["穂波", "保奈美", "ほなみ"],
  "ねね": ["寧々", "音々", "ねね"],
  "うた": ["詩", "羽多", "うた"],
  "おとは": ["乙葉", "音羽", "おとは"],
  "ももか": ["百花", "萌々香", "桃香", "ももか"],
  "なな": ["奈々", "菜々", "なな"],
  "しほ": ["志保", "詩歩", "志帆", "しほ"],
  "ひより": ["日和", "陽依", "ひより"],
  "まゆ": ["真優", "麻友", "茉由", "まゆ"],
  "りんな": ["凛奈", "倫菜", "梨乃", "りんな"],
  "みほ": ["美穂", "未歩", "実保", "みほ"],
  "ひろか": ["広香", "裕香", "紘花", "ひろか"],
  "あかね": ["茜", "明音", "あかね"],
  "かすみ": ["霞", "香澄", "かすみ"],
  "ことのは": ["言葉", "琴葉", "ことのは"],
  "みか": ["美香", "美夏", "実果", "みか"],
  "さや": ["紗矢", "彩", "沙耶", "さや"],
  "ののか": ["乃々花", "乃々華", "ののか"],
  "まほ": ["真帆", "万歩", "真歩", "まほ"],
  "すずか": ["涼花", "鈴香", "すずか"],
  "あやか": ["彩花", "絢香", "綾香", "あやか"],
  "ちか": ["千夏", "智香", "知花", "ちか"],
  "りな": ["莉奈", "里奈", "理名", "りな"],
  "ともか": ["智香", "友香", "朋花", "ともか"],
  "なつき": ["菜月", "奈月", "夏希", "なつき"],
  "あんな": ["杏奈", "杏菜", "安奈", "あんな"],
  "はづき": ["葉月", "羽月", "はづき"],
  "せりな": ["芹奈", "芹菜", "せりな"],
  "よりこ": ["頼子", "依子", "よりこ"],
  "みやび": ["雅", "都", "美夜", "みやび"],
  "かほ": ["果穂", "佳歩", "夏帆", "かほ"],
  "ゆき": ["雪", "由紀", "優希", "ゆき"],
  "りか": ["梨花", "里香", "理香", "りか"],
  "みさ": ["美佐", "海砂", "実沙", "みさ"],
  "はるの": ["春乃", "はるの"],
  "たまき": ["環", "珠貴", "たまき"],
  "あや": ["彩", "綾", "絢", "あや"],
  "れな": ["玲奈", "麗奈", "怜菜", "れな"],
  "あいな": ["愛菜", "あいな"],
  "あき": ["亜希", "あき"],
  "あずみ": ["あず美", "あずみ"],
  "あん": ["杏", "あん"],
  "いおり": ["織", "衣織", "いおり"],
  "いづみ": ["泉", "和泉", "いづみ"],
  "うつぎ": ["空芽", "うつぎ"],
  "うらら": ["浦良", "うらら"],
  "えり": ["恵里", "えり"],
  "えみ": ["恵美", "えみ"],
  "かえで": ["楓", "かえで"],
  "かおり": ["香", "香織", "かおり"],
  "かおる": ["薫", "かおる"],
  "かげ": ["陽炎", "かげ"],
  "かな": ["叶", "かな"],
  "きよ": ["清代", "きよ"],
  "くみ": ["久美", "くみ"],
  "くれは": ["呉葉", "くれは"],
  "さき": ["咲希", "さき"],
  "とき": ["季", "時", "とき"],
  "なほ": ["奈穂", "なほ"],
  "にこ": ["仁子", "にこ"],
  "ふゆ": ["冬", "ふゆ"],
  "みき": ["美紀", "みき"],
  "みな": ["美奈", "みな"],
  "もか": ["桃花", "もか"],
  "もも": ["桃", "もも"],
  "ゆあ": ["優亜", "ゆあ"],
  "ゆかり": ["ゆかり", "由香里"],
  "よい": ["良依", "よい"],
  "らら": ["良々", "らら"],
  "りさ": ["里沙", "りさ"],
  "わか": ["若", "和歌", "わか"],
  "あい": ["愛", "あい"],
  "ひなの": ["ひなの"],
  "まや": ["真矢", "まや"],
  "みう": ["美羽", "みう"],
  "もこ": ["桃子", "もこ"],
  "わこ": ["和子", "わこ"],
  "うめ": ["梅", "うめ"],
  "あきな": ["秋奈", "あきな"],
  "いさき": ["壮希", "いさき"],
  "うめこ": ["梅子", "うめこ"]
};

// 14ステータス定義
const STATUS_KEYS = [
  { id: 'popularity', name: '人気' },
  { id: 'style',      name: 'スタイル' },
  { id: 'fashion',    name: 'ファッション' },
  { id: 'vocal',      name: '歌唱力' },
  { id: 'dance',      name: 'ダンス' },
  { id: 'stamina',    name: '体力' },
  { id: 'recovery',   name: '回復力' },
  { id: 'talk',       name: 'トーク力' },
  { id: 'sns',        name: 'SNS運用' },
  { id: 'variety',    name: 'バラエティ耐性' },
  { id: 'academics',  name: '学力' },
  { id: 'athletics',  name: '運動能力' },
  { id: 'crisis',     name: '危機回避力' },
  { id: 'coordination', name: '連携力' }
];

const MEMBER_STAT_GROUPS = [
  { label: '表現',    ids: ['style', 'fashion', 'vocal', 'dance', 'coordination'] },
  { label: '体調',    ids: ['recovery', 'athletics'] },
  { label: '応対力', ids: ['talk', 'sns', 'variety', 'academics', 'crisis'] }
];

const IDOL_POWER_STATS = MEMBER_STAT_GROUPS
  .filter(group => group.label === '表現' || group.label === '体調')
  .reduce((list, group) => list.concat(group.ids), []);

const MEMBER_STYLE_MIN = 55;
const MEMBER_STYLE_PER_CM = 1.5;
const MEMBER_FASHION_MIN = 60;
const HEIGHT_GROWTH_AGE_MIN = 14;
const HEIGHT_GROWTH_AGE_MAX = 17;
const HEIGHT_GROWTH_CHANCE = 0.5;
const HEIGHT_GROWTH_RATE = 0.01;

const VENUE_DATA = [
  { name: "函館ドーム",      cap: "S",  ease: "C" },
  { name: "札幌アリーナ",     cap: "C",  ease: "B" },
  { name: "パルス真駒内",     cap: "D",  ease: "B" },
  { name: "仙台球場",         cap: "B",  ease: "B" },
  { name: "秋田アリーナ",     cap: "C",  ease: "C" },
  { name: "水戸球場",         cap: "C",  ease: "A" },
  { name: "高崎総合体育館",   cap: "B",  ease: "A" },
  { name: "大宮アリーナ",     cap: "A",  ease: "A" },
  { name: "新宿球場",         cap: "S",  ease: "B" },
  { name: "原宿体育館",       cap: "C",  ease: "S" },
  { name: "文京ドーム",       cap: "SS", ease: "A" },
  { name: "パルス品川",       cap: "D",  ease: "A" },
  { name: "パルス八王子",     cap: "D",  ease: "A" },
  { name: "幕張球場",         cap: "A",  ease: "B" },
  { name: "千葉アリーナ",     cap: "B",  ease: "S" },
  { name: "パルス船橋",       cap: "C",  ease: "SS" },
  { name: "横浜球場",         cap: "A",  ease: "A" },
  { name: "川崎アリーナ",     cap: "B",  ease: "A" },
  { name: "パルス湘南",       cap: "C",  ease: "B" },
  { name: "熱海アリーナ",     cap: "C",  ease: "B" },
  { name: "新潟球場",         cap: "B",  ease: "C" },
  { name: "パルス富山",       cap: "C",  ease: "C" },
  { name: "栄ドーム",         cap: "S",  ease: "B" },
  { name: "名古屋アリーナ",   cap: "B",  ease: "B" },
  { name: "パルス名古屋",     cap: "C",  ease: "A" },
  { name: "京都アリーナ",     cap: "B",  ease: "B" },
  { name: "難波ドーム",       cap: "S",  ease: "B" },
  { name: "大阪スタジアム",   cap: "A",  ease: "A" },
  { name: "西宮球場",         cap: "SS", ease: "B" },
  { name: "パルス大阪",       cap: "C",  ease: "A" },
  { name: "広島アリーナ",     cap: "C",  ease: "A" },
  { name: "松山アリーナ",     cap: "D",  ease: "B" },
  { name: "博多ドーム",       cap: "S",  ease: "A" },
  { name: "天神アリーナ",     cap: "B",  ease: "A" },
  { name: "パルス北九州",     cap: "D",  ease: "S" },
  { name: "宮崎球場",         cap: "C",  ease: "A" },
  { name: "那覇アリーナ",     cap: "C",  ease: "B" }
];

const ICONS = {
  group: '<path d="M4 20h16"/><path d="M6 20V11l6-4 6 4v9"/><path d="M10 20v-4h4v4"/>',
  formation: '<circle cx="8" cy="8" r="3"/><path d="M3 20c0-3 2.2-5 5-5s5 2 5 5"/><path d="M15 8h6"/><path d="M15 12h6"/><path d="M15 16h4"/>',
  office: '<path d="M4 21V6l7-3 7 3v15"/><path d="M9 21v-4h4v4"/><path d="M8 9h1M8 13h1M13 9h1M13 13h1"/>',
  funds: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.4"/>',
  ranking: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5a2.5 2.5 0 0 1-2.5 2.5"/><path d="M12 14v3"/><path d="M9 20h6"/><path d="M10 17h4l.5 3h-5z"/>',
  records: '<path d="M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2z"/><path d="M6 3v18"/><path d="M10 8h6M10 12h6"/>',
  upgrade: '<circle cx="12" cy="12" r="8"/><path d="M12 16V8"/><path d="M9 11l3-3 3 3"/>',
  downgrade: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M9 13l3 3 3-3"/>',
  cost: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10"/><path d="M9.5 10h4M9.5 14h4"/>',
  refund: '<circle cx="12" cy="12" r="8"/><path d="M8 12a4 4 0 0 1 6.5-3.1"/><path d="M16 12a4 4 0 0 1-6.5 3.1"/><path d="M14 7v2.5h-2.5M10 17v-2.5h2.5"/>'
};

// IconSVGを取得する。
function getIconSvg(name) {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

const MAX_LIVE_VENUES_PER_MONTH = 3;
const MAX_LIVE_SHOWS_PER_MONTH = 8;
const VENUE_FEE_RATES = { SS: 3200, S: 3000, A: 2700, B: 2500, C: 2500, D: 2500 };
const VENUE_EXTRA_DAY_RATE = 0.2;
const MAX_OFFICE_LEVEL = 10;

const CAPACITY_MAP = { SS: 47500, S: 38500, A: 30000, B: 20000, C: 12500, D: 7500 };
const CD_BENEFITS = [
  { id: 'web-greeting', name: '特典ウェブ挨拶', cost: 2000000 },
  { id: 'real-greeting', name: 'リアル挨拶', cost: 5000000 },
  { id: 'web-sign', name: 'ウェブサイン', cost: 4000000 },
  { id: 'real-sign', name: 'リアルサインイベント', cost: 10000000 }
];

const PLAN_EVENT_TYPES = [
  ...CD_BENEFITS.map(benefit => ({ id: benefit.id, name: benefit.name, cost: benefit.cost, kind: 'benefit' })),
  { id: 'goods', name: 'グッズ販売イベント', cost: 0, kind: 'goods' }
];
const MAX_PLAN_EVENTS_PER_MONTH = 3;
const DEFAULT_PLAN_EVENT_ID = 'web-greeting';
const DEFAULT_PLAN_VENUE_CAPS = ['B', 'C'];
const PLAN_CALENDAR_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const SEAT_TYPES = [
  { id: 'arena', name: 'アリーナ' },
  { id: 'stand1', name: '1Fスタンド' },
  { id: 'stand2', name: '2Fスタンド' },
  { id: 'stand3', name: '3Fスタンド', domeOnly: true },
  { id: 'stand4', name: '4Fスタンド', domeOnly: true },
  { id: 'annotation', name: '注釈', optional: true },
  { id: 'stageBack', name: 'ステージバック', optional: true }
];

const SEAT_PRICE_GROUP = {
  arena: 'arena',
  stand1: 'stand', stand2: 'stand', stand3: 'stand', stand4: 'stand',
  annotation: 'annex', stageBack: 'annex'
};
const STANDARD_SEAT_PRICE = { arena: 12000, stand: 11000, annex: 7000 };
const VENUE_TIER_PRICE_RATE = { SS: 1.15, S: 1.1, A: 1.05, B: 1, C: 0.95, D: 0.9 };
const VENUE_TIER_DEFAULT_PRICE_RATE = 1;

const OFFICE_FACILITIES = [
  { id: 'lessons', name: 'レッスン', baseCost: 750000, baseMaintenance: 75000, effect: 'レッスン効果を強化' },
  { id: 'dormitory', name: '寮', baseCost: 1200000, baseMaintenance: 100000, effect: '育成時の体力回復を強化' },
  { id: 'analytics', name: 'データ分析', baseCost: 1500000, baseMaintenance: 125000, effect: 'グループ危機回避力を強化' },
  { id: 'snsTraining', name: 'SNS教育', baseCost: 1000000, baseMaintenance: 100000, effect: 'SNS運用と危機回避力を強化' },
  { id: 'liveProduction', name: 'ライブ演出', baseCost: 1800000, baseMaintenance: 150000, effect: 'ライブ動員を強化' },
  { id: 'merchandise', name: 'グッズ', baseCost: 1000000, baseMaintenance: 75000, effect: 'ライブでのグッズ収益を強化' }
];

const INDIVIDUAL_EVENT_PROFILES = {
  merchandise: { name: 'グッズ', capacity: 160, popularityMultiplier: 2.0, snsMultiplier: 0.25 },
  'web-greeting': { name: 'ウェブ挨拶', capacity: 150, popularityMultiplier: 2.5, snsMultiplier: 0.35 },
  'real-greeting': { name: 'リアル挨拶', capacity: 80, popularityMultiplier: 1.3, snsMultiplier: 0.15 },
  'web-sign': { name: 'ウェブサイン', capacity: 115, popularityMultiplier: 2.0, snsMultiplier: 0.3 },
  'real-sign': { name: 'リアルサイン', capacity: 55, popularityMultiplier: 1.0, snsMultiplier: 0.1 }
};

const MUSIC_PROGRAMS = [
  { id: 'song-station', name: 'Song Station', weekday: 5, week: 2 },
  { id: 'ctv', name: 'CTV', weekday: 1, week: 3 },
  { id: 'm-con', name: 'Mコン', weekday: 2, week: 3 }
];

const SPECIAL_BROADCASTS = [
  { id: 'graduation-sp', name: '卒業SP', month: 3, day: 9, popularityMultiplier: 4, songExperience: 30, appearanceFee: 3000000 },
  { id: 'newlife-sp', name: '新生活SP', month: 4, day: 8, popularityMultiplier: 4, songExperience: 30, appearanceFee: 3000000 },
  { id: 'august-music-show', name: '夏Music Show', month: 8, weekday: 6, week: 2, popularityMultiplier: 6, songExperience: 45, appearanceFee: 6000000 },
  { id: 'halloween-sp', name: 'ハロウィンSP', month: 10, day: 31, popularityMultiplier: 5, songExperience: 35, appearanceFee: 4500000 },
  { id: 'christmas-sp', name: 'クリスマスSP', month: 12, day: 23, popularityMultiplier: 5, songExperience: 35, appearanceFee: 4500000 },
  { id: 'newyear-sp', name: '年越しSP', month: 12, day: 31, extraNextDay: true, popularityMultiplier: 8, songExperience: 60, appearanceFee: 10000000 }
];

const REGULAR_PROGRAM_POPULARITY = 3;
const REGULAR_PROGRAM_SONG_EXPERIENCE = 6;
const REGULAR_PROGRAM_APPEARANCE_FEE = 300000;
const SPECIAL_OFFER_LEAD_DAYS = 28;
const KOHAKU_DATE = { month: 12, day: 31 };
const AWARD_DATE = { month: 12, day: 30 };

const MANAGER_SKILLS = [
  { id: 'leadership',    name: '統率力',             effect: '連携力練習の効果を上げる' },
  { id: 'scheduling',    name: 'スケジュール管理力', effect: '特別強化できる枠数を増やす' },
  { id: 'mentalCare',    name: 'メンタルケア',       effect: '体力消費の抑制・疲労回復率の上昇' },
  { id: 'riskControl',   name: 'リスクマネジメント', effect: '危機回避力の補正' }
];
const MAX_MANAGER_LEVEL = 10;
const MANAGER_SKILL_COST_BASE = 120000;
const MANAGER_SKILL_COST_GROWTH = 1.5;
const MANAGER_HIRE_COST = 2000000;
const MANAGER_HIRE_LIMIT = 5;
const MANAGER_YEARLY_BASE = 4080000;
const MANAGER_YEARLY_PER_LEVEL = 15000;
const MANAGER_MARKET_CANDIDATE_COUNT = 5;
const MANAGER_AGE_MIN = 25;
const MANAGER_AGE_MAX = 35;
const MANAGER_RESIGN_AGE_MIN = 40;
const MANAGER_RESIGN_AGE_MAX = 45;
const MANAGER_FIRE_MONTHS = 4;

const MANAGER_LEVEL_TIERS = [
  { label: '極', min: 50, multiplier: 1.30 },
  { label: 'SS', min: 38, multiplier: 1.21 },
  { label: 'S',  min: 25, multiplier: 1.15 },
  { label: 'A',  min: 16, multiplier: 1.10 },
  { label: 'B',  min: 10, multiplier: 1.06 },
  { label: 'C',  min: 6,  multiplier: 1.03 },
  { label: 'D',  min: 3,  multiplier: 1.01 },
  { label: 'E',  min: 0,  multiplier: 1.00 }
];

const MEMBER_SALARY_FAN_FACTOR = 1;
const MEMBER_SALARY_FAN_DAYS = 350;
const MEMBER_SALARY_GROUP_GROWTH_FACTOR = 6;

const WEEK_DAY_LABELS = ['木', '金', '土', '日', '月', '火', '水'];
const WEEK_PERIOD_LABELS = ['午前', '午後'];
const WEEK_SLOT_COUNT = WEEK_DAY_LABELS.length * WEEK_PERIOD_LABELS.length;

// 週枠日を取得する。
function getWeekSlotDay(slotIndex) { return Math.floor(slotIndex / WEEK_PERIOD_LABELS.length); }
// 週枠Periodを取得する。
function getWeekSlotPeriod(slotIndex) { return slotIndex % WEEK_PERIOD_LABELS.length; }
// 週枠ラベルを取得する。
function getWeekSlotLabel(slotIndex) {
  return `${WEEK_DAY_LABELS[getWeekSlotDay(slotIndex)]}曜${WEEK_PERIOD_LABELS[getWeekSlotPeriod(slotIndex)]}`;
}

const FULL_RUN_THROUGH_WEEKLY_LIMIT = 2;
const MORNING_SLOT_MULTIPLIER = 0.8;

const WEEKLY_SCHEDULE_ITEMS = [
  { id: 'dance-lesson', name: 'ダンスレッスン', expStat: 'dance', secondaryExp: { athletics: 0.35, stamina: 0.3 }, staminaRatio: 0.45, effect: 'ダンス（＋運動能力・体力）' },
  { id: 'vocal-lesson', name: '歌唱レッスン', expStat: 'vocal', secondaryExp: { stamina: 0.25 }, staminaRatio: 0.40, effect: '歌唱力（＋体力）' },
  { id: 'literacy', name: 'リテラシー講義', expStat: 'crisis', secondaryExp: { sns: 1.0 }, staminaRatio: 0.05, effect: '危機回避力・SNS運用' },
  { id: 'individual-lesson', name: '個別レッスン', expStat: null, secondaryExp: {}, staminaRatio: 0.60, individual: true, effect: '対象1名を集中育成' },
  { id: 'strength-training', name: '筋力トレーニング', expStat: 'athletics', secondaryExp: { recovery: 0.5 }, staminaRatio: 0.15, effect: '運動能力（＋回復力）' },
  { id: 'endurance-training', name: '持久力トレーニング', expStat: 'stamina', secondaryExp: { recovery: 0.5 }, staminaRatio: 0.15, effect: '体力（＋回復力）' },
  { id: 'full-run-through', name: '通し練習', expStat: 'dance', secondaryExp: { vocal: 1.0 }, staminaRatio: 0.70, weeklyLimit: FULL_RUN_THROUGH_WEEKLY_LIMIT, effect: 'ダンス＋歌唱' },
  { id: 'coordination', name: '連携', expStat: 'coordination', secondaryExp: {}, staminaRatio: 0.65, groupOnly: true, effect: '連携力' },
  { id: 'meal-party', name: '食事会', social: true, cost: 1000000 },
  { id: 'rest-day', name: '休養', rest: true },
  { id: 'rehearsal', name: 'リハーサル', fixed: true },
  { id: 'goods-production', name: 'グッズ制作', production: true, effect: 'グッズ制作（在庫増加）' }
];

const MEAL_PARTY_COST = 1000000;
const MEAL_PARTY_POPULARITY_GAIN = 2;
const MEAL_PARTY_CRISIS_GAIN = 3;
const MEAL_PARTY_RECOVERY = 10;

// グッズ仕様の更新（上限20種、開発費100万）
const MAX_MERCHANDISE_PRODUCTS = 10;
const GOODS_DEVELOPMENT_COST = 1000000;

const OFFICE_ACTIONS = [
  { id: 'single-promotion', name: 'シングル販促', short: '週次で減衰', detail: '選抜発表前は今作、発表後は次作を販促します。発売前は販促回数で発売時の売上が上がり、発売後は週ごとに減衰率（発売週8／通常10／過去作100）で売上が積み上がります。' },
  { id: 'live-promotion', name: '次のライブの広報', short: '集客効果Up', detail: '次回ライブの集客効果を上げます。' },
  { id: 'goods-development', name: 'グッズ開発', short: '種類+1', detail: `グッズの種類を1つ増やします。 / 上限${MAX_MERCHANDISE_PRODUCTS}種。1年以上経過したものは自動減衰します）。` },
  { id: 'goods-production', name: 'グッズ制作', short: '在庫増加', detail: 'アイドル人数と開発したグッズ種類数に応じてグッズを制作し、在庫を増やします。' }
];

const FULL_VACATION_RECOVERY = 45;
const REQUIRED_FULL_REST_DAYS = 1;
const REQUIRED_EXTRA_REST_SLOTS = 2;
const AUTO_REST_STAMINA_TARGET = 80;
const DEFAULT_WEEK_SLOTS = [
  'rest-day', 'rest-day', 'vocal-lesson', 'dance-lesson',
  'vocal-lesson', 'dance-lesson', 'literacy', 'rest-day',
  'individual-lesson', 'full-run-through', 'coordination', 'strength-training',
  'endurance-training', 'rest-day'
];

const SPECIAL_TRAINING_STATS = ['vocal', 'dance', 'stamina', 'recovery'];
const INDIVIDUAL_LESSON_STATS = SPECIAL_TRAINING_STATS.slice();
const LESSON_BASE_EXP = 80;
const SPECIAL_TRAINING_MULTIPLIER = 10;

const LIVE_BASE_EXP = LESSON_BASE_EXP * SPECIAL_TRAINING_MULTIPLIER;
const LIVE_FILL_RATE_CAP = 1.5;
const LIVE_EASE_MULTIPLIER = { SS: 1.3, S: 1.22, A: 1.15, B: 1.0, C: 0.85, D: 0.7 };
const LIVE_MULTI_DAY_BONUS = 0.25;
const LIVE_STAT_WEIGHTS = {
  dance: 1.0,
  vocal: 0.8,
  athletics: 0.5,
  coordination: 0.4,
  stamina: 0.3,
  recovery: 0.5,
};

const MAX_STAMINA_VALUE = 100;
const STAMINA_WARNING_THRESHOLD = 30;
const STAMINA_BASE_RECOVERY = 6;
const STAMINA_RECOVERY_PER_STAT = 0.12;
const STAMINA_REST_RECOVERY_MULTIPLIER = 2.5;
const SPECIAL_TRAINING_EXTRA_COST = 10;
const INJURY_BASE_RATE = 0.18;
const INJURY_ILLNESS_WEEKS = 1;
const INJURY_ACCIDENT_WEEKS_RANGE = [2, 3];
const INJURY_ACCIDENT_RATE = 0.5;
const REHEARSAL_STAMINA_COST = 4;
const BROADCAST_STAMINA_COST = 3;
const REST_SLOT_RECOVERY = 8;
const LIVE_STAMINA_COST_BASE = 18;
const LIVE_VENUE_SIZE_FACTORS = { SS: 1.6, S: 1.45, A: 1.3, B: 1.1, C: 0.9, D: 0.75 };
const MAX_LIVE_FATIGUE = 100;
const LIVE_FATIGUE_GAIN = 18;
const LIVE_FATIGUE_MULTI_DAY_BONUS = 8;
const LIVE_FATIGUE_CONSECUTIVE_BONUS = 6;
const LIVE_FATIGUE_RECOVERY_PENALTY = 0.5;
const LIVE_FATIGUE_WEEKLY_DECAY = 20;

let weeklyRecoveryDone = false;
let lastLiveDate = '';

const INITIAL_FUNDS = 100000000;
const PRESET_RELEASE_MONTHS = [2, 6];
const PRESET_RELEASE_TYPE = 'single';
const INITIAL_LIVE_MONTH_MIN = 5;
const INITIAL_LIVE_MONTH_MAX = 7;
const INITIAL_LIVE_SHOW_DAYS = 2;
const INITIAL_LIVE_VENUE = '原宿体育館';
const RELEASED_SONG_WEEKLY_PERSIST_RATE = 0.0006;
const SALES_COMPARE_SONG_COUNT = 5;
const MAX_SONG_LEVEL = 20;
const SONG_LEVEL_EXP_BASE = 24;
const SONG_LEVEL_EXP_GROWTH = 1.12;
const RELEASE_FIRST_WEEK_TUNING = 0.92;
const SONG_TITLES = ['ひかりの約束', 'キミ色サイン', '青空レター', '恋するステップ', '未来へのメロディ', '星屑のリボン', 'まっすぐな夢', '花咲く頃に'];

const RIVAL_NAME_HEADS = [
  'ヴァイオレット', 'プリズム', 'ステラ', 'ネオン', 'ダイアモンド',
  'ルナ', 'ソラ', 'ヒカリ', 'カゼ', 'ユメ', 'ミライ', 'ココロ',
  'アオゾラ', 'ハル', 'ナオ', 'エンゼル', 'クローバー', 'ペタル',
  'スイフト', 'アオ', 'アカ', 'ギンカ', 'ヨル', 'ボイス',
  'ジュエル', 'パレット', 'モノクロ', 'サンセット', 'ムーンライト',
  'フェニックス', 'レインボー', 'グルーヴ'
];
const RIVAL_NAME_TAILS = [
  'クイーン', 'プロジェクト', 'シンフォニー', 'ガールズ', 'シスターズ',
  'クラブ', 'ユニオン', 'オアシス', 'チャーム', 'ポエジー',
  'メロディ', 'ドリーム', 'ビート', 'ストーリーズ', 'セクション',
  'アイドル', 'グループ', 'ショー', 'ステージ', 'コレクション'
];

// 順位データを取得する。
function getRankData(val) {
  if (val >= 90) return { rank: 'S', color: '#ff1493', bg: '#ffe4e1' }; // ディープピンク
  if (val >= 80) return { rank: 'A', color: '#ff00ff', bg: '#fce4ec' }; // マゼンタ
  if (val >= 70) return { rank: 'B', color: '#ff0000', bg: '#ffebee' }; // レッド
  if (val >= 60) return { rank: 'C', color: '#ff7f50', bg: '#fff0e6' }; // コーラル
  if (val >= 50) return { rank: 'D', color: '#b8970b', bg: '#fffde7' }; // イエロー（視認性考慮）
  if (val >= 40) return { rank: 'E', color: '#8bc34a', bg: '#f1f8e9' }; // グリーンイエロー
  if (val >= 20) return { rank: 'F', color: '#00bfff', bg: '#e1f5fe' }; // ディープスカイブルー
  return { rank: 'G', color: '#666666', bg: '#f0f0f0' };               // ダークグレー
}

// ==========================================
// 能力値経験値システム（Lv.50で5000pt、そこから1.05倍で関数的に増加）
// ==========================================
function getStatExpRequired(level) {
  const currentLevel = Math.max(0, level);
  if (currentLevel < 50) {
    return Math.round(100 * Math.pow(1.082, currentLevel));
  } else {
    const diff = currentLevel - 50;
    return Math.round(5000 * Math.pow(1.05, diff));
  }
}
