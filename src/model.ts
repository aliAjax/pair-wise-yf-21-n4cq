/**
 * 数据模型层（model.ts）
 * ------------------------------------------------------------
 * 只管三件事：
 *  1. 台账的数据结构（地毯 / 破损标记 / 修复前后记录）
 *  2. localStorage 读写（不接后台，关掉再打开资料还在）
 *  3. 种子数据与构造工具
 * 业务规则一律放在 rules.ts，页面一律放在 pages.tsx。
 */

/* ------------------------------ 常量字典 ------------------------------ */

/** 产地筛选项（侧边栏的筛选口径） */
export const ORIGINS = ["波斯", "安纳托利亚", "高加索", "藏毯"] as const;

export const DYEINGS = ["植物染", "化学染", "混合染"] as const;

export const MATERIALS = [
  "羊毛",
  "羊毛 / 棉经棉纬",
  "真丝",
  "羊毛混丝",
  "驼毛",
] as const;

export const DAMAGE_KINDS = [
  "磨损",
  "缺口",
  "褪色",
  "断裂",
  "虫蛀",
  "霉斑",
  "其他",
] as const;

export const STAGES = [
  { value: "before", label: "修复前" },
  { value: "after", label: "修复后" },
] as const;

/* ------------------------------ 数据结构 ------------------------------ */

/** 修复前后记录：挂在单个破损标记下，可附图（压缩后的 dataURL） */
export interface RepairRecord {
  id: string;
  stage: "before" | "after";
  date: string; // YYYY-MM-DD
  note: string;
  photo?: string;
}

/** 纹样图上的一个破损标记。坐标用 0~100 的百分比，图换了标记位置也不漂 */
export interface DamageMark {
  id: string;
  x: number;
  y: number;
  kind: string; // 破损类型
  area: string; // 位置与尺寸，如“左缘 12×4cm”
  threadColor: string; // 补线色（hex）
  threadColorName: string; // 色名 / 色号
  threadLength: number; // 补线用量（米）
  instructions: string; // 施工说明
  status: "open" | "signed"; // 待补修 / 已签收
  signedAt?: number;
  createdAt: number;
  records: RepairRecord[];
}

/** 一块地毯的档案 */
export interface Carpet {
  id: string;
  origin: string; // 产地
  era: string; // 年代
  knotDensity: number; // 结密度（结 / 平方分米）
  material: string; // 材质
  dyeing: string; // 染色方式
  patternImage?: string; // 纹样图（可不上传，用内置纹样底图）
  archived: boolean; // 标记齐签后才可归档；归档后只读
  createdAt: number;
  marks: DamageMark[];
}

/** 新地毯登记表单的入参 */
export type CarpetDraft = Omit<
  Carpet,
  "id" | "archived" | "createdAt" | "marks"
>;

/* ------------------------------ 小工具 ------------------------------ */

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = (): string => new Date().toISOString().slice(0, 10);

/** 新登记的地毯编号：CAR-092 → CAR-093，已被占用的号会跳过 */
export function nextCarpetId(carpets: Carpet[]): string {
  const used = new Set(
    carpets.map((c) => Number(c.id.replace(/\D/g, ""))).filter((n) => n > 0)
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `CAR-${String(n).padStart(3, "0")}`;
}

/** 新建一个空白破损标记（点击纹样图时调用） */
export function makeMark(x: number, y: number): DamageMark {
  return {
    id: uid(),
    x,
    y,
    kind: DAMAGE_KINDS[0],
    area: "",
    threadColor: "#9a3412",
    threadColorName: "",
    threadLength: 0,
    instructions: "",
    status: "open",
    createdAt: Date.now(),
    records: [],
  };
}

/**
 * 读入图片并压缩成 dataURL，直接随档案存进 localStorage。
 * 不接后台，照片也跟着档案走。
 */
export function readImage(file: File, maxSide = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------ localStorage ------------------------------ */

const STORAGE_KEY = "rug-restoration-ledger.v1";

/** 读取档案；首次打开没有任何资料时，铺三份示例台账 */
export function loadCarpets(): Carpet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Carpet[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* 数据损坏时退回示例数据 */
  }
  return seedCarpets();
}

/** 保存档案；返回 null 表示成功，否则给一句给页面展示的报错 */
export function saveCarpets(carpets: Carpet[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(carpets));
    return null;
  } catch {
    return "本地存储已满，本次照片可能没能存下；可删除部分修复照片后重试。";
  }
}

/* ------------------------------ 示例数据 ------------------------------ */

function seedCarpets(): Carpet[] {
  return [
    {
      id: "CAR-092",
      origin: "波斯",
      era: "约1960s",
      knotDensity: 38,
      material: "羊毛",
      dyeing: "植物染",
      archived: false,
      createdAt: Date.parse("2026-08-04T09:00:00Z"),
      marks: [
        {
          id: "m-092-1",
          x: 7,
          y: 51,
          kind: "磨损",
          area: "左侧穗边 14×5cm",
          threadColor: "#9a3412",
          threadColorName: "铁锈红",
          threadLength: 7.5,
          instructions:
            "顺原边三股绞编锁边，绒头留高 2mm，补线回温后轻剪齐平。",
          status: "signed",
          signedAt: Date.parse("2026-08-21T10:30:00Z"),
          createdAt: Date.parse("2026-08-05T09:00:00Z"),
          records: [
            {
              id: "r-092-1-b",
              stage: "before",
              date: "2026-08-12",
              note: "左缘磨穿见底经，穗头缺失约 6cm，周边绒面倒伏。",
            },
            {
              id: "r-092-1-a",
              stage: "after",
              date: "2026-08-20",
              note: "同色羊毛补织并锁边，绒面与原毯过渡自然，牵拉不脱线。",
            },
          ],
        },
        {
          id: "m-092-2",
          x: 76,
          y: 17,
          kind: "褪色",
          area: "右上角花叶纹 6×6cm",
          threadColor: "#b45309",
          threadColorName: "石榴黄",
          threadLength: 2.2,
          instructions: "植物染复色，分次薄染，每遍干透再比对原色。",
          status: "open",
          createdAt: Date.parse("2026-08-22T09:00:00Z"),
          records: [
            {
              id: "r-092-2-b",
              stage: "before",
              date: "2026-08-22",
              note: "黄花叶纹泛白，色度比原色浅两档。",
            },
          ],
        },
      ],
    },
    {
      id: "CAR-117",
      origin: "安纳托利亚",
      era: "约1950s",
      knotDensity: 42,
      material: "羊毛 / 棉经棉纬",
      dyeing: "植物染",
      archived: false,
      createdAt: Date.parse("2026-08-18T09:00:00Z"),
      marks: [
        {
          id: "m-117-1",
          x: 50,
          y: 47,
          kind: "缺口",
          area: "中心葵纹 5×4cm",
          threadColor: "#7c2d12",
          threadColorName: "枣红",
          threadLength: 3.5,
          instructions: "以左右对称葵纹放样起针，双结扣逐行压实。",
          status: "open",
          createdAt: Date.parse("2026-08-19T09:00:00Z"),
          records: [
            {
              id: "r-117-1-b",
              stage: "before",
              date: "2026-08-19",
              note: "中心葵纹缺一块，断经 3 根，边缘绒头松脱。",
            },
          ],
        },
      ],
    },
    {
      id: "CAR-138",
      origin: "藏毯",
      era: "约1970s",
      knotDensity: 56,
      material: "羊毛",
      dyeing: "植物染",
      archived: false,
      createdAt: Date.parse("2026-09-02T09:00:00Z"),
      marks: [
        {
          id: "m-138-1",
          x: 61,
          y: 62,
          kind: "褪色",
          area: "右下蓝地 8×5cm",
          threadColor: "#1e3a8a",
          threadColorName: "靛蓝",
          threadLength: 4,
          instructions: "靛蓝补线先在边角试色，比对无误再整片施染。",
          status: "open",
          createdAt: Date.parse("2026-09-03T09:00:00Z"),
          records: [
            {
              id: "r-138-1-b",
              stage: "before",
              date: "2026-09-03",
              note: "蓝地局部泛红光，疑为日晒褪色，需配靛蓝色卡。",
            },
          ],
        },
      ],
    },
  ];
}
