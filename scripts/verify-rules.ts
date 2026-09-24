import { seedLedger, createMarker, Ledger, Carpet } from "../src/model";
import {
  addMarker,
  archiveCarpet,
  checkArchivable,
  checkMarker,
  filterCarpets,
  materialUsage,
  summarize,
  transitionMarker,
  carpetProgress,
} from "../src/rules";

let pass = 0;
let fail = 0;
function assert(cond: boolean, name: string) {
  if (cond) {
    pass++;
    console.log("✓", name);
  } else {
    fail++;
    console.error("✗", name);
  }
}

// 1. 种子：CAR-117 两标记齐签 → 可归档；CAR-092 有一个待修 → 不可归档
const seed = seedLedger();
const c117 = seed.carpets.find((c) => c.code === "CAR-117")!;
const c092 = seed.carpets.find((c) => c.code === "CAR-092")!;
const c138 = seed.carpets.find((c) => c.code === "CAR-138")!;
assert(checkArchivable(c117).ok, "全部签认的档案可归档");
assert(!checkArchivable(c092).ok, "含待修标记的档案不可归档");

// 2. 空档案不可归档
let ledger: Ledger = seedLedger();
const empty = addMarker(ledger, "carpet-117", 50, 50); // 先不在空档案上加
// 构造空档案：直接复制字段
const emptyCarpet: Carpet = { ...c117, id: "empty-test", code: "T-001", markers: [], archived: false };
ledger = { ...ledger, carpets: [...ledger.carpets, emptyCarpet] };
assert(!checkArchivable(emptyCarpet).ok, "没有标记的档案不可归档");

// 3. 新标记四要素缺失 → 不可签认
const fresh = createMarker(1, 50, 50, "2026-09-24");
assert(!checkMarker(fresh).ok, "空白新标记资料不齐");
const complete: typeof fresh = {
  ...fresh,
  colorId: "col-indigo",
  instructions: "按原结法补织",
  before: { date: "2026-09-01", text: "修复前" },
  after: { date: "2026-09-10", text: "修复后" },
};
assert(checkMarker(complete).ok, "四要素配齐可签认");

// 4. 签认资料不齐时 transition 不生效
let l2 = seedLedger();
const c092InL2 = l2.carpets.find((c) => c.code === "CAR-092")!;
const pendingId = c092InL2.markers[1].id;
const afterAttempt = transitionMarker(l2, c092InL2.id, pendingId, "signed");
const m2 = afterAttempt.carpets.find((c) => c.id === c092InL2.id)!.markers[1];
assert(m2.status === "pending", "资料不齐签认被拒绝");

// 5. 归档后重开单个标记：仅该标记变 working，其余已签保留；档案自动撤档
let l3 = seedLedger();
const c117InL3 = l3.carpets.find((c) => c.code === "CAR-117")!;
l3 = archiveCarpet(l3, c117InL3.id);
assert(l3.carpets.find((c) => c.id === c117InL3.id)!.archived, "CAR-117 归档成功");
l3 = transitionMarker(l3, c117InL3.id, c117InL3.markers[0].id, "working", "复检色差");
const reopened = l3.carpets.find((c) => c.id === c117InL3.id)!;
assert(!reopened.archived, "标记重开后档案自动撤回归档");
assert(reopened.markers[0].status === "working", "被重开的标记变为施工中");
assert(reopened.markers[1].status === "signed", "其余已签标记保留");
assert(reopened.markers[0].events.at(-1)?.kind === "reopen", "重开事件留痕");

// 6. 筛选产地：标记数、材料用量、进度同步
const persian = filterCarpets(seed.carpets, "波斯");
assert(persian.every((c) => c.origin === "波斯"), "产地筛选只留波斯");
const sAll = summarize(seed.carpets);
const sPersian = summarize(persian);
assert(sPersian.markerCount < sAll.markerCount, "筛选后标记数随之缩减");
assert(sPersian.markerCount === 2, "波斯档案共 2 处标记");
const uPersian = materialUsage(persian, seed.colors);
const uAll = materialUsage(seed.carpets, seed.colors);
assert(uAll.reduce((a, u) => a + u.markers, 0) > uPersian.reduce((a, u) => a + u.markers, 0), "材料用量随筛选同步更新");
const walnut = uPersian.find((u) => u.color.id === "col-walnut");
assert(!!walnut && Math.abs(walnut.meters - 3.5) < 0.001, "波斯核桃棕用量 3.5 米");

// 7. 种子 CAR-138：一个签认 + 一个重开 → 进度 50%，不可归档
assert(carpetProgress(c138) === 50, "CAR-138 进度 50%");
assert(!checkArchivable(c138).ok, "有重开标记的档案不可归档");

// 8. 完工率汇总
assert(sAll.signedCount === 4 && sAll.markerCount === 6, "全部档案 4 签 / 6 标记");
assert(sAll.completion === Math.round((4 / 6) * 100), "完工率按已签/全部计算");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
