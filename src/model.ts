/**
 * 纹样修复台账 —— 数据模型层
 * 纯前端、不接后台：全部档案保存在浏览器 localStorage。
 */

// ---------- 枚举与字典 ----------

export type MarkerStatus = "pending" | "working" | "signed";

/** 修复前 / 修复后记录 */
export interface RecordNote {
  date: string; // YYYY-MM-DD
  text: string;
  photo?: string; // 压缩后的 dataURL，本机留存
}

/** 标记状态轨迹事件 */
export interface StatusEvent {
  at: string;
  status: MarkerStatus;
  kind?: "reopen"; // working 且 kind=reopen 表示“重开补修”
  note?: string;
}

/** 纹样图上的一个破损标记 */
export interface DamageMarker {
  id: string;
  seq: number; // 图上编号，登记后不重排
  x: number; // 纹样图横向位置，0-100（百分比）
  y: number; // 纹样图纵向位置，0-100（百分比）
  part: string; // 部位
  damageType: string; // 破损类型
  severity: string; // 破损程度
  colorId: string | null; // 补线色 → 色卡引用
  threadMeters: number; // 补线用量（米）
  instructions: string; // 施工说明
  before: RecordNote | null; // 修复前记录
  after: RecordNote | null; // 修复后记录
  status: MarkerStatus;
  events: StatusEvent[];
}

/** 一块地毯的台账档案 */
export interface Carpet {
  id: string;
  code: string; // 档案编号，如 CAR-092
  origin: string; // 产地
  era: string; // 年代
  knotDensity: number; // 结密度数值
  knotUnit: string; // 结密度单位
  material: string; // 材质
  dyeing: string; // 染色方式
  pattern: string; // 纹样底图类型
  archived: boolean; // 是否已归档
  archivedAt?: string;
  markers: DamageMarker[];
  createdAt: string;
  updatedAt: string;
}

/** 材料色卡（工作室级共享） */
export interface ThreadColor {
  id: string;
  name: string;
  hex: string;
}

export interface Ledger {
  version: 1;
  carpets: Carpet[];
  colors: ThreadColor[];
}

export interface CarpetInput {
  code: string;
  origin: string;
  era: string;
  knotDensity: number;
  knotUnit: string;
  material: string;
  dyeing: string;
  pattern: string;
}

// ---------- 工厂 ----------

export function uid(prefix = ""): string {
  const head = prefix ? `${prefix}-` : "";
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return head + crypto.randomUUID();
  }
  return head + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createCarpet(input: CarpetInput, now: string): Carpet {
  return {
    id: uid("carpet"),
    code: input.code.trim(),
    origin: input.origin.trim(),
    era: input.era.trim(),
    knotDensity: input.knotDensity,
    knotUnit: input.knotUnit,
    material: input.material.trim(),
    dyeing: input.dyeing.trim(),
    pattern: input.pattern,
    archived: false,
    markers: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createMarker(seq: number, x: number, y: number, now: string): DamageMarker {
  return {
    id: uid("marker"),
    seq,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    part: "底地",
    damageType: "磨损",
    severity: "中度",
    colorId: null,
    threadMeters: 0,
    instructions: "",
    before: null,
    after: null,
    status: "pending",
    events: [{ at: now, status: "pending" }],
  };
}

export function createColor(name: string, hex: string): ThreadColor {
  return { id: uid("color"), name: name.trim(), hex };
}

export function nextCarpetCode(carpets: Carpet[]): string {
  const max = carpets.reduce((acc, c) => {
    const n = parseInt(c.code.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `CAR-${String(max + 1).padStart(3, "0")}`;
}

// ---------- localStorage 仓储（无后台） ----------

const STORAGE_KEY = "carpet-restoration-ledger:v1";

export function loadLedger(): Ledger {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Ledger;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.carpets)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("台账读取失败，改用示例数据", err);
  }
  return seedLedger();
}

export function saveLedger(ledger: Ledger): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
    return true;
  } catch (err) {
    console.warn("台账保存失败（可能是本机存储空间不足）", err);
    return false;
  }
}

export function resetLedger(): Ledger {
  const seed = seedLedger();
  saveLedger(seed);
  return seed;
}

// ---------- 示例档案 ----------

function marker(
  seq: number,
  x: number,
  y: number,
  init: Omit<DamageMarker, "id" | "seq" | "x" | "y">
): DamageMarker {
  return { id: uid("m"), seq, x, y, ...init };
}

export function seedLedger(): Ledger {
  const colors: ThreadColor[] = [
    { id: "col-indigo", name: "藏靛蓝", hex: "#233c5f" },
    { id: "col-madder", name: "茜草红", hex: "#9e3b33" },
    { id: "col-pomegranate", name: "石榴黄", hex: "#c7922f" },
    { id: "col-walnut", name: "核桃棕", hex: "#6f4a2c" },
    { id: "col-logwood", name: "苏木紫", hex: "#6d4a6b" },
    { id: "col-pine", name: "松叶绿", hex: "#4f6b42" },
    { id: "col-bone", name: "骨白", hex: "#e7dcc2" },
    { id: "col-ink", name: "玄青", hex: "#2c2823" },
  ];

  const carpets: Carpet[] = [
    {
      id: "carpet-092",
      code: "CAR-092",
      origin: "波斯",
      era: "约1960s",
      knotDensity: 28,
      knotUnit: "结/平方英寸",
      material: "羊毛绒头，棉经棉纬",
      dyeing: "植物染为主，局部化学染",
      pattern: "medallion",
      archived: false,
      markers: [
        marker(1, 19, 82, {
          part: "边缘毯基",
          damageType: "磨损",
          severity: "中度",
          colorId: "col-walnut",
          threadMeters: 3.5,
          instructions:
            "以做旧羊毛线沿原纬向双结补织，每英寸补 7 结；收口回纬三挑一压，边缘修齐后用湿海绵做旧，使色光与旧边一致。",
          before: {
            date: "2026-09-10",
            text: "左下角边缘毯基裸露约 6cm，绒头磨平，边绳有两根断纬，未见霉蛀。",
          },
          after: {
            date: "2026-09-18",
            text: "补织 42 结并回纬收口，修剪齐平；做旧后远看无明显接痕，拉力测试通过。",
          },
          status: "signed",
          events: [
            { at: "2026-09-08", status: "pending" },
            { at: "2026-09-10", status: "working" },
            { at: "2026-09-18", status: "signed" },
          ],
        }),
        marker(2, 50, 13, {
          part: "边框",
          damageType: "断经断纬",
          severity: "轻度",
          colorId: null,
          threadMeters: 0,
          instructions: "",
          before: null,
          after: null,
          status: "pending",
          events: [{ at: "2026-09-20", status: "pending" }],
        }),
      ],
      createdAt: "2026-09-08",
      updatedAt: "2026-09-20",
    },
    {
      id: "carpet-117",
      code: "CAR-117",
      origin: "安纳托利亚",
      era: "约1940s",
      knotDensity: 42,
      knotUnit: "结/平方英寸",
      material: "羊毛绒头，羊毛经",
      dyeing: "天然植物染",
      pattern: "prayer",
      archived: false,
      markers: [
        marker(1, 50, 47, {
          part: "龛形主纹",
          damageType: "缺口",
          severity: "重度",
          colorId: "col-madder",
          threadMeters: 6.2,
          instructions:
            "先以同径羊毛线接经四根、背布托底；按中心龛纹原纹样放样，土耳其结逐行补织 58 结，色线分三段由深到浅过渡；补完压绒三天再修剪。",
          before: {
            date: "2026-09-03",
            text: "龛形主纹下方缺口约 9×7cm，缺经 4 根、缺纬 11 行，周边绒头松脱。",
          },
          after: {
            date: "2026-09-11",
            text: "接经背布牢固，补织纹样与左右两侧连续；茜草红线经茶水褪色处理后色光吻合，已压绒修剪。",
          },
          status: "signed",
          events: [
            { at: "2026-09-02", status: "pending" },
            { at: "2026-09-03", status: "working" },
            { at: "2026-09-11", status: "signed" },
          ],
        }),
        marker(2, 81, 76, {
          part: "角隅",
          damageType: "褪色",
          severity: "轻度",
          colorId: "col-pomegranate",
          threadMeters: 2,
          instructions: "拆去褪色旧绒头 18 结，以石榴黄加核桃色调线补织，保留外侧原边做过渡。",
          before: {
            date: "2026-09-05",
            text: "右下角石榴黄纹样局部色光褪浅，约 4cm²，毯基完好。",
          },
          after: {
            date: "2026-09-12",
            text: "补织 18 结并做过渡晕色，干湿两态下与原色基本一致。",
          },
          status: "signed",
          events: [
            { at: "2026-09-04", status: "pending" },
            { at: "2026-09-05", status: "working" },
            { at: "2026-09-12", status: "signed" },
          ],
        }),
      ],
      createdAt: "2026-09-01",
      updatedAt: "2026-09-12",
    },
    {
      id: "carpet-138",
      code: "CAR-138",
      origin: "藏毯",
      era: "约1980s",
      knotDensity: 70,
      knotUnit: "道/英尺",
      material: "羊毛绒头，局部牦毛线",
      dyeing: "天然植物染",
      pattern: "tibetan",
      archived: false,
      markers: [
        marker(1, 30, 39, {
          part: "底地",
          damageType: "褪色",
          severity: "中度",
          colorId: "col-indigo",
          threadMeters: 4,
          instructions: "藏靛蓝线加一成玄青调色，随原渐变方向补织 46 结，边缘两结保留旧绒做晕色过渡。",
          before: {
            date: "2026-09-07",
            text: "左上部靛蓝底地成片色光变浅，约 12×8cm，绒头尚密实。",
          },
          after: {
            date: "2026-09-13",
            text: "补织区色光与周边一致，过渡自然，已签认保留。",
          },
          status: "signed",
          events: [
            { at: "2026-09-06", status: "pending" },
            { at: "2026-09-07", status: "working" },
            { at: "2026-09-13", status: "signed" },
          ],
        }),
        marker(2, 63, 62, {
          part: "中心纹样",
          damageType: "破洞",
          severity: "重度",
          colorId: "col-indigo",
          threadMeters: 5.5,
          instructions:
            "背布托底后按原方格纹补织；复检发现首批补线色光偏深，重开后改用藏靛七成对骨白三成的混线重新晕色。",
          before: {
            date: "2026-09-09",
            text: "中心偏下破洞约 6×5cm，伤及经纬各三根。",
          },
          after: {
            date: "2026-09-12",
            text: "初补完成，但复检在自然光下偏深一档，待重开调色。",
          },
          status: "working",
          events: [
            { at: "2026-09-08", status: "pending" },
            { at: "2026-09-09", status: "working" },
            { at: "2026-09-12", status: "signed" },
            {
              at: "2026-09-20",
              status: "working",
              kind: "reopen",
              note: "复检发现补区色光偏深，重开晕色补修；其余已签标记保留。",
            },
          ],
        }),
      ],
      createdAt: "2026-09-05",
      updatedAt: "2026-09-20",
    },
  ];

  return { version: 1, carpets, colors };
}
