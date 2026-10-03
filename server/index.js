import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContextClient, verifyAuth } from "@supabase/server/core";
import {
  addProduct,
  createWorker,
  deleteDailySummary,
  deleteWorker,
  importWorkers,
  listProducts,
  migrateLegacyState,
  readState,
  saveDailySummary,
  updateWorker
} from "./supabaseRepository.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const clientBuild = resolve(rootDirectory, "dist", "client");

app.use(express.json({ limit: "10mb" }));

function sendApiError(response, error) {
  const status = error.status || 500;
  const message = error.code === "PGRST205"
    ? "جداول Supabase غير جاهزة؛ نفّذ ملف supabase/schema.sql أولًا."
    : error.message || "حدث خطأ أثناء الاتصال بقاعدة البيانات.";
  return response.status(status).json({ error: message, code: error.code });
}

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/state", async (_request, response) => {
  try {
    return response.json(await readState());
  } catch (error) {
    return sendApiError(response, error);
  }
});
app.get("/api/products", async (_request, response) => {
  try {
    return response.json(await listProducts());
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.get("/api/auth/me", async (request, response) => {
  const headers = new Headers();
  if (request.headers.authorization) headers.set("authorization", request.headers.authorization);
  const webRequest = new Request(new URL(request.originalUrl, `http://${request.get("host")}`), { headers });

  try {
    const { data: auth, error } = await verifyAuth(webRequest, { auth: "user" });
    if (error) return response.status(error.status).json({ error: error.message, code: error.code });

    const supabase = createContextClient({ auth: { token: auth.token, keyName: auth.keyName } });
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) return response.status(401).json({ error: "تعذر التحقق من المستخدم." });

    return response.json({ user: { id: data.user.id, email: data.user.email ?? null } });
  } catch (error) {
    console.error("Supabase user verification failed:", error.message);
    return response.status(503).json({ error: "تحقق من إعداد Supabase في ملف البيئة." });
  }
});

app.post("/api/products", async (request, response) => {
  try {
    const product = await addProduct(request.body?.name);
    return response.status(product.created ? 201 : 200).json({ name: product.name });
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.post("/api/workers", async (request, response) => {
  try {
    const result = await createWorker(request.body);
    if (result.duplicate) return response.status(409).json({ error: "يوجد سجل لهذا العامل في التاريخ نفسه." });
    return response.status(201).json(result.worker);
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.put("/api/workers/:id", async (request, response) => {
  try {
    const result = await updateWorker(request.params.id, request.body);
    if (!result) return response.status(404).json({ error: "السجل غير موجود." });
    if (result.duplicate) return response.status(409).json({ error: "يوجد سجل آخر لهذا العامل في التاريخ نفسه." });
    return response.json(result.worker);
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.delete("/api/workers/:id", async (request, response) => {
  try {
    if (!await deleteWorker(request.params.id)) return response.status(404).json({ error: "السجل غير موجود." });
    return response.status(204).end();
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.post("/api/workers/import", async (request, response) => {
  const workers = Array.isArray(request.body?.workers) ? request.body.workers : [];
  try {
    return response.json(await importWorkers(workers));
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.put("/api/daily-summaries/:date", async (request, response) => {
  const date = String(request.params.date);
  const items = request.body?.items;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(items)) {
    return response.status(400).json({ error: "بيانات الملخص غير صالحة." });
  }
  try {
    return response.json(await saveDailySummary(date, items));
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.delete("/api/daily-summaries/:date", async (request, response) => {
  try {
    await deleteDailySummary(String(request.params.date));
    return response.status(204).end();
  } catch (error) {
    return sendApiError(response, error);
  }
});

app.post("/api/migrate", async (request, response) => {
  const workers = Array.isArray(request.body?.workers) ? request.body.workers : [];
  const summaries = Array.isArray(request.body?.dailySummaries) ? request.body.dailySummaries : [];
  try {
    return response.json(await migrateLegacyState(workers, summaries));
  } catch (error) {
    return sendApiError(response, error);
  }
});

if (existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get("*path", (_request, response) => response.sendFile(resolve(clientBuild, "index.html")));
}

app.listen(port, "127.0.0.1", () => console.log(`API ready at http://localhost:${port}`));