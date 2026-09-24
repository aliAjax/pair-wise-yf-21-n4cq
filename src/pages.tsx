/**
 * 纹样修复台账 —— 页面层
 * 纯前端页面：本地状态即台账，每次变更自动写入 localStorage，关掉再打开资料还在。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import {
  Carpet,
  CarpetInput,
  DamageMarker,
  Ledger,
  RecordNote,
  ThreadColor,
  loadLedger,
  resetLedger,
  saveLedger,
  today,
} from "./model";
import {
  ArchiveCheck,
  DAMAGE_TYPES,
  DYEING_PRESETS,
  KNOT_UNITS,
  LedgerSummary,
  MATERIAL_PRESETS,
  MaterialUsage,
  MarkerCheck,
  ORIGINS,
  PARTS,
  PATTERNS,
  SEVERITIES,
  STATUS_LABEL,
  addCarpet,
  addColor,
  addMarker,
  archiveCarpet,
  checkArchivable,
  checkCarpetInput,
  checkMarker,
  colorOf,
  carpetProgress,
  deleteCarpet,
  deleteMarker,
  filterCarpets,
  markerActions,
  materialUsage,
  originCounts,
  suggestCode,
  summarize,
  transitionMarker,
  updateCarpet,
  updateMarker,
} from "./rules";

// ==================== 工具 ====================

function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "warn" } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return {
    msg,
    toast: (text: string, kind: "ok" | "warn" = "ok") => setMsg({ text, kind }),
  };
}

function StatusBadge({ status }: { status: DamageMarker["status"] }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** 选择图片并压缩为小尺寸 dataURL（全部留在本机） */
async function pickCompressedPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const max = 720;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function PhotoField({
  label,
  note,
  onChange,
}: {
  label: string;
  note: RecordNote | null;
  onChange: (note: RecordNote | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const value = note ?? { date: today(), text: "" };

  function update(patch: Partial<RecordNote>) {
    onChange({ ...value, ...patch });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const photo = await pickCompressedPhoto(file);
      update({ photo });
    } catch {
      update({});
    }
  }

  return (
    <div className="note-box">
      <div className="note-head">
        <b>{label}</b>
        <label className="photo-btn">
          {note?.photo ? "更换照片" : "添加照片"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFile}
          />
        </label>
      </div>
      <div className="note-row">
        <input
          type="date"
          value={value.date}
          onChange={(e) => update({ date: e.target.value })}
        />
      </div>
      <textarea
        rows={3}
        placeholder={`记录${label}：部位状况、工艺做法、验收结论……`}
        value={value.text}
        onChange={(e) => update({ text: e.target.value })}
      />
      {note?.photo && (
        <div className="photo-thumb">
          <img src={note.photo} alt={`${label}照片`} />
          <button type="button" onClick={() => update({ photo: undefined })}>
            移除照片
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== 纹样底图（程序化 SVG，按产地风格） ====================

const WEAVE_TINTS: Record<string, string> = {
  medallion: "#e9dcc0",
  prayer: "#e6dcc8",
  geometric: "#e3d9c3",
  tibetan: "#e7d8c4",
};

function PatternArt({ pattern }: { pattern: string }) {
  const fill = "#7c2d12";
  const fill2 = "#0f766e";
  const line = "#6f4a2c";
  return (
    <svg viewBox="0 0 100 62" preserveAspectRatio="none" aria-label="纹样底图">
      <rect x="0" y="0" width="100" height="62" fill={WEAVE_TINTS[pattern] ?? "#e9dcc0"} />
      {/* 外框与内框 */}
      <rect x="2.5" y="2.5" width="95" height="57" fill="none" stroke={line} strokeWidth="0.9" />
      <rect x="6" y="6" width="88" height="50" fill="none" stroke={line} strokeWidth="0.5" />
      {pattern === "medallion" && (
        <g stroke={line} strokeWidth="0.5" fill="none">
          <ellipse cx="50" cy="31" rx="17" ry="11" fill={fill} opacity="0.82" />
          <ellipse cx="50" cy="31" rx="10" ry="6" fill={fill2} opacity="0.85" />
          <circle cx="50" cy="31" r="2.4" fill="#c7922f" />
          <path d="M33 31 C26 22 14 22 12 10" />
          <path d="M67 31 C74 22 86 22 88 10" />
          <path d="M33 31 C26 40 14 40 12 52" />
          <path d="M67 31 C74 40 86 40 88 52" />
          <path d="M20 12 h12 M68 12 h12 M20 50 h12 M68 50 h12" strokeWidth="0.8" />
        </g>
      )}
      {pattern === "prayer" && (
        <g stroke={line} strokeWidth="0.5" fill="none">
          <path
            d="M22 50 L22 24 C22 16 38 9 50 9 C62 9 78 16 78 24 L78 50 Z"
            fill={fill}
            opacity="0.78"
          />
          <path d="M30 50 L30 25 C30 19 40 14 50 14 C60 14 70 19 70 25 L70 50" fill={fill2} opacity="0.8" />
          <path d="M50 14 v30 M38 20 l5 5 M62 20 l-5 5" stroke="#e7dcc2" strokeWidth="0.7" />
          {[14, 20, 26].map((y) => (
            <g key={y}>
              <circle cx="14" cy={y} r="1.6" fill={fill} stroke="none" />
              <circle cx="86" cy={y} r="1.6" fill={fill} stroke="none" />
            </g>
          ))}
        </g>
      )}
      {pattern === "geometric" && (
        <g stroke={line} strokeWidth="0.55" fill="none">
          {Array.from({ length: 4 }, (_, r) =>
            Array.from({ length: 6 }, (_, c) => {
              const x = 12 + c * 15.2;
              const y = 13 + r * 12;
              const even = (r + c) % 2 === 0;
              return (
                <polygon
                  key={`${r}-${c}`}
                  points={`${x},${y - 4} ${x + 4.4},${y} ${x},${y + 4} ${x - 4.4},${y}`}
                  fill={even ? fill : fill2}
                  opacity="0.8"
                />
              );
            })
          )}
          <path d="M8 8 H92 V54 H8 Z" strokeWidth="0.7" />
        </g>
      )}
      {pattern === "tibetan" && (
        <g stroke={line} strokeWidth="0.5" fill="none">
          {Array.from({ length: 3 }, (_, r) =>
            Array.from({ length: 4 }, (_, c) => (
              <rect
                key={`${r}-${c}`}
                x={12 + c * 20}
                y={10 + r * 14}
                width="16"
                height="11"
                rx="1.5"
                fill={(r + c) % 2 === 0 ? fill : fill2}
                opacity="0.78"
              />
            ))
          )}
          {[15.5, 35.5].map((y) =>
            [20, 40, 60, 80].map((x) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="#c7922f" stroke="none" />
            ))
          )}
        </g>
      )}
    </svg>
  );
}

// ==================== 纹样图标记板 ====================

function PatternBoard({
  carpet,
  colors,
  selectedId,
  onSelect,
  onAdd,
}: {
  carpet: Carpet;
  colors: ThreadColor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const color = (m: DamageMarker) => colors.find((c) => c.id === m.colorId) ?? null;

  function locate(e: ReactMouseEvent) {
    const box = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(97, Math.max(3, ((e.clientX - box.left) / box.width) * 100)),
      y: Math.min(94, Math.max(6, ((e.clientY - box.top) / box.height) * 100)),
    };
  }

  return (
    <div
      ref={ref}
      className={`board ${carpet.archived ? "is-locked" : ""}`}
      onMouseMove={(e) => !carpet.archived && setDraft(locate(e))}
      onMouseLeave={() => setDraft(null)}
      onClick={(e) => {
        if (carpet.archived) return;
        const p = locate(e);
        onAdd(p.x, p.y);
      }}
      role="img"
      aria-label="纹样局部标记图，点击空白处登记新破损"
    >
      <PatternArt pattern={carpet.pattern} />
      {/* 破损标记逐个落在纹样上 */}
      {carpet.markers.map((m) => {
        const c = color(m);
        return (
          <button
            key={m.id}
            type="button"
            className={`pin pin-${m.status} ${selectedId === m.id ? "pin-active" : ""}`}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            title={`#${m.seq} ${m.part} · ${m.damageType}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m.id);
            }}
          >
            <span>{m.seq}</span>
            {m.status === "signed" && <i className="tick">✓</i>}
            {m.events.some((ev) => ev.kind === "reopen") && <i className="reopen-dot" title="曾重开补修" />}
            {c && <b className="pin-color" style={{ background: c.hex }} />}
          </button>
        );
      })}
      {draft && (
        <span className="pin pin-draft" style={{ left: `${draft.x}%`, top: `${draft.y}%` }}>
          <span>+</span>
        </span>
      )}
      <p className="board-hint">
        {carpet.archived
          ? "本档案已归档，标记只读；如需补修请在标记上“重开补修”。"
          : "在纹样上点击空白处登记破损；点击已有编号可编辑签认。"}
      </p>
    </div>
  );
}

// ==================== 单标记检查器（补线色 / 施工说明 / 前后记录 / 状态流转） ====================

function MarkerInspector({
  carpet,
  marker,
  colors,
  onChange,
  onTransition,
  onDelete,
}: {
  carpet: Carpet;
  marker: DamageMarker;
  colors: ThreadColor[];
  onChange: (patch: Partial<DamageMarker>) => void;
  onTransition: (to: DamageMarker["status"], note?: string) => void;
  onDelete: () => void;
}) {
  const check: MarkerCheck = checkMarker(marker);
  const reopened = marker.events.some((ev) => ev.kind === "reopen");
  const locked = carpet.archived;

  return (
    <section className="panel inspector">
      <div className="heading">
        <div>
          <p>破损标记 #{marker.seq}</p>
          <h2 className="marker-title">
            {marker.part} · {marker.damageType} <StatusBadge status={marker.status} />
            {reopened && <span className="reopen-flag">曾重开补修</span>}
          </h2>
        </div>
        {!locked && (
          <button className="ghost danger" onClick={onDelete}>
            删除标记
          </button>
        )}
      </div>

      {locked && (
        <p className="lock-note">
          档案已归档，标记内容锁定。复检发现问题可点下方「重开补修」——仅本标记变为施工中，其余已签标记保留。
        </p>
      )}

      <div className="field-grid">
        <label>
          <span>部位</span>
          <select disabled={locked} value={marker.part} onChange={(e) => onChange({ part: e.target.value })}>
            {PARTS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span>破损类型</span>
          <select
            disabled={locked}
            value={marker.damageType}
            onChange={(e) => onChange({ damageType: e.target.value })}
          >
            {DAMAGE_TYPES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span>破损程度</span>
          <select
            disabled={locked}
            value={marker.severity}
            onChange={(e) => onChange({ severity: e.target.value })}
          >
            {SEVERITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span>补线用量（米）</span>
          <input
            type="number"
            min={0}
            step={0.1}
            disabled={locked}
            value={marker.threadMeters || ""}
            onChange={(e) => onChange({ threadMeters: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="full-field">
        <span>补线色（工作室色卡）</span>
        <div className="color-picker">
          {colors.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={locked}
              className={`swatch ${marker.colorId === c.id ? "swatch-on" : ""}`}
              style={{ "--sw": c.hex } as CSSProperties}
              title={c.name}
              onClick={() => onChange({ colorId: c.id })}
            >
              <i />
              <em>{c.name}</em>
            </button>
          ))}
        </div>
      </label>

      <label className="full-field">
        <span>施工说明（结法、用线、做旧、验收要求）</span>
        <textarea
          rows={3}
          disabled={locked}
          value={marker.instructions}
          placeholder="例：以做旧羊毛线沿原纬向双结补织，每英寸 7 结；回纬三挑一压，湿海绵做旧……"
          onChange={(e) => onChange({ instructions: e.target.value })}
        />
      </label>

      <div className="notes-grid">
        <PhotoField
          label="修复前记录"
          note={marker.before}
          onChange={(n) => onChange({ before: n })}
        />
        <PhotoField
          label="修复后记录"
          note={marker.after}
          onChange={(n) => onChange({ after: n })}
        />
      </div>

      <div className="sign-row">
        <div className={`check-list ${check.ok ? "ok" : ""}`}>
          {check.ok ? (
            <b>✓ 补线色、施工说明、修复前后记录齐备，可签认</b>
          ) : (
            <span>
              签认前还缺：<b>{check.missing.join("、")}</b>
            </span>
          )}
        </div>
        <div className="actions">
          {markerActions(marker.status).map((a) => (
            <button
              key={a.to}
              className={a.primary ? "primary" : "ghost"}
              onClick={() => {
                if (a.to === "working" && marker.status === "signed") {
                  const note = window.prompt("重开补修原因（其余已签标记保留）：", "复检发现需返工");
                  if (note === null) return;
                  onTransition(a.to, note);
                } else {
                  onTransition(a.to);
                }
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <details className="timeline">
        <summary>状态轨迹（{marker.events.length}）</summary>
        <ol>
          {[...marker.events].reverse().map((ev, i) => (
            <li key={i}>
              <time>{ev.at}</time>
              <span>
                {ev.kind === "reopen" ? "重开补修" : STATUS_LABEL[ev.status]}
                {ev.note ? <em> — {ev.note}</em> : null}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

// ==================== 档案登记表单字段 ====================

function CarpetFormFields({
  value,
  onChange,
  disabled,
}: {
  value: CarpetInput;
  onChange: (patch: Partial<CarpetInput>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field-grid">
      <label>
        <span>档案编号</span>
        <input value={value.code} disabled={disabled} onChange={(e) => onChange({ code: e.target.value })} />
      </label>
      <label>
        <span>产地</span>
        <select
          value={value.origin}
          disabled={disabled}
          onChange={(e) => onChange({ origin: e.target.value })}
        >
          <option value="">请选择产地</option>
          {ORIGINS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label>
        <span>年代</span>
        <input
          placeholder="如 约1960s"
          value={value.era}
          disabled={disabled}
          onChange={(e) => onChange({ era: e.target.value })}
        />
      </label>
      <label className="knot-field">
        <span>结密度</span>
        <div className="knot-input">
          <input
            type="number"
            min={0}
            value={value.knotDensity || ""}
            disabled={disabled}
            onChange={(e) => onChange({ knotDensity: Number(e.target.value) })}
          />
          <select
            value={value.knotUnit}
            disabled={disabled}
            onChange={(e) => onChange({ knotUnit: e.target.value })}
          >
            {KNOT_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
      </label>
      <label>
        <span>材质</span>
        <input
          list="material-presets"
          value={value.material}
          disabled={disabled}
          onChange={(e) => onChange({ material: e.target.value })}
        />
        <datalist id="material-presets">
          {MATERIAL_PRESETS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <label>
        <span>染色方式</span>
        <select
          value={value.dyeing}
          disabled={disabled}
          onChange={(e) => onChange({ dyeing: e.target.value })}
        >
          <option value="">请选择染色方式</option>
          {DYEING_PRESETS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label className="full-field">
        <span>纹样底图</span>
        <div className="pattern-radio">
          {PATTERNS.map((p) => (
            <label key={p.value} className={value.pattern === p.value ? "on" : ""}>
              <input
                type="radio"
                name="pattern"
                checked={value.pattern === p.value}
                disabled={disabled}
                onChange={() => onChange({ pattern: p.value })}
              />
              {p.label}
            </label>
          ))}
        </div>
      </label>
    </div>
  );
}

function emptyCarpetInput(code: string): CarpetInput {
  return {
    code,
    origin: ORIGINS[0],
    era: "",
    knotDensity: 30,
    knotUnit: KNOT_UNITS[0],
    material: "羊毛",
    dyeing: DYEING_PRESETS[0],
    pattern: "medallion",
  };
}

// ==================== 台账主页面 ====================

export function LedgerApp() {
  const [ledger, setLedger] = useState<Ledger>(() => loadLedger());
  const [origin, setOrigin] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [draft, setDraft] = useState<CarpetInput>(() => emptyCarpetInput(suggestCode(ledger.carpets)));
  const [saveErr, setSaveErr] = useState(false);
  const { msg, toast } = useToast();

  // 每次变更自动落盘：关掉再打开资料还在
  useEffect(() => {
    const ok = saveLedger(ledger);
    setSaveErr(!ok);
  }, [ledger]);

  const visible = useMemo(() => filterCarpets(ledger.carpets, origin), [ledger.carpets, origin]);
  const summary: LedgerSummary = useMemo(() => summarize(visible), [visible]);
  const usage: MaterialUsage[] = useMemo(
    () => materialUsage(visible, ledger.colors),
    [visible, ledger.colors]
  );
  const counts = useMemo(() => originCounts(ledger.carpets), [ledger.carpets]);

  const carpet = openId ? ledger.carpets.find((c) => c.id === openId) ?? null : null;
  const marker = carpet && selectedMarker ? carpet.markers.find((m) => m.id === selectedMarker) ?? null : null;

  function openCarpet(id: string) {
    setOpenId(id);
    setSelectedMarker(null);
  }

  function commit(next: Ledger, message?: string) {
    setLedger(next);
    if (message) toast(message);
  }

  function handleRegister() {
    const errs = checkCarpetInput(draft);
    if (errs.length) {
      toast(`请补全：${errs.join("、")}`, "warn");
      return;
    }
    const next = addCarpet(ledger, draft);
    const created = next.carpets[0];
    setLedger(next);
    setRegistering(false);
    setOrigin(null);
    setDraft(emptyCarpetInput(suggestCode(next.carpets)));
    openCarpet(created.id);
    toast("地毯档案已登记，请在纹样图上标记破损");
  }

  function patchCarpet(c: Carpet, patch: Partial<Carpet>) {
    commit(updateCarpet(ledger, c.id, patch));
  }

  function handleAddMarker(x: number, y: number) {
    const res = addMarker(ledger, carpet!.id, x, y);
    setLedger(res.ledger);
    if (res.marker) setSelectedMarker(res.marker.id);
  }

  function handleTransition(to: DamageMarker["status"], note?: string) {
    if (!carpet || !marker) return;
    if (to === "working" && marker.status === "signed") {
      const next = transitionMarker(ledger, carpet.id, marker.id, to, note);
      commit(next, `标记 #${marker.seq} 已重开补修，其余已签标记保留；档案自动撤回归档态`);
      return;
    }
    if (to === "working") {
      commit(transitionMarker(ledger, carpet.id, marker.id, to), `标记 #${marker.seq} 开工`);
      return;
    }
    const check = checkMarker(marker);
    if (!check.ok) {
      toast(`资料不齐，无法签认：还缺 ${check.missing.join("、")}`, "warn");
      return;
    }
    commit(transitionMarker(ledger, carpet.id, marker.id, to), `标记 #${marker.seq} 已签认`);
  }

  function handleArchive(c: Carpet) {
    const check: ArchiveCheck = checkArchivable(c);
    if (!check.ok) {
      toast("标记未齐，不可归档：" + check.reasons.join("；"), "warn");
      return;
    }
    commit(archiveCarpet(ledger, c.id), "全部标记已签认，档案归档完成");
  }

  const metrics = [
    { label: "待修复", value: summary.pendingCount, sub: `施工中 ${summary.workingCount}` },
    { label: "纹样档案", value: summary.carpetCount, sub: `已归档 ${summary.archivedCount}` },
    { label: "破损标记", value: summary.markerCount, sub: `已签 ${summary.signedCount}` },
    { label: "完工率", value: `${summary.completion}%`, sub: `补线 ${summary.totalThreadMeters} 米` },
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>手工地毯修复工作室 · 纹样修复台账</p>
        <h1>纸单对不上的破损与工序，在纹样图上一钉一档</h1>
        <span>
          每块地毯登记产地、年代、结密度、材质、染色方式；破损逐个在纹样图上标记，配齐补线色、施工说明与修复前后记录，
          全部签认后才可归档。数据只存在本机浏览器，不接后台。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
            <em>{m.sub}</em>
          </article>
        ))}
      </section>

      {carpet ? (
        <DetailView
          carpet={carpet}
          ledger={ledger}
          selectedMarker={selectedMarker}
          onBack={() => setOpenId(null)}
          onSelectMarker={setSelectedMarker}
          onAddMarker={handleAddMarker}
          onPatchMarker={(patch) =>
            marker && commit(updateMarker(ledger, carpet.id, marker.id, patch))
          }
          onTransition={handleTransition}
          onDeleteMarker={() => {
            if (!marker) return;
            if (!window.confirm(`删除标记 #${marker.seq}？`)) return;
            commit(deleteMarker(ledger, carpet.id, marker.id), "标记已删除");
            setSelectedMarker(null);
          }}
          onPatchCarpet={(patch) => patchCarpet(carpet, patch)}
          onArchive={() => handleArchive(carpet)}
        />
      ) : (
        <>
          <section className="workspace">
            <aside className="panel side">
              <h2>按产地筛选</h2>
              <div className="chips vertical">
                <button className={origin === null ? "chip-on" : ""} onClick={() => setOrigin(null)}>
                  全部产地 <em>{ledger.carpets.length}</em>
                </button>
                {ORIGINS.map((o) => {
                  const n = counts.find((c) => c.origin === o)?.count ?? 0;
                  return (
                    <button
                      key={o}
                      className={origin === o ? "chip-on" : ""}
                      disabled={n === 0}
                      onClick={() => setOrigin(o)}
                    >
                      {o} <em>{n}</em>
                    </button>
                  );
                })}
              </div>

              <h2 className="side-sub">材料用量{origin ? ` · ${origin}` : " · 全部"}</h2>
              {usage.length === 0 ? (
                <p className="muted">所选档案尚未登记补线用量</p>
              ) : (
                <ul className="usage">
                  {usage.map((u) => (
                    <li key={u.color.id}>
                      <i style={{ background: u.color.hex }} />
                      <span>{u.color.name}</span>
                      <b>{u.meters} 米</b>
                      <em>{u.markers} 处</em>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="side-sub">材料色卡</h2>
              <ColorDeck
                colors={ledger.colors}
                onAdd={(name, hex) => commit(addColor(ledger, name, hex), "色卡已新增")}
              />
            </aside>

            <section className="panel list-panel">
              <div className="heading">
                <div>
                  <p>{origin ? `产地：${origin}` : "全部档案"}</p>
                  <h2>纹样修复台账（{visible.length}）</h2>
                </div>
                <div className="actions">
                  <button
                    className="ghost"
                    onClick={() => {
                      if (!window.confirm("载入内置示例档案并覆盖本机数据？")) return;
                      setLedger(resetLedger());
                      setOrigin(null);
                      toast("已恢复示例台账");
                    }}
                  >
                    恢复示例
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      setDraft(emptyCarpetInput(suggestCode(ledger.carpets)));
                      setRegistering(true);
                    }}
                  >
                    登记新地毯
                  </button>
                </div>
              </div>

              {visible.length === 0 ? (
                <p className="muted empty">该产地暂无档案，点击右上「登记新地毯」建档。</p>
              ) : (
                <div className="records">
                  {visible.map((c) => {
                    const progress = carpetProgress(c);
                    const check = checkArchivable(c);
                    return (
                      <article key={c.id} className="carpet-card" onClick={() => openCarpet(c.id)}>
                        <div className="card-thumb">
                          <PatternArt pattern={c.pattern} />
                          <span className={`card-state ${c.archived ? "st-done" : "st-open"}`}>
                            {c.archived ? "已归档" : "在修"}
                          </span>
                        </div>
                        <div className="card-body">
                          <h3>
                            {c.code}
                            <small>
                              {c.origin} · {c.era}
                            </small>
                          </h3>
                          <p>
                            结密度 {c.knotDensity} {c.knotUnit} · {c.material} · {c.dyeing}
                          </p>
                          <div className="progress">
                            <i style={{ width: `${progress}%` }} />
                          </div>
                          <div className="card-foot">
                            <span>
                              {c.markers.length} 处破损 · 已签{" "}
                              {c.markers.filter((m) => m.status === "signed").length} · 进度 {progress}%
                            </span>
                            {!c.archived &&
                              (check.ok ? (
                                <b className="can-archive">标记齐，可归档 →</b>
                              ) : (
                                <em className="cannot-archive">{check.reasons[0]}</em>
                              ))}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        </>
      )}

      {registering && (
        <div className="modal-mask" onClick={() => setRegistering(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <div className="heading">
              <div>
                <p>新档案</p>
                <h2>登记地毯</h2>
              </div>
              <button className="ghost" onClick={() => setRegistering(false)}>
                取消
              </button>
            </div>
            <CarpetFormFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            <p className="muted">建档后在纹样图上逐个标记破损；标记签认齐全才允许归档。</p>
            <div className="modal-actions">
              <button className="primary" onClick={handleRegister}>
                建档并进入标记
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${msg?.kind === "warn" ? "toast-warn" : ""} ${msg ? "show" : ""}`}>
        {msg?.text}
      </div>
      {saveErr && <div className="save-err">本机存储写入失败，请检查浏览器存储空间</div>}
    </main>
  );
}

// ==================== 档案详情 ====================

function ColorDeck({
  colors,
  onAdd,
}: {
  colors: ThreadColor[];
  onAdd: (name: string, hex: string) => void;
}) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#7c2d12");
  return (
    <div className="deck">
      <div className="deck-list">
        {colors.map((c) => (
          <span key={c.id} className="deck-item" title={c.hex}>
            <i style={{ background: c.hex }} />
            {c.name}
          </span>
        ))}
      </div>
      <div className="deck-add">
        <input
          placeholder="新色名，如 红花粉"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} />
        <button
          onClick={() => {
            if (!name.trim()) return;
            onAdd(name, hex);
            setName("");
          }}
        >
          新增
        </button>
      </div>
    </div>
  );
}

function DetailView(props: {
  carpet: Carpet;
  ledger: Ledger;
  selectedMarker: string | null;
  onBack: () => void;
  onSelectMarker: (id: string) => void;
  onAddMarker: (x: number, y: number) => void;
  onPatchMarker: (patch: Partial<DamageMarker>) => void;
  onTransition: (to: DamageMarker["status"], note?: string) => void;
  onDeleteMarker: () => void;
  onPatchCarpet: (patch: Partial<Carpet>) => void;
  onArchive: () => void;
}) {
  const { carpet, ledger } = props;
  const marker = props.selectedMarker
    ? carpet.markers.find((m) => m.id === props.selectedMarker) ?? null
    : null;
  const progress = carpetProgress(carpet);
  const archiveCheck = checkArchivable(carpet);

  const formValue: CarpetInput = {
    code: carpet.code,
    origin: carpet.origin,
    era: carpet.era,
    knotDensity: carpet.knotDensity,
    knotUnit: carpet.knotUnit,
    material: carpet.material,
    dyeing: carpet.dyeing,
    pattern: carpet.pattern,
  };

  return (
    <>
      <section className="panel detail-head">
        <div className="heading">
          <div className="back-line">
            <button className="ghost" onClick={props.onBack}>
              ← 返回台账
            </button>
            <span className={`card-state ${carpet.archived ? "st-done" : "st-open"}`}>
              {carpet.archived ? `已归档 · ${carpet.archivedAt}` : "在修档案"}
            </span>
          </div>
          <h2>
            {carpet.code}
            <small>
              {carpet.origin} · {carpet.era}
            </small>
          </h2>
        </div>
        <div className={carpet.archived ? "readonly-fields" : ""}>
          <CarpetFormFields
            value={formValue}
            disabled={carpet.archived}
            onChange={(patch) => props.onPatchCarpet(patch)}
          />
        </div>
        <div className="detail-actions">
          <div className="progress-block">
            <div className="progress wide">
              <i style={{ width: `${progress}%` }} />
            </div>
            <span>
              {carpet.markers.length} 处破损 · 已签{" "}
              {carpet.markers.filter((m) => m.status === "signed").length} · 进度 {progress}%
            </span>
          </div>
          {!carpet.archived && (
            <div className="archive-box">
              {archiveCheck.ok ? (
                <button className="primary" onClick={props.onArchive}>
                  标记齐了，归档
                </button>
              ) : (
                <>
                  <button className="primary" disabled title={archiveCheck.reasons.join("；")}>
                    归档
                  </button>
                  <em className="cannot-archive">{archiveCheck.reasons.join("；")}</em>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="detail-grid">
        <div className="panel">
          <div className="heading">
            <div>
              <p>纹样局部标记图</p>
              <h2>破损逐个标记</h2>
            </div>
          </div>
          <PatternBoard
            carpet={carpet}
            colors={ledger.colors}
            selectedId={props.selectedMarker}
            onSelect={props.onSelectMarker}
            onAdd={props.onAddMarker}
          />
          <ul className="marker-index">
            {carpet.markers.length === 0 && <li className="muted">还没有标记，在图上点击空白处添加第一处破损。</li>}
            {carpet.markers.map((m) => {
              const c = colorOf(ledger, m.colorId);
              const check = checkMarker(m);
              return (
                <li
                  key={m.id}
                  className={props.selectedMarker === m.id ? "on" : ""}
                  onClick={() => props.onSelectMarker(m.id)}
                >
                  <b>#{m.seq}</b>
                  <span>
                    {m.part} · {m.damageType}（{m.severity}）
                  </span>
                  <i style={{ background: c?.hex ?? "#d9d3c4" }} title={c?.name ?? "未配补线色"} />
                  {!check.ok && <em className="missing-mini">缺{check.missing.length}项</em>}
                  <StatusBadge status={m.status} />
                </li>
              );
            })}
          </ul>
        </div>

        {marker ? (
          <MarkerInspector
            carpet={carpet}
            marker={marker}
            colors={ledger.colors}
            onChange={props.onPatchMarker}
            onTransition={props.onTransition}
            onDelete={props.onDeleteMarker}
          />
        ) : (
          <section className="panel inspector placeholder">
            <h2>标记检查器</h2>
            <p className="muted">
              在纹样图上选择或新增一个破损标记，在这里配齐补线色、施工说明和修复前后记录；四项齐了才能签认。
            </p>
            <ul className="rule-list">
              <li>每个破损标记独立流转，互不影响。</li>
              <li>已签标记可「重开补修」，其余已签标记保留，档案自动撤回归档。</li>
              <li>至少一处破损且全部签认，整块地毯才能归档。</li>
            </ul>
          </section>
        )}
      </section>
    </>
  );
}
