import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { Carpet, CarpetDraft, DamageMark, RepairRecord } from "./model";
import {
  loadCarpets,
  makeMark,
  nextCarpetId,
  saveCarpets,
} from "./model";
import {
  addRecord,
  filterByOrigin,
  makeRecord,
  removeRecord,
  reopenMark,
  signMark,
  updateRecord,
} from "./rules";
import {
  CarpetForm,
  Detail,
  Header,
  MaterialPanel,
  MetricsBar,
  Sidebar,
} from "./pages";

function App() {
  // 全部档案只存这一份 state，每次变更同步 localStorage —— 关掉再打开资料还在
  const [carpets, setCarpets] = useState<Carpet[]>(loadCarpets);
  const [origin, setOrigin] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSaveError(saveCarpets(carpets));
  }, [carpets]);

  // 默认选中第一块
  useEffect(() => {
    if (!selectedId && carpets.length > 0) setSelectedId(carpets[0].id);
  }, [carpets, selectedId]);

  // 按产地筛选 —— 列表、材料用量与进度都以这个口径同步更新
  const visibleCarpets = useMemo(
    () => filterByOrigin(carpets, origin),
    [carpets, origin]
  );
  const selected =
    carpets.find((c) => c.id === selectedId) ?? null;

  /* ---------------- 通用：改某一块地毯 ---------------- */

  const patchCarpet = (id: string, patch: Partial<Carpet>) =>
    setCarpets((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );

  const handleCreate = (draft: CarpetDraft) => {
    const carpet: Carpet = {
      ...draft,
      id: nextCarpetId(carpets),
      archived: false,
      createdAt: Date.now(),
      marks: [],
    };
    setCarpets((prev) => [carpet, ...prev]);
    setOrigin("全部");
    setSelectedId(carpet.id);
  };

  /* ---------------- 标记操作（重开只动一个标记，其余已签保留） ---------------- */

  const updateMark = (
    carpetId: string,
    markId: string,
    fn: (mark: DamageMark) => DamageMark
  ) =>
    setCarpets((prev) =>
      prev.map((c) =>
        c.id !== carpetId
          ? c
          : { ...c, marks: c.marks.map((m) => (m.id === markId ? fn(m) : m)) }
      )
    );

  const handleAddMark = (x: number, y: number) => {
    if (!selected || selected.archived) return;
    const mark = makeMark(x, y);
    patchCarpet(selected.id, { marks: [...selected.marks, mark] });
    setSelectedMarkId(mark.id);
  };

  const handleSign = (markId: string) =>
    selected && updateMark(selected.id, markId, (m) => signMark(m));

  const handleReopen = (markId: string) =>
    selected && updateMark(selected.id, markId, (m) => reopenMark(m));

  const handleDeleteMark = (markId: string) => {
    if (!selected) return;
    patchCarpet(selected.id, {
      marks: selected.marks.filter((m) => m.id !== markId),
    });
    setSelectedMarkId(null);
  };

  /* ---------------- 修复前后记录 ---------------- */

  const handleAddRecord = (
    markId: string,
    stage: RepairRecord["stage"]
  ) => {
    if (!selected) return;
    const date = new Date().toISOString().slice(0, 10);
    updateMark(selected.id, markId, (m) =>
      addRecord(m, makeRecord(stage, date))
    );
  };

  const handleChangeRecord = (
    markId: string,
    recordId: string,
    patch: Partial<Omit<RepairRecord, "id">>
  ) =>
    selected &&
    updateMark(selected.id, markId, (m) => updateRecord(m, recordId, patch));

  const handleRemoveRecord = (markId: string, recordId: string) =>
    selected &&
    updateMark(selected.id, markId, (m) => removeRecord(m, recordId));

  /* ---------------- 归档（标记齐签才可归档；可撤回后重开单个标记） ---------------- */

  const handleArchive = () =>
    selected && patchCarpet(selected.id, { archived: true });

  const handleUnarchive = () =>
    selected && patchCarpet(selected.id, { archived: false });

  const selectCarpet = (id: string) => {
    setSelectedId(id);
    setSelectedMarkId(null);
  };

  return (
    <main className="app">
      <Header saveError={saveError} />
      <MetricsBar carpets={visibleCarpets} />

      <section className="workspace">
        <Sidebar
          allCarpets={visibleCarpets}
          activeOrigin={origin}
          selectedId={selectedId}
          onSelectOrigin={setOrigin}
          onSelectCarpet={selectCarpet}
        />
        <CarpetForm onCreate={handleCreate} />
      </section>

      {selected ? (
        <Detail
          key={selected.id}
          carpet={selected}
          selectedMarkId={selectedMarkId}
          onSelectMark={setSelectedMarkId}
          onAddMark={handleAddMark}
          onPatchMark={(markId, patch) =>
            updateMark(selected.id, markId, (m) => ({ ...m, ...patch }))
          }
          onSignMark={handleSign}
          onReopenMark={handleReopen}
          onDeleteMark={handleDeleteMark}
          onAddRecord={handleAddRecord}
          onChangeRecord={handleChangeRecord}
          onRemoveRecord={handleRemoveRecord}
          onPatchCarpet={(patch) => patchCarpet(selected.id, patch)}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
        />
      ) : (
        <section className="panel empty-state">
          <p>左侧选择一块地毯，或先在“登记地毯”里入册，再在纹样图上标记破损。</p>
        </section>
      )}

      <MaterialPanel carpets={visibleCarpets} scope={origin} />
    </main>
  );
}

export default App;
