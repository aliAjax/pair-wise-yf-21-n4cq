/**
 * 页面层（pages.tsx）
 * ------------------------------------------------------------
 * 所有可见组件都在这里；只负责渲染和派发用户操作，
 * 数据结构认 model.ts，能不能签 / 能不能归档认 rules.ts。
 */

import { useMemo, useRef, useState } from "react";
import type { Carpet, CarpetDraft, DamageMark, RepairRecord } from "./model";
import {
  DAMAGE_KINDS,
  DYEINGS,
  MATERIALS,
  ORIGINS,
  readImage,
  today,
} from "./model";
import {
  archiveBlockReason,
  canArchive,
  carpetProgress,
  exportCsv,
  ledgerStats,
  markMissing,
  summarizeMaterials,
  type MaterialUse,
} from "./rules";

/* ------------------------------ 通用小组件 ------------------------------ */

function Badge({
  tone,
  children,
}: {
  tone: "red" | "green" | "amber" | "slate";
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress" title={`进度 ${Math.round(value * 100)}%`}>
      <i style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputCls = "ctrl";

/* ------------------------------ 页头 / 指标 ------------------------------ */

export function Header({ saveError }: { saveError: string | null }) {
  return (
    <header className="hero">
      <p>手工地毯修复工作室 · 纹样修复台账</p>
      <h1>纹样修复台账</h1>
      <span>
        每块地毯登记产地、年代、结密度、材质与染色方式；在纹样图上逐个标记破损，
        配齐补线色、施工说明和修复前后记录，标记齐签后方可归档。
        单个标记可重开补修，其余已签标记保留。资料仅存本机浏览器。
      </span>
      {saveError && <div className="save-error">⚠ {saveError}</div>}
    </header>
  );
}

export function MetricsBar({ carpets }: { carpets: Carpet[] }) {
  const stats = ledgerStats(carpets);
  const items = [
    { label: "待修复标记", value: stats.open },
    { label: "纹样档案", value: stats.total },
    { label: "色卡数量", value: stats.materials },
    { label: "完工率", value: `${stats.completion}%` },
  ];
  return (
    <section className="metrics">
      {items.map((item) => (
        <article key={item.label}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}

/* ------------------------------ 左侧：产地筛选 + 登记 + 档案列表 ------------------------------ */

interface SidebarProps {
  allCarpets: Carpet[];
  activeOrigin: string;
  selectedId: string | null;
  onSelectOrigin(origin: string): void;
  onSelectCarpet(id: string): void;
}

export function Sidebar({
  allCarpets,
  activeOrigin,
  selectedId,
  onSelectOrigin,
  onSelectCarpet,
}: SidebarProps) {
  const countOf = (origin: string) =>
    origin === "全部"
      ? allCarpets.length
      : allCarpets.filter((c) => c.origin === origin).length;

  return (
    <aside className="panel side">
      <h2>按产地筛选</h2>
      <div className="chips">
        {["全部", ...ORIGINS].map((origin) => (
          <button
            key={origin}
            className={activeOrigin === origin ? "chip active" : "chip"}
            onClick={() => onSelectOrigin(origin)}
          >
            {origin}
            <em>{countOf(origin)}</em>
          </button>
        ))}
      </div>

      <h2 className="side-sub">档案列表</h2>
      <div className="ledger-list">
        {allCarpets.length === 0 && (
          <p className="muted">该产地还没有台账，先在下方登记一块。</p>
        )}
        {allCarpets.map((carpet) => {
          const signed = carpet.marks.filter((m) => m.status === "signed")
            .length;
          return (
            <button
              key={carpet.id}
              className={
                selectedId === carpet.id
                  ? "ledger-item selected"
                  : "ledger-item"
              }
              onClick={() => onSelectCarpet(carpet.id)}
            >
              <div className="ledger-row">
                <b>{carpet.id}</b>
                {carpet.archived ? (
                  <Badge tone="green">已归档</Badge>
                ) : (
                  <Badge tone="amber">在修</Badge>
                )}
              </div>
              <p>
                {carpet.origin} · {carpet.era || "年代待考"} · {carpet.knotDensity}
                结/平方分米
              </p>
              <div className="ledger-row">
                <ProgressBar value={carpetProgress(carpet)} />
                <small>
                  {signed}/{carpet.marks.length} 签
                </small>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* ------------------------------ 新地毯登记 ------------------------------ */

export function CarpetForm({
  onCreate,
}: {
  onCreate(draft: CarpetDraft): void;
}) {
  const [origin, setOrigin] = useState<string>(ORIGINS[0]);
  const [era, setEra] = useState("");
  const [knotDensity, setKnotDensity] = useState<number>(40);
  const [material, setMaterial] = useState<string>(MATERIALS[0]);
  const [dyeing, setDyeing] = useState<string>(DYEINGS[0]);

  const submit = () => {
    onCreate({ origin, era: era.trim(), knotDensity, material, dyeing });
    setEra("");
    setKnotDensity(40);
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>专业字段</p>
          <h2>登记地毯</h2>
        </div>
        <button className="primary" onClick={submit}>
          登记入册
        </button>
      </div>
      <div className="field-grid">
        <Field label="地毯产地">
          <select
            className={inputCls}
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            {ORIGINS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="年代">
          <input
            className={inputCls}
            placeholder="如 约1960s / 清末"
            value={era}
            onChange={(e) => setEra(e.target.value)}
          />
        </Field>
        <Field label="结密度（结 / 平方分米）">
          <input
            className={inputCls}
            type="number"
            min={1}
            value={knotDensity}
            onChange={(e) => setKnotDensity(Number(e.target.value))}
          />
        </Field>
        <Field label="材质">
          <select
            className={inputCls}
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          >
            {MATERIALS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="染色方式">
          <select
            className={inputCls}
            value={dyeing}
            onChange={(e) => setDyeing(e.target.value)}
          >
            {DYEINGS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}

/* ------------------------------ 档案元信息编辑 ------------------------------ */

function MetaEditor({
  carpet,
  readonly: locked,
  onPatch,
}: {
  carpet: Carpet;
  readonly: boolean;
  onPatch(patch: Partial<Carpet>): void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickImage = async (file?: File) => {
    if (!file) return;
    const dataUrl = await readImage(file);
    onPatch({ patternImage: dataUrl });
  };

  return (
    <div className="meta-grid">
      <Field label="产地">
        <select
          className={inputCls}
          disabled={locked}
          value={carpet.origin}
          onChange={(e) => onPatch({ origin: e.target.value })}
        >
          {ORIGINS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
      <Field label="年代">
        <input
          className={inputCls}
          disabled={locked}
          value={carpet.era}
          onChange={(e) => onPatch({ era: e.target.value })}
        />
      </Field>
      <Field label="结密度（结 / 平方分米）">
        <input
          className={inputCls}
          type="number"
          min={1}
          disabled={locked}
          value={carpet.knotDensity}
          onChange={(e) => onPatch({ knotDensity: Number(e.target.value) })}
        />
      </Field>
      <Field label="材质">
        <select
          className={inputCls}
          disabled={locked}
          value={carpet.material}
          onChange={(e) => onPatch({ material: e.target.value })}
        >
          {MATERIALS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label="染色方式">
        <select
          className={inputCls}
          disabled={locked}
          value={carpet.dyeing}
          onChange={(e) => onPatch({ dyeing: e.target.value })}
        >
          {DYEINGS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </Field>
      <Field label="纹样图">
        <div className="file-row">
          <button
            type="button"
            className="ghost"
            disabled={locked}
            onClick={() => fileRef.current?.click()}
          >
            {carpet.patternImage ? "更换纹样图" : "上传纹样图"}
          </button>
          {carpet.patternImage && !locked && (
            <button
              type="button"
              className="ghost danger-text"
              onClick={() => onPatch({ patternImage: undefined })}
            >
              移除
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPickImage(e.target.files?.[0])}
          />
        </div>
      </Field>
    </div>
  );
}

/* ------------------------------ 内置纹样底图（没传图时用） ------------------------------ */

function PatternArt() {
  return (
    <svg className="pattern-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <radialGradient id="rugfield" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#8a3a1e" />
          <stop offset="100%" stopColor="#5f2410" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#rugfield)" />
      {/* 多层边框 */}
      <rect x="2" y="2" width="96" height="96" fill="none" stroke="#d8b36a" strokeWidth="1.4" />
      <rect x="6" y="6" width="88" height="88" fill="none" stroke="#1f6f68" strokeWidth="2" />
      <rect x="10" y="10" width="80" height="80" fill="none" stroke="#e7c985" strokeWidth="0.8" strokeDasharray="2 2" />
      {/* 四角云头 */}
      {[
        [14, 14, 0],
        [86, 14, 90],
        [86, 86, 180],
        [14, 86, 270],
      ].map(([cx, cy, rot], i) => (
        <g key={i} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
          <path d="M0 0 C 8 -2 12 4 8 10 C 4 6 -2 6 0 0 Z" fill="#0f766e" opacity="0.85" />
          <circle r="1.4" fill="#e7c985" />
        </g>
      ))}
      {/* 中心葵纹 */}
      <g>
        <ellipse cx="50" cy="50" rx="17" ry="22" fill="#7c2d12" stroke="#e7c985" strokeWidth="0.8" />
        <ellipse cx="50" cy="50" rx="10" ry="14" fill="#0f766e" opacity="0.9" />
        <ellipse cx="50" cy="50" rx="4" ry="7" fill="#d8b36a" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <ellipse
            key={a}
            cx="50"
            cy="32"
            rx="2.6"
            ry="5"
            fill="#b45309"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
      </g>
      {/* 左右缠枝 */}
      {[28, 72].map((cx) => (
        <g key={cx} stroke="#d8b36a" strokeWidth="0.7" fill="none" opacity="0.8">
          <path d={`M${cx} 22 C ${cx - 8} 34 ${cx + 8} 44 ${cx} 56 C ${cx - 8} 66 ${cx + 8} 76 ${cx} 80`} />
          <circle cx={cx} cy="32" r="1.6" fill="#0f766e" stroke="none" />
          <circle cx={cx} cy="66" r="1.6" fill="#0f766e" stroke="none" />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------ 纹样标记图 ------------------------------ */

interface PatternBoardProps {
  carpet: Carpet;
  selectedMarkId: string | null;
  readonly: boolean;
  onAddMark(x: number, y: number): void;
  onSelectMark(id: string | null): void;
}

function PatternBoard({
  carpet,
  selectedMarkId,
  readonly: locked,
  onAddMark,
  onSelectMark,
}: PatternBoardProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onAddMark(
      Math.min(98, Math.max(2, Number(x.toFixed(1)))),
      Math.min(98, Math.max(2, Number(y.toFixed(1))))
    );
  };

  return (
    <div className="board-wrap">
      <div
        className={`board${locked ? "" : " board-addable"}`}
        onClick={handleClick}
        role="img"
        aria-label="纹样标记图"
      >
        {carpet.patternImage ? (
          <img className="board-img" src={carpet.patternImage} alt="地毯纹样" />
        ) : (
          <PatternArt />
        )}
        {carpet.marks.map((mark, i) => (
          <button
            key={mark.id}
            className={
              mark.id === selectedMarkId
                ? "pin pin-selected"
                : mark.status === "signed"
                ? "pin pin-signed"
                : "pin"
            }
            style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
            title={`${i + 1}. ${mark.kind} · ${mark.area || "待填位置"}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectMark(mark.id === selectedMarkId ? null : mark.id);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="board-hint">
        {locked
          ? "档案已归档：标记只读，撤回归档后才能重开补修。"
          : "在纹样空白处点击即可逐个标记破损；点标记编辑，点空白处放新标记。"}
      </p>
      <ul className="legend">
        <li><i className="dot dot-open" />待补修</li>
        <li><i className="dot dot-signed" />已签收</li>
        <li><i className="dot dot-selected" />当前选中</li>
      </ul>
    </div>
  );
}

/* ------------------------------ 修复前后记录编辑 ------------------------------ */

function RecordCard({
  record,
  readonly: locked,
  onChange,
  onRemove,
}: {
  record: RepairRecord;
  readonly: boolean;
  onChange(patch: Partial<Omit<RepairRecord, "id">>): void;
  onRemove(): void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const isBefore = record.stage === "before";
  return (
    <article className={`record-card ${isBefore ? "rec-before" : "rec-after"}`}>
      <div className="record-head">
        <Badge tone={isBefore ? "red" : "green"}>
          {isBefore ? "修复前" : "修复后"}
        </Badge>
        <input
          type="date"
          className="ctrl date"
          disabled={locked}
          value={record.date}
          onChange={(e) => onChange({ date: e.target.value })}
        />
        {!locked && (
          <button className="link danger-text" onClick={onRemove}>
            删除
          </button>
        )}
      </div>
      <textarea
        className="ctrl"
        rows={2}
        disabled={locked}
        placeholder={isBefore ? "记录破损现状：范围、程度、底经情况…" : "记录补修结果：针法、配色、强度复核…"}
        value={record.note}
        onChange={(e) => onChange({ note: e.target.value })}
      />
      <div className="photo-row">
        {record.photo ? (
          <img className="thumb" src={record.photo} alt="修复记录照片" />
        ) : null}
        <button
          type="button"
          className="ghost"
          disabled={locked}
          onClick={() => photoRef.current?.click()}
        >
          {record.photo ? "更换照片" : "附照片"}
        </button>
        {record.photo && !locked && (
          <button
            type="button"
            className="ghost danger-text"
            onClick={() => onChange({ photo: undefined })}
          >
            移除照片
          </button>
        )}
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onChange({ photo: await readImage(f, 900) });
            e.target.value = "";
          }}
        />
      </div>
    </article>
  );
}

/* ------------------------------ 标记检查器（补线色/施工说明/记录） ------------------------------ */

interface MarkInspectorProps {
  mark: DamageMark;
  index: number;
  readonly: boolean;
  onChange(patch: Partial<DamageMark>): void;
  onSign(): void;
  onReopen(): void;
  onDelete(): void;
  onAddRecord(stage: RepairRecord["stage"]): void;
  onChangeRecord(recordId: string, patch: Partial<Omit<RepairRecord, "id">>): void;
  onRemoveRecord(recordId: string): void;
}

function MarkInspector({
  mark,
  index,
  readonly: locked,
  onChange,
  onSign,
  onReopen,
  onDelete,
  onAddRecord,
  onChangeRecord,
  onRemoveRecord,
}: MarkInspectorProps) {
  const missing = markMissing(mark);
  const ready = missing.length === 0;

  const beforeRecs = mark.records.filter((r) => r.stage === "before");
  const afterRecs = mark.records.filter((r) => r.stage === "after");

  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <p className="eyebrow">破损标记 {index + 1}</p>
          {mark.status === "signed" ? (
            <Badge tone="green">已签收 · 资料封存</Badge>
          ) : (
            <Badge tone="red">待补修</Badge>
          )}
        </div>
        {!locked && mark.status === "open" && (
          <button className="link danger-text" onClick={onDelete}>
            删除标记
          </button>
        )}
      </div>

      <div className="field-grid tight">
        <Field label="破损类型">
          <select
            className={inputCls}
            disabled={locked}
            value={mark.kind}
            onChange={(e) => onChange({ kind: e.target.value })}
          >
            {DAMAGE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="位置 / 尺寸">
          <input
            className={inputCls}
            disabled={locked}
            placeholder="如 左缘 12×4cm"
            value={mark.area}
            onChange={(e) => onChange({ area: e.target.value })}
          />
        </Field>
        <Field label="补线色">
          <div className="color-row">
            <input
              type="color"
              className="color-well"
              disabled={locked}
              value={mark.threadColor}
              onChange={(e) => onChange({ threadColor: e.target.value })}
            />
            <input
              className={inputCls}
              disabled={locked}
              placeholder="色名 / 色号"
              value={mark.threadColorName}
              onChange={(e) => onChange({ threadColorName: e.target.value })}
            />
          </div>
        </Field>
        <Field label="补线用量（米）">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="0.1"
            disabled={locked}
            value={mark.threadLength}
            onChange={(e) => onChange({ threadLength: Number(e.target.value) })}
          />
        </Field>
      </div>

      <Field label="施工说明">
        <textarea
          className={inputCls}
          rows={3}
          disabled={locked}
          placeholder="针法、起针位置、回温修剪、强度复核要求…"
          value={mark.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
        />
      </Field>

      <div className="records-block">
        <div className="records-col">
          <p className="eyebrow">修复前记录</p>
          {beforeRecs.map((r) => (
            <RecordCard
              key={r.id}
              record={r}
              readonly={locked}
              onChange={(patch) => onChangeRecord(r.id, patch)}
              onRemove={() => onRemoveRecord(r.id)}
            />
          ))}
          {!locked && (
            <button className="ghost wide" onClick={() => onAddRecord("before")}>
              + 添加修复前记录
            </button>
          )}
        </div>
        <div className="records-col">
          <p className="eyebrow">修复后记录</p>
          {afterRecs.map((r) => (
            <RecordCard
              key={r.id}
              record={r}
              readonly={locked}
              onChange={(patch) => onChangeRecord(r.id, patch)}
              onRemove={() => onRemoveRecord(r.id)}
            />
          ))}
          {!locked && (
            <button className="ghost wide" onClick={() => onAddRecord("after")}>
              + 添加修复后记录
            </button>
          )}
        </div>
      </div>

      {mark.status === "open" && (
        <div className="sign-box">
          {ready ? (
            <p className="check-ok">✓ 补线色、施工说明与前后记录齐全，可以签收。</p>
          ) : (
            <div className="check-list">
              <p>签收前还缺：</p>
              <ul>
                {missing.map((m) => (
                  <li key={m}>□ {m}</li>
                ))}
              </ul>
            </div>
          )}
          <button className="primary" disabled={!ready} onClick={onSign}>
            签收标记
          </button>
        </div>
      )}
      {mark.status === "signed" && !locked && (
        <div className="sign-box">
          <p className="muted">
            重开本标记补修不会影响其他已签标记；重开后须重新签收。
          </p>
          <button className="ghost" onClick={onReopen}>
            ↺ 重开本标记补修
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ 地毯详情（归档条 + 元信息 + 图 + 检查器） ------------------------------ */

interface DetailProps {
  carpet: Carpet;
  selectedMarkId: string | null;
  onSelectMark(id: string | null): void;
  onAddMark(x: number, y: number): void;
  onPatchMark(markId: string, patch: Partial<DamageMark>): void;
  onSignMark(markId: string): void;
  onReopenMark(markId: string): void;
  onDeleteMark(markId: string): void;
  onAddRecord(markId: string, stage: RepairRecord["stage"]): void;
  onChangeRecord(
    markId: string,
    recordId: string,
    patch: Partial<Omit<RepairRecord, "id">>
  ): void;
  onRemoveRecord(markId: string, recordId: string): void;
  onPatchCarpet(patch: Partial<Carpet>): void;
  onArchive(): void;
  onUnarchive(): void;
}

export function Detail(props: DetailProps) {
  const { carpet, selectedMarkId } = props;
  const locked = carpet.archived;
  const markIndex = carpet.marks.findIndex((m) => m.id === selectedMarkId);
  const mark = markIndex >= 0 ? carpet.marks[markIndex] : undefined;
  const reason = archiveBlockReason(carpet);

  return (
    <section className="panel detail">
      <div className="heading">
        <div>
          <p>{carpet.origin} · {carpet.material} · {carpet.dyeing}</p>
          <h2>
            {carpet.id}
            {locked && <Badge tone="green">已归档</Badge>}
          </h2>
        </div>
        <div className="progress-line">
          <ProgressBar value={carpetProgress(carpet)} />
          <small>
            {carpet.marks.filter((m) => m.status === "signed").length}/
            {carpet.marks.length} 标记已签
          </small>
        </div>
      </div>

      {locked ? (
        <div className="archive-bar locked">
          <span>🔒 该档案已归档，全部资料只读。</span>
          <button className="ghost" onClick={props.onUnarchive}>
            撤回归档（继续补修）
          </button>
        </div>
      ) : (
        <div className="archive-bar">
          <span>
            {canArchive(carpet)
              ? "全部标记已签收，可以归档封存。"
              : `标记齐了才可归档：${reason}`}
          </span>
          <button className="primary" disabled={!canArchive(carpet)} onClick={props.onArchive}>
            归档
          </button>
        </div>
      )}

      <MetaEditor carpet={carpet} readonly={locked} onPatch={props.onPatchCarpet} />

      <div className="detail-grid">
        <PatternBoard
          carpet={carpet}
          selectedMarkId={selectedMarkId}
          readonly={locked}
          onAddMark={props.onAddMark}
          onSelectMark={props.onSelectMark}
        />
        <div className="inspector-wrap">
          {mark ? (
            <MarkInspector
              key={mark.id}
              mark={mark}
              index={markIndex}
              readonly={locked}
              onChange={(patch) => props.onPatchMark(mark.id, patch)}
              onSign={() => props.onSignMark(mark.id)}
              onReopen={() => props.onReopenMark(mark.id)}
              onDelete={() => {
                props.onDeleteMark(mark.id);
              }}
              onAddRecord={(stage) => props.onAddRecord(mark.id, stage)}
              onChangeRecord={(recordId, patch) =>
                props.onChangeRecord(mark.id, recordId, patch)
              }
              onRemoveRecord={(recordId) => props.onRemoveRecord(mark.id, recordId)}
            />
          ) : (
            <div className="inspector-empty">
              <p className="eyebrow">破损作业单</p>
              <p>
                {carpet.marks.length === 0
                  ? "还没有破损标记。在左侧纹样图上点击破损位置，逐个登记。"
                  : "点选图上的标记编号，填写补线色、施工说明与修复前后记录。"}
              </p>
              <ol className="mark-index">
                {carpet.marks.map((m, i) => (
                  <li key={m.id}>
                    <button onClick={() => props.onSelectMark(m.id)}>
                      <i className={m.status === "signed" ? "idx signed" : "idx"}>
                        {i + 1}
                      </i>
                      {m.kind} · {m.area || "位置待填"}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ 材料用量（随产地筛选同步） ------------------------------ */

export function MaterialPanel({
  carpets,
  scope,
}: {
  carpets: Carpet[];
  scope: string;
}) {
  const uses: MaterialUse[] = useMemo(() => summarizeMaterials(carpets), [carpets]);
  const stats = ledgerStats(carpets);

  const download = () => {
    const blob = new Blob(["﻿" + exportCsv(carpets)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `纹样修复台账-${scope}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel materials">
      <div className="heading">
        <div>
          <p>当前口径：{scope}</p>
          <h2>材料用量与进度</h2>
        </div>
        <div className="head-actions">
          <span className="muted">
            {stats.marks} 个标记 · 待修 {stats.open} · 已归档 {stats.archived} ·
            补线合计 {stats.threadLength} 米
          </span>
          <button onClick={download} disabled={carpets.length === 0}>
            导出CSV
          </button>
        </div>
      </div>
      {uses.length === 0 ? (
        <p className="muted">还没有填写补线色与用量。</p>
      ) : (
        <table className="material-table">
          <thead>
            <tr>
              <th>补线色</th>
              <th>色名 / 色号</th>
              <th>用量（米）</th>
              <th>涉及标记</th>
            </tr>
          </thead>
          <tbody>
            {uses.map((u) => (
              <tr key={u.key}>
                <td>
                  <span className="swatch-row">
                    <i className="swatch" style={{ background: u.color }} />
                    <code>{u.color}</code>
                  </span>
                </td>
                <td>{u.colorName}</td>
                <td>{Math.round(u.length * 10) / 10}</td>
                <td>{u.marks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
