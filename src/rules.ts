/**
 * 纹样修复台账 —— 业务规则层（纯函数，无 UI、无存储副作用）
 *
 * 核心规则：
 * 1. 地毯档案需登记产地、年代、结密度、材质、染色方式。
 * 2. 每个破损标记必须逐项配齐“补线色、施工说明、修复前记录、修复后记录”，才可签认。
 * 3. 标记齐了（至少一个破损标记且全部签认）地毯才可归档。
 * 4. 某个标记重开补修时，只动这一个标记；其余已签标记保留，并自动解除地毯归档态。
 * 5. 按产地筛选时，标记数、材料用量、进度都在筛选后的档案范围内汇总。
 */

import {
  Carpet,
  CarpetInput,
  DamageMarker,
  Ledger,
  MarkerStatus,
  RecordNote,
  StatusEvent,
  ThreadColor,
  createCarpet,
  createColor,
  createMarker,
  nextCarpetCode,
  today,
  uid,
} from "./model";

// ---------- 字典 ----------

export const ORIGINS = ["波斯", "安纳托利亚", "高加索", "藏毯"];
export const MATERIAL_PRESETS = ["羊毛", "羊毛绒头，棉经棉纬", "羊毛绒头，羊毛经", "羊毛绒头，局部牦毛线", "丝"];
export const DYEING_PRESETS = ["天然植物染", "植物染为主，局部化学染", "天然矿物染", "化学染"];
export const KNOT_UNITS = ["结/平方英寸", "道/英尺", "结/平方厘米"];
export const PATTERNS = [
  { value: "medallion", label: "中心徽章纹（波斯）" },
  { value: "prayer", label: "龛形祈祷纹（安纳托利亚）" },
  { value: "geometric", label: "几何部落纹（高加索）" },
  { value: "tibetan", label: "方格禅纹（藏毯）" },
];
export const PARTS = ["中心纹样", "底地", "边框", "角隅", "边缘毯基"];
export const DAMAGE_TYPES = ["磨损", "破洞", "缺口", "褪色", "断经断纬", "虫蛀"];
export const SEVERITIES = ["轻度", "中度", "重度"];

export const STATUS_LABEL: Record<MarkerStatus, string> = {
  pending: "待修复",
  working: "施工中",
  signed: "已签认",
};

// ---------- 标记签认校验：四要素齐了才可签 ----------

export interface MarkerCheck {
  ok: boolean;
  missing: string[];
}

export function checkMarker(marker: DamageMarker): MarkerCheck {
  const missing: string[] = [];
  if (!marker.colorId) missing.push("补线色");
  if (!marker.instructions.trim()) missing.push("施工说明");
  if (!hasNote(marker.before)) missing.push("修复前记录");
  if (!hasNote(marker.after)) missing.push("修复后记录");
  return { ok: missing.length === 0, missing };
}

function hasNote(note: RecordNote | null): boolean {
  return !!note && note.text.trim().length > 0 && note.date.length > 0;
}

// ---------- 归档校验：标记齐了才可归档 ----------

export interface ArchiveCheck {
  ok: boolean;
  reasons: string[];
}

export function checkArchivable(carpet: Carpet): ArchiveCheck {
  const reasons: string[] = [];
  if (carpet.markers.length === 0) reasons.push("尚未在纹样图上标记任何破损");
  const unsigned = carpet.markers.filter((m) => m.status !== "signed");
  if (unsigned.length > 0) {
    reasons.push(`还有 ${unsigned.length} 个标记未签认（${unsigned.map((m) => "#" + m.seq).join("、")}）`);
  }
  // 兜底：即使状态异常，四要素缺失也不允许归档
  const incomplete = carpet.markers.filter((m) => !checkMarker(m).ok);
  if (incomplete.length > 0) {
    reasons.push(`标记 ${incomplete.map((m) => "#" + m.seq).join("、")} 资料未配齐`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ---------- 档案登记校验 ----------

export function checkCarpetInput(input: CarpetInput): string[] {
  const errors: string[] = [];
  if (!input.code.trim()) errors.push("档案编号");
  if (!input.origin.trim()) errors.push("产地");
  if (!input.era.trim()) errors.push("年代");
  if (!Number.isFinite(input.knotDensity) || input.knotDensity <= 0) errors.push("结密度");
  if (!input.material.trim()) errors.push("材质");
  if (!input.dyeing.trim()) errors.push("染色方式");
  return errors;
}

// ---------- 进度 ----------

export function carpetProgress(carpet: Carpet): number {
  if (carpet.markers.length === 0) return 0;
  const done = carpet.markers.filter((m) => m.status === "signed").length;
  return Math.round((done / carpet.markers.length) * 100);
}

/** 标记在当前状态下可执行的流转动作 */
export function markerActions(status: MarkerStatus): Array<{
  to: MarkerStatus;
  label: string;
  primary?: boolean;
  requireComplete?: boolean;
}> {
  switch (status) {
    case "pending":
      return [{ to: "working", label: "开工", primary: true }];
    case "working":
      return [{ to: "signed", label: "签认", primary: true, requireComplete: true }];
    case "signed":
      return [{ to: "working", label: "重开补修", primary: true }];
  }
}

// ---------- 台账变更（返回新台账，不改原对象） ----------

export function addCarpet(ledger: Ledger, input: CarpetInput): Ledger {
  const carpet = createCarpet(input, today());
  return { ...ledger, carpets: [carpet, ...ledger.carpets] };
}

export function updateCarpet(
  ledger: Ledger,
  carpetId: string,
  patch: Partial<Omit<Carpet, "id" | "markers" | "createdAt">>
): Ledger {
  return {
    ...ledger,
    carpets: ledger.carpets.map((c) =>
      c.id === carpetId && !c.archived ? { ...c, ...patch, updatedAt: today() } : c
    ),
  };
}

export function deleteCarpet(ledger: Ledger, carpetId: string): Ledger {
  return { ...ledger, carpets: ledger.carpets.filter((c) => c.id !== carpetId) };
}

export function archiveCarpet(ledger: Ledger, carpetId: string): Ledger {
  return {
    ...ledger,
    carpets: ledger.carpets.map((c) => {
      if (c.id !== carpetId) return c;
      const check = checkArchivable(c);
      if (!check.ok) return c;
      return { ...c, archived: true, archivedAt: today(), updatedAt: today() };
    }),
  };
}

export function addMarker(
  ledger: Ledger,
  carpetId: string,
  x: number,
  y: number
): { ledger: Ledger; marker: DamageMarker | null } {
  let created: DamageMarker | null = null;
  const carpets = ledger.carpets.map((c) => {
    if (c.id !== carpetId || c.archived) return c;
    const seq = c.markers.reduce((max, m) => Math.max(max, m.seq), 0) + 1;
    created = createMarker(seq, x, y, today());
    return { ...c, markers: [...c.markers, created], updatedAt: today() };
  });
  return { ledger: { ...ledger, carpets }, marker: created };
}

export function updateMarker(
  ledger: Ledger,
  carpetId: string,
  markerId: string,
  patch: Partial<Omit<DamageMarker, "id" | "seq" | "events">>
): Ledger {
  return mapMarker(ledger, carpetId, markerId, (m, carpet) =>
    carpet.archived ? m : { ...m, ...patch }
  );
}

export function deleteMarker(ledger: Ledger, carpetId: string, markerId: string): Ledger {
  return {
    ...ledger,
    carpets: ledger.carpets.map((c) => {
      if (c.id !== carpetId || c.archived) return c;
      return { ...c, markers: c.markers.filter((m) => m.id !== markerId), updatedAt: today() };
    }),
  };
}

/** 标记状态流转：开工 / 签认 / 重开补修 */
export function transitionMarker(
  ledger: Ledger,
  carpetId: string,
  markerId: string,
  to: MarkerStatus,
  reopenNote?: string
): Ledger {
  return {
    ...ledger,
    carpets: ledger.carpets.map((c) => {
      if (c.id !== carpetId) return c;
      const markers = c.markers.map((m) => {
        if (m.id !== markerId) return m; // 其余标记原样保留（含已签标记）
        if (to === "signed" && !checkMarker(m).ok) return m; // 资料不齐不能签认
        const event: StatusEvent = {
          at: today(),
          status: to,
          ...(to === "working" && m.status === "signed"
            ? { kind: "reopen" as const, note: reopenNote?.trim() || "复检重开补修" }
            : {}),
        };
        return { ...m, status: to, events: [...m.events, event] };
      });
      // 任一标记重开，则地毯不再满足归档条件，自动解除归档；其余标记签认状态不受影响
      const reopened = markers.some(
        (m, i) => m.id === markerId && to === "working" && c.markers[i]?.status === "signed"
      );
      return {
        ...c,
        markers,
        archived: reopened ? false : c.archived,
        archivedAt: reopened ? undefined : c.archivedAt,
        updatedAt: today(),
      };
    }),
  };
}

function mapMarker(
  ledger: Ledger,
  carpetId: string,
  markerId: string,
  fn: (m: DamageMarker, carpet: Carpet) => DamageMarker
): Ledger {
  return {
    ...ledger,
    carpets: ledger.carpets.map((c) =>
      c.id === carpetId
        ? { ...c, markers: c.markers.map((m) => (m.id === markerId ? fn(m, c) : m)), updatedAt: today() }
        : c
    ),
  };
}

// ---------- 色卡 ----------

export function addColor(ledger: Ledger, name: string, hex: string): Ledger {
  if (!name.trim() || !/^#[0-9a-fA-F]{6}$/.test(hex.trim())) return ledger;
  return { ...ledger, colors: [...ledger.colors, createColor(name, hex.trim())] };
}

export function colorOf(ledger: Ledger, id: string | null): ThreadColor | null {
  if (!id) return null;
  return ledger.colors.find((c) => c.id === id) ?? null;
}

// ---------- 筛选与汇总（按产地筛选时同步作用于标记、材料用量、进度） ----------

export function filterCarpets(carpets: Carpet[], origin: string | null): Carpet[] {
  if (!origin) return carpets;
  return carpets.filter((c) => c.origin === origin);
}

export interface MaterialUsage {
  color: ThreadColor;
  meters: number;
  markers: number;
}

/** 在给定档案集合内，按补线色汇总材料用量 */
export function materialUsage(carpets: Carpet[], colors: ThreadColor[]): MaterialUsage[] {
  const totals = new Map<string, { meters: number; markers: number }>();
  for (const carpet of carpets) {
    for (const m of carpet.markers) {
      if (!m.colorId || m.threadMeters <= 0) continue;
      const cur = totals.get(m.colorId) ?? { meters: 0, markers: 0 };
      cur.meters = Math.round((cur.meters + m.threadMeters) * 100) / 100;
      cur.markers += 1;
      totals.set(m.colorId, cur);
    }
  }
  return colors
    .map((color) => ({ color, ...(totals.get(color.id) ?? { meters: 0, markers: 0 }) }))
    .filter((u) => u.markers > 0)
    .sort((a, b) => b.meters - a.meters);
}

export interface LedgerSummary {
  carpetCount: number;
  markerCount: number;
  pendingCount: number; // 待修复标记
  workingCount: number;
  signedCount: number;
  archivedCount: number;
  completion: number; // 完工率 = 已签标记 / 全部标记
  totalThreadMeters: number;
}

export function summarize(carpets: Carpet[]): LedgerSummary {
  let markerCount = 0;
  let signedCount = 0;
  let pendingCount = 0;
  let workingCount = 0;
  let totalThreadMeters = 0;
  for (const c of carpets) {
    markerCount += c.markers.length;
    for (const m of c.markers) {
      if (m.status === "signed") signedCount += 1;
      if (m.status === "pending") pendingCount += 1;
      if (m.status === "working") workingCount += 1;
      if (m.threadMeters > 0) totalThreadMeters += m.threadMeters;
    }
  }
  return {
    carpetCount: carpets.length,
    markerCount,
    pendingCount,
    workingCount,
    signedCount,
    archivedCount: carpets.filter((c) => c.archived).length,
    completion: markerCount === 0 ? 0 : Math.round((signedCount / markerCount) * 100),
    totalThreadMeters: Math.round(totalThreadMeters * 100) / 100,
  };
}

export function originCounts(carpets: Carpet[]): Array<{ origin: string; count: number }> {
  const map = new Map<string, number>();
  for (const c of carpets) map.set(c.origin, (map.get(c.origin) ?? 0) + 1);
  return Array.from(map.entries())
    .map(([origin, count]) => ({ origin, count }))
    .sort((a, b) => b.count - a.count);
}

export function suggestCode(carpets: Carpet[]): string {
  return nextCarpetCode(carpets);
}

export { uid };
