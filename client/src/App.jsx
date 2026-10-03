import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowUpDown, CalendarDays, ChartColumn, Check, ChevronLeft,
  ChevronRight, ClipboardList, Copy, Download, Factory, FileSpreadsheet,
  LoaderCircle, Plus, RotateCcw, Save, Search, Trash2, Upload, Users, X
} from "lucide-react";

const emptyWorker = () => ({ workerNumber: "", workerName: "", product: "", quantity: "", date: localDate(), comments: "" });
const legacyWorkersKey = "production_workers_v1";
const legacySummariesKey = "daily_summaries_v1";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("يلزم تسجيل الدخول إلى Cloudflare Access للوصول إلى خدمة البيانات.");
    }
    throw new Error(`استجابة غير صالحة من خدمة البيانات (${response.status}). تحقق من رابط API وإعدادات النشر.`);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "تعذر إكمال الطلب.");
  return result;
}

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function workerKey(worker, fallback = "") {
  return worker.workerNumber?.trim() || worker.workerName?.trim() || fallback;
}

function findLatestWorker(workers, workerNumber) {
  const normalizedNumber = workerNumber.trim().toLocaleLowerCase("ar");
  if (!normalizedNumber) return null;
  return workers
    .filter((worker) => worker.workerNumber?.trim().toLocaleLowerCase("ar") === normalizedNumber)
    .sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")) || Number(second.id) - Number(first.id))[0] || null;
}

function App() {
  const [workers, setWorkers] = useState([]);
  const [products, setProducts] = useState([]);
  const [dailySummaries, setDailySummaries] = useState([]);
  const [draft, setDraft] = useState(emptyWorker);
  const [activeView, setActiveView] = useState("records");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ field: "date", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [dailyDate, setDailyDate] = useState(localDate());
  const [computedDaily, setComputedDaily] = useState(null);
  const [monthly, setMonthly] = useState({ month: localDate().slice(0, 7), pool: "0", increase: "0" });
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const autoFilledFields = useRef({ workerNumber: "", workerName: "", product: "" });

  async function refreshState() {
    const state = await api("/api/state");
    setBackendReady(true);
    setWorkers(state.workers);
    setProducts(state.products || []);
    setDailySummaries(state.dailySummaries);
    return state;
  }

  useEffect(() => {
    let alive = true;
    async function initialize() {
      try {
        let state = await api("/api/state");
        setBackendReady(true);
        if (!state.workers.length && !state.dailySummaries.length && !localStorage.getItem("production_worker_migrated_to_sqlite")) {
          const legacyWorkers = readStoredArray(legacyWorkersKey);
          const legacySummaries = readStoredArray(legacySummariesKey);
          const usableWorkers = legacyWorkers.filter((worker) => worker && (worker.workerNumber || worker.workerName || worker.product));
          if (usableWorkers.length || legacySummaries.length) {
            await api("/api/migrate", {
              method: "POST",
              body: JSON.stringify({ workers: usableWorkers, dailySummaries: legacySummaries })
            });
            localStorage.setItem("production_worker_migrated_to_sqlite", "1");
            setNotice({ type: "success", text: `تم نقل ${usableWorkers.length} سجلًا و${legacySummaries.length} ملخصًا من تخزين هذا المتصفح.` });
            state = await api("/api/state");
          }
        }
        if (alive) {
          setWorkers(state.workers);
          setProducts(state.products || []);
          setDailySummaries(state.dailySummaries);
        }
      } catch (error) {
        if (alive) setNotice({ type: "error", text: error.message });
      } finally {
        if (alive) setLoading(false);
      }
    }
    initialize();
    return () => { alive = false; };
  }, []);

  const filteredWorkers = workers
    .filter((worker) => [worker.workerNumber, worker.workerName, worker.product, worker.comments]
      .some((value) => String(value || "").toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar"))))
    .sort((first, second) => {
      const left = first[sort.field] ?? "";
      const right = second[sort.field] ?? "";
      const comparison = sort.field === "quantity"
        ? Number(left) - Number(right)
        : String(left).localeCompare(String(right), "ar", { numeric: true });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  const pageCount = Math.max(1, Math.ceil(filteredWorkers.length / pageSize));
  const visibleWorkers = filteredWorkers.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const todayTotal = workers.filter((worker) => worker.date === localDate()).reduce((sum, worker) => sum + Number(worker.quantity || 0), 0);
  const monthlyTotal = workers.filter((worker) => worker.date?.startsWith(localDate().slice(0, 7))).length;
  const workerCount = new Set(workers.map((worker) => worker.workerNumber?.trim() || worker.workerName?.trim()).filter(Boolean)).size;
  const matchedWorker = !draft.id ? findLatestWorker(workers, draft.workerNumber) : null;

  function showNotice(text, type = "success") {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 4500);
  }

  function updateDraft(event) {
    const { name, value } = event.target;
    if (name !== "workerNumber" || draft.id) {
      setDraft((current) => ({ ...current, [name]: value }));
      return;
    }

    const normalizedNumber = value.trim().toLocaleLowerCase("ar");
    const previousAutoFill = autoFilledFields.current;
    const workerChanged = normalizedNumber !== previousAutoFill.workerNumber;
    const nameWasAutoFilled = Boolean(previousAutoFill.workerNumber) && draft.workerName === previousAutoFill.workerName;
    const productWasAutoFilled = Boolean(previousAutoFill.workerNumber) && draft.product === previousAutoFill.product;
    const nextDraft = { ...draft, workerNumber: value };

    if (workerChanged && nameWasAutoFilled) nextDraft.workerName = "";
    if (workerChanged && productWasAutoFilled) nextDraft.product = "";

    const matchingWorker = findLatestWorker(workers, value);
    if (matchingWorker) {
      if (!nextDraft.workerName || nameWasAutoFilled) nextDraft.workerName = matchingWorker.workerName || "";
      if (!nextDraft.product || productWasAutoFilled) nextDraft.product = matchingWorker.product || "";
      autoFilledFields.current = {
        workerNumber: normalizedNumber,
        workerName: nextDraft.workerName,
        product: nextDraft.product
      };
    } else {
      autoFilledFields.current = { workerNumber: "", workerName: "", product: "" };
    }

    setDraft(nextDraft);
  }

  async function addProduct(event) {
    event.preventDefault();
    const name = newProductName.trim();
    if (!name) return;
    try {
      const product = await api("/api/products", { method: "POST", body: JSON.stringify({ name }) });
      setProducts((current) => current.some((item) => item.toLocaleLowerCase() === product.name.toLocaleLowerCase()) ? current : [...current, product.name].sort((first, second) => first.localeCompare(second, "ar")));
      setDraft((current) => ({ ...current, product: product.name }));
      setNewProductName("");
      setShowProductDialog(false);
      showNotice("تمت إضافة المنتج إلى القائمة.");
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function saveWorker(event) {
    event.preventDefault();
    if (!draft.workerNumber.trim() && !draft.workerName.trim() && !draft.product.trim()) {
      showNotice("أدخل رقم العامل أو اسمه أو المنتج على الأقل.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, quantity: Number(draft.quantity) || 0 };
      const saved = draft.id
        ? await api(`/api/workers/${draft.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api("/api/workers", { method: "POST", body: JSON.stringify(payload) });
      if (saved.workerNumber && saved.workerName) {
        const matching = workers.filter((worker) => worker.id !== saved.id && worker.workerNumber?.trim().toLocaleLowerCase() === saved.workerNumber.trim().toLocaleLowerCase() && worker.workerName !== saved.workerName);
        for (const worker of matching) {
          try {
            const updated = await api(`/api/workers/${worker.id}`, { method: "PUT", body: JSON.stringify({ ...worker, workerName: saved.workerName }) });
            setWorkers((current) => current.map((item) => item.id === updated.id ? updated : item));
          } catch {
            // Keep the saved record even if an older duplicate cannot be synchronized.
          }
        }
      }
      setWorkers((current) => draft.id ? current.map((worker) => worker.id === saved.id ? saved : worker) : [saved, ...current]);
      setDraft(emptyWorker());
      showNotice(draft.id ? "تم تحديث السجل." : "تم حفظ السجل.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorker(worker) {
    if (!window.confirm(`حذف سجل ${worker.workerName || worker.workerNumber || "العامل"}؟`)) return;
    try {
      await api(`/api/workers/${worker.id}`, { method: "DELETE" });
      setWorkers((current) => current.filter((item) => item.id !== worker.id));
      if (draft.id === worker.id) setDraft(emptyWorker());
      showNotice("تم حذف السجل.");
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  function cloneWorker(worker) {
    const { id: _id, ...copy } = worker;
    setDraft({ ...copy, date: "", created: new Date().toISOString() });
    setActiveView("records");
    document.getElementById("worker-number")?.focus();
  }

  function setSortField(field) {
    setSort((current) => ({ field, direction: current.field === field && current.direction === "asc" ? "desc" : "asc" }));
    setPage(1);
  }

  function exportWorkers() {
    if (!filteredWorkers.length) return showNotice("لا توجد سجلات لتصديرها.", "error");
    const rows = [
      ["رقم العامل", "اسم العامل", "المنتج", "الكمية", "التاريخ", "تعليق"],
      ...filteredWorkers.map((worker) => [worker.workerNumber, worker.workerName, worker.product, worker.quantity, worker.date, worker.comments])
    ];
    downloadCsv("production_workers.csv", rows);
  }

  async function importWorkbook(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true });
      if (rows.length < 2) return showNotice("الملف لا يحتوي على بيانات كافية.", "error");
      const aliases = {
        workerNumber: ["رقم العامل", "worker number", "workernumber", "رقم", "id"],
        workerName: ["اسم العامل", "worker name", "workername", "name"],
        product: ["المنتج", "product", "product name", "item"],
        quantity: ["الكمية", "quantity", "qty", "amount"],
        date: ["التاريخ", "date", "day"],
        comments: ["تعليق", "comments", "note", "notes"]
      };
      const header = rows[0].map((value) => String(value ?? "").trim().toLocaleLowerCase("ar"));
      const indexes = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, header.findIndex((value) => names.includes(value))]));
      const imported = rows.slice(1).map((row) => {
        const value = (field, fallbackIndex) => row[indexes[field] >= 0 ? indexes[field] : fallbackIndex] ?? "";
        const rawDate = value("date", 4);
        let date = "";
        if (rawDate instanceof Date && !Number.isNaN(rawDate.valueOf())) {
          date = rawDate.toISOString().slice(0, 10);
        } else if (typeof rawDate === "number") {
          date = new Date((rawDate - 25569) * 86400 * 1000).toISOString().slice(0, 10);
        } else if (rawDate) {
          const parsed = new Date(rawDate);
          date = Number.isNaN(parsed.valueOf()) ? String(rawDate).trim() : parsed.toISOString().slice(0, 10);
        }
        return {
          workerNumber: String(value("workerNumber", 0)).trim(),
          workerName: String(value("workerName", 1)).trim(),
          product: String(value("product", 2)).trim(),
          quantity: Number(value("quantity", 3)) || 0,
          date,
          comments: String(value("comments", 5)).trim()
        };
      }).filter((worker) => worker.workerNumber || worker.workerName || worker.product);
      const result = await api("/api/workers/import", { method: "POST", body: JSON.stringify({ workers: imported }) });
      await refreshState();
      showNotice(`اكتمل الاستيراد: ${result.imported} سجل، وتم تخطي ${result.skipped}.`);
    } catch (error) {
      showNotice(error.message || "تعذر قراءة ملف Excel.", "error");
    }
  }

  async function importLegacyJson(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const legacyWorkers = backup.workers || backup[legacyWorkersKey] || [];
      const legacySummaries = backup.dailySummaries || backup[legacySummariesKey] || [];
      if (!Array.isArray(legacyWorkers) || !Array.isArray(legacySummaries)) throw new Error("صيغة ملف النسخة الاحتياطية غير معروفة.");
      const workersToImport = legacyWorkers.filter((worker) => worker && (worker.workerNumber || worker.workerName || worker.product));
      if (!workersToImport.length && !legacySummaries.length) throw new Error("النسخة الاحتياطية لا تحتوي على سجلات أو ملخصات.");
      await api("/api/migrate", {
        method: "POST",
        body: JSON.stringify({ workers: workersToImport, dailySummaries: legacySummaries })
      });
      localStorage.setItem("production_worker_migrated_to_sqlite", "1");
      await refreshState();
      showNotice(`تم نقل ${workersToImport.length} سجلًا و${legacySummaries.length} ملخصًا.`);
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  function computeDaily() {
    if (!dailyDate) return showNotice("اختر تاريخًا أولًا.", "error");
    const grouped = new Map();
    workers.filter((worker) => worker.date === dailyDate).forEach((worker) => {
      const key = workerKey(worker, `record-${worker.id}`);
      const current = grouped.get(key) || { workerNumber: worker.workerNumber || "", workerName: worker.workerName || "", qty: 0 };
      current.qty += Number(worker.quantity) || 0;
      grouped.set(key, current);
    });
    const items = [...grouped.values()].filter((item) => item.qty > 0).sort((first, second) => second.qty - first.qty);
    setComputedDaily({ date: dailyDate, items, saved: false });
  }

  async function saveDaily() {
    if (!computedDaily?.items.length) return;
    try {
      const saved = await api(`/api/daily-summaries/${computedDaily.date}`, {
        method: "PUT",
        body: JSON.stringify({ items: computedDaily.items })
      });
      setDailySummaries((current) => [saved, ...current.filter((item) => item.date !== saved.date)].sort((a, b) => b.date.localeCompare(a.date)));
      setComputedDaily({ ...saved, saved: true });
      showNotice("تم حفظ ملخص اليوم.");
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function deleteDaily(date) {
    if (!window.confirm(`حذف ملخص ${date}؟`)) return;
    try {
      await api(`/api/daily-summaries/${date}`, { method: "DELETE" });
      setDailySummaries((current) => current.filter((summary) => summary.date !== date));
      if (computedDaily?.date === date) setComputedDaily(null);
      showNotice("تم حذف الملخص.");
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  function calculateMonthly() {
    if (!monthly.month) return showNotice("اختر الشهر أولًا.", "error");
    const grouped = new Map();
    const savedByDate = new Map(dailySummaries.filter((summary) => summary.date.startsWith(monthly.month)).map((summary) => [summary.date, summary]));
    const addItem = (item, fallback) => {
      const key = workerKey(item, fallback);
      const current = grouped.get(key) || { workerNumber: item.workerNumber || "", workerName: item.workerName || "", qty: 0 };
      current.qty += Number(item.qty ?? item.quantity) || 0;
      grouped.set(key, current);
    };
    workers.filter((worker) => worker.date?.startsWith(monthly.month) && !savedByDate.has(worker.date))
      .forEach((worker) => addItem(worker, `record-${worker.id}`));
    savedByDate.forEach((summary) => summary.items.forEach((item, index) => addItem(item, `${summary.date}-${index}`)));
    const totalQty = [...grouped.values()].reduce((sum, item) => sum + item.qty, 0);
    const rows = [...grouped.values()].map((item) => {
      const share = totalQty ? item.qty / totalQty : 0;
      return { ...item, share, bonus: Number(monthly.pool || 0) * share * (1 + Number(monthly.increase || 0) / 100) };
    }).sort((first, second) => second.qty - first.qty);
    setMonthlyReport({ month: monthly.month, totalQty, rows });
  }

  function exportMonthly() {
    if (!monthlyReport?.rows.length) return showNotice("احسب ملخصًا يحتوي على بيانات أولًا.", "error");
    downloadCsv(`monthly_summary_${monthlyReport.month}.csv`, [
      ["رقم العامل", "اسم العامل", "إجمالي الكمية", "نسبة من الكل (%)", "المكافأة"],
      ...monthlyReport.rows.map((row) => [row.workerNumber, row.workerName, row.qty, (row.share * 100).toFixed(2), row.bonus.toFixed(2)]),
      ["", "", monthlyReport.totalQty, "100", monthlyReport.rows.reduce((sum, row) => sum + row.bonus, 0).toFixed(2)]
    ]);
  }

  function openSavedDaily(summary) {
    setDailyDate(summary.date);
    setComputedDaily({ ...summary, saved: true });
  }

  useEffect(() => {
    function handleShortcuts(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setDraft(emptyWorker());
        setActiveView("records");
        document.getElementById("worker-number")?.focus();
      }
      if (event.key.toLowerCase() === "s" && activeView === "records") {
        event.preventDefault();
        document.querySelector("#worker-form button[type=submit]")?.click();
      }
    }
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [activeView]);

  if (loading) {
    return <main className="loading-screen"><LoaderCircle className="spin" size={24} /> جارٍ تحميل سجل الإنتاج</main>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#records" onClick={() => setActiveView("records")}>
          <span className="brand-mark"><Factory size={22} /></span>
          <span><strong>وَرْدِيّة</strong><small>سجل الإنتاج</small></span>
        </a>
        <nav className="view-tabs" aria-label="الأقسام">
          <button className={activeView === "records" ? "active" : ""} onClick={() => setActiveView("records")}><ClipboardList size={16} /> السجلات</button>
          <button className={activeView === "daily" ? "active" : ""} onClick={() => setActiveView("daily")}><CalendarDays size={16} /> ملخص اليوم</button>
        </nav>
        <span className={`storage-status ${backendReady ? "" : "is-offline"}`}><span />{backendReady ? "متصل بـ Supabase" : "تحقق من قاعدة Supabase"}</span>
      </header>

      <main className="main-content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">متابعة التشغيل</p>
            <h1>{activeView === "records" ? "إنتاج العمال" : "ملخص الإنتاج اليومي"}</h1>
            <p className="page-description">{activeView === "records" ? "سجّل الكميات، راجع الأداء، واحتفظ ببيانات الوردية في مكان واحد." : "اجمع كميات اليوم واحفظ لقطة ثابتة لتقارير الشهر."}</p>
          </div>
          {activeView === "records" && <div className="heading-actions"><label className="import-button"><Upload size={16} /> استيراد Excel<input type="file" accept=".xls,.xlsx" onChange={importWorkbook} /></label><label className="import-button backup-import"><RotateCcw size={16} /> نقل نسخة قديمة<input type="file" accept=".json,application/json" onChange={importLegacyJson} /></label></div>}
        </section>

        {notice && <div className={`notice ${notice.type}`} role="status"><span>{notice.type === "error" ? <AlertCircle size={17} /> : <Check size={17} />}{notice.text}</span><button title="إخفاء" onClick={() => setNotice(null)}><X size={16} /></button></div>}

        {showProductDialog && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setShowProductDialog(false); }}><form className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onSubmit={addProduct}><div className="panel-title"><div><p className="eyebrow">قائمة المنتجات</p><h2 id="product-dialog-title">إضافة منتج جديد</h2></div><button className="icon-button" type="button" title="إغلاق" onClick={() => setShowProductDialog(false)}><X size={17} /></button></div><label className="field" htmlFor="new-product-name">اسم المنتج<input id="new-product-name" autoFocus maxLength={120} value={newProductName} onChange={(event) => setNewProductName(event.target.value)} /></label><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setShowProductDialog(false)}>إلغاء</button><button className="primary-button" type="submit"><Plus size={16} /> إضافة المنتج</button></div></form></div>}

        {activeView === "records" ? (
          <>
            <section className="metric-strip" aria-label="مؤشرات الإنتاج">
              <article className="metric"><span className="metric-icon green"><Factory size={18} /></span><div><small>إنتاج اليوم</small><strong>{todayTotal.toLocaleString("ar-EG")}</strong></div><span className="metric-unit">وحدة</span></article>
              <article className="metric"><span className="metric-icon blue"><ClipboardList size={18} /></span><div><small>سجلات هذا الشهر</small><strong>{monthlyTotal.toLocaleString("ar-EG")}</strong></div><span className="metric-unit">سجل</span></article>
              <article className="metric"><span className="metric-icon ochre"><Users size={18} /></span><div><small>العمال المسجلون</small><strong>{workerCount.toLocaleString("ar-EG")}</strong></div><span className="metric-unit">عامل</span></article>
            </section>

            <section className="records-layout">
              <form className="editor-panel panel" id="worker-form" onSubmit={saveWorker}>
                <div className="panel-title"><div><p className="eyebrow">بيانات الوردية</p><h2>{draft.id ? "تعديل سجل" : "سجل جديد"}</h2></div>{draft.id && <button className="icon-button" type="button" title="إلغاء التعديل" onClick={() => setDraft(emptyWorker())}><X size={17} /></button>}</div>
                <label className="field" htmlFor="worker-number">رقم العامل<input id="worker-number" name="workerNumber" value={draft.workerNumber} onChange={updateDraft} autoComplete="off" />{matchedWorker && <small className="autofill-note">تم العثور على بيانات العامل وإكمالها من آخر سجل</small>}</label>
                <label className="field" htmlFor="worker-name">اسم العامل<input id="worker-name" name="workerName" value={draft.workerName} onChange={updateDraft} autoComplete="off" /></label>
                <div className="product-entry"><label className="field" htmlFor="product">المنتج<select id="product" name="product" value={draft.product} onChange={updateDraft}><option value="">اختر المنتج</option>{products.map((product) => <option key={product} value={product}>{product}</option>)}{draft.product && !products.includes(draft.product) && <option value={draft.product}>{draft.product}</option>}</select></label><button className="add-product-button" type="button" title="إضافة منتج جديد" aria-label="إضافة منتج جديد" onClick={() => setShowProductDialog(true)}><Plus size={18} /></button></div>
                <div className="field-pair">
                  <label className="field" htmlFor="quantity">الكمية<input id="quantity" name="quantity" type="number" min="0" step="any" value={draft.quantity} onChange={updateDraft} /></label>
                  <label className="field" htmlFor="date">التاريخ<input id="date" name="date" type="date" value={draft.date} onChange={updateDraft} /></label>
                </div>
                <label className="field" htmlFor="comments">تعليق<textarea id="comments" name="comments" rows="3" value={draft.comments} onChange={updateDraft} /></label>
                <div className="editor-actions">
                  <button className="primary-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{draft.id ? "حفظ التعديل" : "حفظ السجل"}</button>
                  <button className="secondary-button" type="button" onClick={() => setDraft(emptyWorker())}><Plus size={16} /> جديد</button>
                </div>
                {draft.id && <button className="danger-text" type="button" onClick={() => deleteWorker(draft)}><Trash2 size={15} /> حذف هذا السجل</button>}
              </form>

              <section className="list-panel panel">
                <div className="list-heading"><div><p className="eyebrow">قاعدة البيانات</p><h2>سجلات الإنتاج <span>{filteredWorkers.length}</span></h2></div><button className="secondary-button export-button" onClick={exportWorkers}><Download size={16} /> تصدير CSV</button></div>
                <div className="table-tools">
                  <label className="search-box"><Search size={17} /><input aria-label="ابحث في السجلات" placeholder="ابحث بالرقم أو الاسم أو المنتج" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />{query && <button title="مسح البحث" onClick={() => setQuery("")}><X size={15} /></button>}</label>
                  <label className="page-size-control">عرض<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
                </div>
                <div className="table-scroll"><table className="data-table"><thead><tr>
                  <th>الإجراءات</th>
                  {[ ["workerNumber", "رقم العامل"], ["workerName", "اسم العامل"], ["product", "المنتج"], ["quantity", "الكمية"], ["date", "التاريخ"], ["comments", "تعليق"] ].map(([field, label]) => <th key={field}><button className="sort-button" onClick={() => setSortField(field)}>{label}<ArrowUpDown size={12} /></button></th>)}
                </tr></thead><tbody>
                  {visibleWorkers.map((worker) => <tr key={worker.id} className={draft.id === worker.id ? "selected-row" : ""}>
                    <td><div className="row-actions"><button title="تعديل" onClick={() => setDraft({ ...worker, quantity: String(worker.quantity) })}><span className="sr-only">تعديل</span><RotateCcw size={15} /></button><button title="نسخ كسجل جديد" onClick={() => cloneWorker(worker)}><span className="sr-only">نسخ</span><Copy size={15} /></button><button className="delete-action" title="حذف" onClick={() => deleteWorker(worker)}><span className="sr-only">حذف</span><Trash2 size={15} /></button></div></td>
                    <td>{worker.workerNumber || "—"}</td><td>{worker.workerName || "—"}</td><td>{worker.product || "—"}</td><td className="quantity-cell">{Number(worker.quantity || 0).toLocaleString("ar-EG")}</td><td dir="ltr" className="date-cell">{worker.date || "—"}</td><td className="comments-cell" title={worker.comments}>{worker.comments || "—"}</td>
                  </tr>)}
                  {!visibleWorkers.length && <tr><td className="empty-table" colSpan="7"><FileSpreadsheet size={22} /><strong>{query ? "لا توجد نتائج مطابقة" : "لا توجد سجلات بعد"}</strong><span>{query ? "جرّب كلمة بحث أخرى." : "أضف أول سجل إنتاج للبدء."}</span></td></tr>}
                </tbody></table></div>
                <footer className="table-footer"><span>عرض {visibleWorkers.length ? (Math.min(page, pageCount) - 1) * pageSize + 1 : 0}–{Math.min(page, pageCount) * pageSize} من {filteredWorkers.length}</span><div className="pagination"><button title="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronRight size={17} /></button><span>{Math.min(page, pageCount)} / {pageCount}</span><button title="الصفحة التالية" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronLeft size={17} /></button></div></footer>
              </section>
            </section>

            <section className="monthly-panel panel">
              <div className="list-heading"><div><p className="eyebrow">الأداء والمكافآت</p><h2><ChartColumn size={20} /> ملخص الإنتاج الشهري</h2></div>{monthlyReport?.rows.length > 0 && <button className="secondary-button" onClick={exportMonthly}><Download size={16} /> تصدير الملخص</button>}</div>
              <div className="monthly-controls">
                <label className="field">الشهر<input type="month" value={monthly.month} onChange={(event) => setMonthly((current) => ({ ...current, month: event.target.value }))} /></label>
                <label className="field">مبلغ المكافأة<input type="number" min="0" step="0.01" value={monthly.pool} onChange={(event) => setMonthly((current) => ({ ...current, pool: event.target.value }))} /></label>
                <label className="field">زيادة المكافأة (%)<input type="number" step="0.1" value={monthly.increase} onChange={(event) => setMonthly((current) => ({ ...current, increase: event.target.value }))} /></label>
                <button className="primary-button calculate-button" onClick={calculateMonthly}><ChartColumn size={16} /> حساب الملخص</button>
              </div>
              {monthlyReport && <SummaryTable rows={monthlyReport.rows} totalQty={monthlyReport.totalQty} showBonus />}
            </section>
          </>
        ) : (
          <section className="daily-layout">
            <div className="daily-main panel">
              <div className="panel-title"><div><p className="eyebrow">تجميع السجلات</p><h2>ملخص يوم العمل</h2></div><span className="daily-icon"><CalendarDays size={21} /></span></div>
              <div className="daily-controls"><label className="field">تاريخ الملخص<input type="date" value={dailyDate} onChange={(event) => { setDailyDate(event.target.value); setComputedDaily(null); }} /></label><button className="primary-button" onClick={computeDaily}><ChartColumn size={16} /> حساب من السجلات</button></div>
              {computedDaily && <div className="computed-summary"><div className="computed-heading"><div><small>إجمالي الكمية</small><strong>{computedDaily.items.reduce((sum, item) => sum + item.qty, 0).toLocaleString("ar-EG")}</strong></div><button className="primary-button" disabled={!computedDaily.items.length || computedDaily.saved} onClick={saveDaily}><Save size={16} />{computedDaily.saved ? "محفوظ" : "حفظ ملخص اليوم"}</button></div><SummaryTable rows={computedDaily.items.map((item) => ({ ...item, qty: item.qty }))} totalQty={computedDaily.items.reduce((sum, item) => sum + item.qty, 0)} />{!computedDaily.items.length && <p className="empty-message">لا توجد كميات مسجلة في هذا اليوم.</p>}</div>}
            </div>
            <aside className="saved-panel panel"><div className="panel-title"><div><p className="eyebrow">لقطات محفوظة</p><h2>الملخصات اليومية</h2></div><span className="saved-count">{dailySummaries.length}</span></div>{dailySummaries.length ? <ul className="saved-list">{dailySummaries.map((summary) => <li key={summary.date}><button className="saved-summary" onClick={() => openSavedDaily(summary)}><span dir="ltr">{summary.date}</span><small>{summary.items.reduce((sum, item) => sum + Number(item.qty || 0), 0).toLocaleString("ar-EG")} وحدة</small></button><button className="icon-button delete-action" title="حذف الملخص" onClick={() => deleteDaily(summary.date)}><Trash2 size={15} /></button></li>)}</ul> : <div className="saved-empty"><CalendarDays size={22} /><span>لا توجد ملخصات محفوظة</span></div>}</aside>
          </section>
        )}
      </main>
      <footer className="app-footer"><span>وَرْدِيّة <span dir="ltr">·</span> {backendReady ? "بياناتك محفوظة في Supabase" : "قاعدة Supabase غير جاهزة"}</span><span><kbd>Ctrl</kbd> + <kbd>N</kbd> سجل جديد <span className="footer-divider">|</span> <kbd>Ctrl</kbd> + <kbd>S</kbd> حفظ</span></footer>
    </div>
  );
}

function SummaryTable({ rows, totalQty, showBonus = false }) {
  if (!rows.length) return <div className="empty-summary">لا توجد بيانات لهذا الاختيار.</div>;
  return <div className="table-scroll summary-scroll"><table className="data-table summary-table"><thead><tr><th>رقم العامل</th><th>اسم العامل</th><th>إجمالي الكمية</th>{showBonus && <><th>النسبة</th><th>المكافأة</th></>}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.workerNumber}-${row.workerName}-${index}`}><td>{row.workerNumber || "—"}</td><td>{row.workerName || "—"}</td><td>{Number(row.qty || 0).toLocaleString("ar-EG")}</td>{showBonus && <><td>{(row.share * 100).toFixed(2)}%</td><td>{row.bonus.toFixed(2)}</td></>}</tr>)}</tbody><tfoot><tr><th colSpan="2">الإجمالي</th><th>{Number(totalQty || 0).toLocaleString("ar-EG")}</th>{showBonus && <><th>100%</th><th>{rows.reduce((sum, row) => sum + row.bonus, 0).toFixed(2)}</th></>}</tr></tfoot></table></div>;
}

export default App;