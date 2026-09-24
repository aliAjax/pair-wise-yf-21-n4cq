/**
 * 业务规则层（rules.ts）
 * ------------------------------------------------------------
 * 纯函数，不碰 React、不碰 DOM：
 *  - 标记齐了才可归档（归档前先校验，返回缺失项）
 *  - 某个标记重开补修时，其余已签标记保留
 *  - 材料用量、进度、指标全部随产地筛选同步
 */

import type { Carpet, DamageMark, RepairRecord } from "./model";
import { STAGES, uid } from "./model";

/* ------------------------------ 破损标记 ------------------------------ */

/** 标记可签收前的缺项清单；空数组 = 资料齐，可以签 */
export function markMissing(mark: DamageMark): string[] {
  const missing: string[] = [];
  if (!mark.kind) missing.push("破损类型");
  if (!mark.area.trim()) missing.push("破损位置尺寸");
  if (!mark.threadColor.trim()) missing.push("补线色");
  if (!(Number(mark.threadLength) > 0)) missing.push("补线用量");
  if (!mark.instructions.trim()) missing.push("施工说明");
  if (!mark.records.some((r) => r.stage === "before")) missing.push("修复前记录");
  if (!mark.records.some((r) => r.stage === "after")) missing.push("修复后记录");
  return missing;
}

export function markReady(mark: DamageMark): boolean {
  return markMissing(mark).length === 0;
}

/**
 * 签收：资料齐全才允许，不直接改入参，返回新标记。
 * 已签标记保持不变（重开其他标记时它们原样保留）。
 */
export function signMark(mark: DamageMark): DamageMark {
  if (!markReady(mark) || mark.status === "signed") return mark;
  return { ...mark, status: "signed", signedAt: Date.now() };
}

/** 重开补修：只回退这一个标记，其余已签标记不动 */
export function reopenMark(mark: DamageMark): DamageMark {
  if (mark.status === "open") return mark;
  return { ...mark, status: "open", signedAt: undefined };
}

export function addRecord(mark: DamageMark, record: RepairRecord): DamageMark {
  return { ...mark, records: [...mark.records, record] };
}

export function updateRecord(
  mark: DamageMark,
  recordId: string,
  patch: Partial<Omit<RepairRecord, "id">>
): DamageMark {
  return {
    ...mark,
    records: mark.records.map((r) =>
      r.id === recordId ? { ...r, ...patch } : r
    ),
  };
}

export function removeRecord(mark: DamageMark, recordId: string): DamageMark {
  return { ...mark, records: mark.records.filter((r) => r.id !== recordId) };
}

export function makeRecord(stage: RepairRecord["stage"], date: string): RepairRecord {
  const label = STAGES.find((s) => s.value === stage)?.label ?? "";
  return { id: uid(), stage, date, note: "" };
}

/* ------------------------------ 单块地毯进度 / 归档 ------------------------------ */

/** 进度 = 已签标记数 / 标记总数；没有标记时为 0 */
export function carpetProgress(carpet: Carpet): number {
  if (carpet.marks.length === 0) return 0;
  return carpet.marks.filter((m) => m.status === "signed").length /
    carpet.marks.length;
}

/** 归档必须满足：至少一个标记，且标记全部签完。返回阻挡原因，空串代表可归档 */
export function archiveBlockReason(carpet: Carpet): string {
  if (carpet.marks.length === 0) return "还没有在纹样图上标记任何破损";
  const unsigned = carpet.marks.filter((m) => m.status !== "signed");
  if (unsigned.length > 0)
    return `还有 ${unsigned.length} 个标记未签（标记齐了才可归档）`;
  return "";
}

export function canArchive(carpet: Carpet): boolean {
  return archiveBlockReason(carpet) === "";
}

/* ------------------------------ 筛选与台账统计 ------------------------------ */

export function filterByOrigin(carpets: Carpet[], origin: string): Carpet[] {
  return origin === "全部"
    ? carpets
    : carpets.filter((c) => c.origin === origin);
}

/** 材料用量汇总：按“产地→色名（色值）”并线计量，随筛选结果同步 */
export interface MaterialUse {
  key: string;
  color: string;
  colorName: string;
  length: number;
  marks: number;
}

export function summarizeMaterials(carpets: Carpet[]): MaterialUse[] {
  const map = new Map<string, MaterialUse>();
  for (const carpet of carpets) {
    for (const mark of carpet.marks) {
      const name = mark.threadColorName.trim() || "未命名色";
      const key = `${mark.threadColor}|${name}`;
      const cur = map.get(key) ?? {
        key,
        color: mark.threadColor,
        colorName: name,
        length: 0,
        marks: 0,
      };
      cur.length += Number(mark.threadLength) || 0;
      cur.marks += 1;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.length - a.length);
}

export interface LedgerStats {
  total: number; // 台账地毯数
  marks: number; // 破损标记总数（已签+待修）
  open: number; // 待修复标记数
  archived: number; // 已归档数
  materials: number; // 色卡（材料色）数量
  completion: number; // 完工率 0~100
  threadLength: number; // 补线总用量（米）
}

/** 顶部指标：始终基于当前筛选口径计算，切产地时同步更新 */
export function ledgerStats(carpets: Carpet[]): LedgerStats {
  let marks = 0;
  let open = 0;
  let archived = 0;
  let threadLength = 0;
  for (const carpet of carpets) {
    if (carpet.archived) archived += 1;
    marks += carpet.marks.length;
    open += carpet.marks.filter((m) => m.status === "open").length;
    threadLength += carpet.marks.reduce(
      (sum, m) => sum + (Number(m.threadLength) || 0),
      0
    );
  }
  return {
    total: carpets.length,
    marks,
    open,
    archived,
    materials: summarizeMaterials(carpets).length,
    completion: marks === 0 ? 0 : Math.round(((marks - open) / marks) * 100),
    threadLength: Math.round(threadLength * 10) / 10,
  };
}

/* ------------------------------ 导出 ------------------------------ */

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 把当前筛选口径下的台账导成 CSV（标记逐行展开），不接后台直接下载 */
export function exportCsv(carpets: Carpet[]): string {
  const header = [
    "编号",
    "产地",
    "年代",
    "结密度(结/平方分米)",
    "材质",
    "染色方式",
    "状态",
    "破损序号",
    "破损类型",
    "位置尺寸",
    "补线色",
    "色名",
    "用量(米)",
    "标记状态",
    "施工说明",
  ];
  const rows: string[] = [header.map(csvCell).join(",")];
  for (const carpet of carpets) {
    const base = [
      carpet.id,
      carpet.origin,
      carpet.era,
      carpet.knotDensity,
      carpet.material,
      carpet.dyeing,
      carpet.archived ? "已归档" : "在修",
    ];
    if (carpet.marks.length === 0) {
      rows.push(
        [...base, "", "", "", "", "", "", "", ""].map(csvCell).join(",")
      );
    }
    carpet.marks.forEach((mark, i) => {
      rows.push(
        [
          ...base,
          i + 1,
          mark.kind,
          mark.area,
          mark.threadColor,
          mark.threadColorName,
          mark.threadLength,
          mark.status === "signed" ? "已签" : "待补修",
          mark.instructions,
        ]
          .map(csvCell)
          .join(",")
      );
    });
  }
  return rows.join("\n");
}
