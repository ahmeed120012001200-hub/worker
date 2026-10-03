import { createAdminClient } from "@supabase/server/core";

const supabase = createAdminClient();
const WORKER_COLUMNS = "id,workerNumber:worker_number,workerName:worker_name,product,quantity,date,comments,created";

function databaseError(error) {
  const result = new Error(error.message || "تعذر الاتصال بقاعدة Supabase.");
  result.code = error.code;
  result.status = error.code === "PGRST205" ? 503 : 500;
  return result;
}

function unwrap({ data, error }) {
  if (error) throw databaseError(error);
  return data;
}

function invalidInput(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizeWorker(input = {}) {
  const worker = {
    workerNumber: String(input.workerNumber ?? "").trim(),
    workerName: String(input.workerName ?? "").trim(),
    product: String(input.product ?? "").trim(),
    quantity: Number(input.quantity) || 0,
    date: String(input.date ?? "").trim(),
    comments: String(input.comments ?? "").trim(),
    created: String(input.created ?? new Date().toISOString())
  };
  if (!worker.workerNumber && !worker.workerName && !worker.product) {
    throw invalidInput("أدخل رقم العامل أو اسمه أو المنتج على الأقل.");
  }
  if (!Number.isFinite(worker.quantity) || worker.quantity < 0) {
    throw invalidInput("الكمية يجب أن تكون رقمًا موجبًا أو صفرًا.");
  }
  return worker;
}

function toDatabaseWorker(worker) {
  return {
    worker_number: worker.workerNumber,
    worker_name: worker.workerName,
    product: worker.product,
    quantity: worker.quantity,
    date: worker.date,
    comments: worker.comments,
    created: worker.created
  };
}

async function rememberProduct(name) {
  const productName = String(name ?? "").trim();
  if (!productName) return;
  const products = unwrap(await supabase.from("products").select("name"));
  if (products.some((product) => product.name.toLocaleLowerCase() === productName.toLocaleLowerCase())) return;
  const { error } = await supabase.from("products").insert({ name: productName });
  if (error && error.code !== "23505") throw databaseError(error);
}

export async function readState() {
  const [workersResult, productsResult, summariesResult] = await Promise.all([
    supabase.from("workers").select(WORKER_COLUMNS).order("date", { ascending: false }).order("id", { ascending: false }),
    supabase.from("products").select("name").order("name", { ascending: true }),
    supabase.from("daily_summaries").select("date,items,created").order("date", { ascending: false })
  ]);
  return {
    workers: unwrap(workersResult),
    products: unwrap(productsResult).map((product) => product.name),
    dailySummaries: unwrap(summariesResult)
  };
}

export async function listProducts() {
  return unwrap(await supabase.from("products").select("name").order("name", { ascending: true })).map((product) => product.name);
}

export async function addProduct(input) {
  const name = String(input ?? "").trim();
  if (!name) throw invalidInput("اكتب اسم المنتج أولًا.");
  if (name.length > 120) throw invalidInput("اسم المنتج طويل جدًا.");
  const products = unwrap(await supabase.from("products").select("name"));
  const existing = products.find((product) => product.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (existing) return { name: existing.name, created: false };
  const product = unwrap(await supabase.from("products").insert({ name }).select("name").single());
  return { name: product.name, created: true };
}

export async function hasDuplicate(worker, exceptId = null) {
  if (!worker.workerNumber || !worker.date) return false;
  let query = supabase.from("workers").select("id,worker_number").eq("date", worker.date);
  if (exceptId !== null) query = query.neq("id", exceptId);
  const rows = unwrap(await query);
  const target = worker.workerNumber.trim().toLocaleLowerCase();
  return rows.some((row) => String(row.worker_number ?? "").trim().toLocaleLowerCase() === target);
}

export async function createWorker(input) {
  const worker = normalizeWorker(input);
  if (await hasDuplicate(worker)) return { duplicate: true };
  await rememberProduct(worker.product);
  const saved = unwrap(await supabase.from("workers").insert(toDatabaseWorker(worker)).select(WORKER_COLUMNS).single());
  return { worker: saved };
}

export async function updateWorker(id, input) {
  const exists = unwrap(await supabase.from("workers").select("id").eq("id", id).maybeSingle());
  if (!exists) return null;
  const worker = normalizeWorker(input);
  if (await hasDuplicate(worker, id)) return { duplicate: true };
  await rememberProduct(worker.product);
  const saved = unwrap(await supabase.from("workers").update(toDatabaseWorker(worker)).eq("id", id).select(WORKER_COLUMNS).single());
  return { worker: saved };
}

export async function deleteWorker(id) {
  const removed = unwrap(await supabase.from("workers").delete().eq("id", id).select("id"));
  return removed.length > 0;
}

export async function importWorkers(inputs) {
  let imported = 0;
  let skipped = 0;
  for (const input of inputs) {
    let worker;
    try {
      worker = normalizeWorker(input);
    } catch {
      skipped += 1;
      continue;
    }
    if (await hasDuplicate(worker)) {
      skipped += 1;
      continue;
    }
    await rememberProduct(worker.product);
    unwrap(await supabase.from("workers").insert(toDatabaseWorker(worker)));
    imported += 1;
  }
  return { imported, skipped };
}

export async function saveDailySummary(date, items, created = new Date().toISOString()) {
  return unwrap(await supabase.from("daily_summaries").upsert({ date, items, created }, { onConflict: "date" }).select("date,items,created").single());
}

export async function deleteDailySummary(date) {
  unwrap(await supabase.from("daily_summaries").delete().eq("date", date));
}

async function tableCount(table, column) {
  const { count, error } = await supabase.from(table).select(column, { count: "exact", head: true });
  if (error) throw databaseError(error);
  return count || 0;
}

export async function migrateLegacyState(workersInput, summariesInput, productsInput = []) {
  const counts = await Promise.all([
    tableCount("workers", "id"),
    tableCount("daily_summaries", "date"),
    tableCount("products", "name")
  ]);
  if (counts.some(Boolean)) {
    const error = new Error("توجد بيانات بالفعل في Supabase؛ لم يتم استبدالها.");
    error.status = 409;
    throw error;
  }

  const workers = workersInput.map(normalizeWorker);
  const summaries = summariesInput.filter((summary) => summary?.date && Array.isArray(summary.items));
  if (workers.length) {
    unwrap(await supabase.from("workers").insert(workers.map(toDatabaseWorker)));
    const names = [...new Set([...workers.map((worker) => worker.product), ...productsInput].map((name) => String(name ?? "").trim()).filter(Boolean))];
    if (names.length) unwrap(await supabase.from("products").insert(names.map((name) => ({ name }))));
  } else if (productsInput.length) {
    const names = [...new Set(productsInput.map((name) => String(name ?? "").trim()).filter(Boolean))];
    if (names.length) unwrap(await supabase.from("products").insert(names.map((name) => ({ name }))));
  }
  if (summaries.length) {
    unwrap(await supabase.from("daily_summaries").upsert(summaries.map((summary) => ({
      date: String(summary.date),
      items: summary.items,
      created: String(summary.created ?? new Date().toISOString())
    })), { onConflict: "date" }));
  }
  return { importedWorkers: workers.length, importedSummaries: summaries.length };
}
