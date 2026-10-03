import { createContextClient, verifyAuth } from "@supabase/server/core";
import { createSupabaseEnv, createSupabaseRepository } from "../server/supabaseRepository.js";
import { getCloudflareAccessIssuer, verifyCloudflareAccessJwt } from "../server/cloudflareAccess.js";

const MAX_JSON_BYTES = 10 * 1024 * 1024;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function apiError(error) {
  const status = error.status || 500;
  const message = error.code === "PGRST205"
    ? "جداول Supabase غير جاهزة؛ نفّذ ملف supabase/schema.sql أولًا."
    : error.message || "حدث خطأ أثناء الاتصال بقاعدة البيانات.";
  return json({ error: message, code: error.code }, status);
}

function applyCors(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = new Set(
    (env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  allowed.add(new URL(request.url).origin);

  if (origin && !allowed.has(origin)) {
    return { response: json({ error: "هذا المصدر غير مسموح به." }, 403) };
  }

  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return { response: new Response(null, { status: 204, headers }) };
  }
  return { headers };
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_JSON_BYTES) throw Object.assign(new Error("حجم الطلب أكبر من الحد المسموح."), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw Object.assign(new Error("حجم الطلب أكبر من الحد المسموح."), { status: 413 });
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw Object.assign(new Error("صيغة JSON غير صالحة."), { status: 400 });
  }
}

async function authorize(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return json({ error: "يلزم تسجيل الدخول عبر Cloudflare Access." }, 401);

  try {
    const issuer = getCloudflareAccessIssuer(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN || "");
    const valid = await verifyCloudflareAccessJwt(token, {
      issuer,
      audience: env.CLOUDFLARE_ACCESS_AUD
    });
    return valid ? null : json({ error: "رمز Cloudflare Access غير صالح." }, 401);
  } catch (error) {
    console.error("Cloudflare Access verification failed:", error.message);
    return json({ error: "تعذر التحقق من جلسة Cloudflare Access." }, 503);
  }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const cors = applyCors(request, env);
  if (cors.response) return cors.response;

  if (request.method === "GET" && path === "/api/health") {
    try {
      const repository = createSupabaseRepository(env);
      await repository.checkConnection();
      return json({ ok: true, supabase: "connected" }, 200, cors.headers);
    } catch (error) {
      return json({
        ok: false,
        error: error.message || "تعذر الاتصال بقاعدة Supabase."
      }, error.status || 503, cors.headers);
    }
  }

  const denied = await authorize(request, env);
  if (denied) return denied;

  let repository;
  try {
    repository = createSupabaseRepository(env);
  } catch (error) {
    return apiError(error);
  }

  try {
    if (request.method === "GET" && path === "/api/state") {
      return json(await repository.readState(), 200, cors.headers);
    }
    if (request.method === "GET" && path === "/api/products") {
      return json(await repository.listProducts(), 200, cors.headers);
    }
    if (request.method === "GET" && path === "/api/auth/me") {
      const { data: auth, error } = await verifyAuth(request, {
        auth: "user",
        env: createSupabaseEnv(env)
      });
      if (error) return json({ error: error.message, code: error.code }, error.status, cors.headers);

      const supabase = createContextClient({
        auth: { token: auth.token, keyName: auth.keyName },
        env: createSupabaseEnv(env)
      });
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) return json({ error: "تعذر التحقق من المستخدم." }, 401, cors.headers);
      return json({ user: { id: data.user.id, email: data.user.email ?? null } }, 200, cors.headers);
    }
    if (request.method === "POST" && path === "/api/products") {
      const product = await repository.addProduct((await readJson(request)).name);
      return json({ name: product.name }, product.created ? 201 : 200, cors.headers);
    }
    if (request.method === "POST" && path === "/api/workers") {
      const result = await repository.createWorker(await readJson(request));
      if (result.duplicate) return json({ error: "يوجد سجل لهذا العامل في التاريخ نفسه." }, 409, cors.headers);
      return json(result.worker, 201, cors.headers);
    }
    if (request.method === "POST" && path === "/api/workers/import") {
      const body = await readJson(request);
      return json(await repository.importWorkers(Array.isArray(body.workers) ? body.workers : []), 200, cors.headers);
    }
    if (request.method === "POST" && path === "/api/migrate") {
      const body = await readJson(request);
      const workers = Array.isArray(body.workers) ? body.workers : [];
      const summaries = Array.isArray(body.dailySummaries) ? body.dailySummaries : [];
      return json(await repository.migrateLegacyState(workers, summaries), 200, cors.headers);
    }

    const workerMatch = path.match(/^\/api\/workers\/([^/]+)$/);
    if (workerMatch && request.method === "PUT") {
      const result = await repository.updateWorker(decodeURIComponent(workerMatch[1]), await readJson(request));
      if (!result) return json({ error: "السجل غير موجود." }, 404, cors.headers);
      if (result.duplicate) return json({ error: "يوجد سجل آخر لهذا العامل في التاريخ نفسه." }, 409, cors.headers);
      return json(result.worker, 200, cors.headers);
    }
    if (workerMatch && request.method === "DELETE") {
      if (!await repository.deleteWorker(decodeURIComponent(workerMatch[1]))) {
        return json({ error: "السجل غير موجود." }, 404, cors.headers);
      }
      return new Response(null, { status: 204, headers: cors.headers });
    }

    const summaryMatch = path.match(/^\/api\/daily-summaries\/([^/]+)$/);
    if (summaryMatch && request.method === "PUT") {
      const date = decodeURIComponent(summaryMatch[1]);
      const body = await readJson(request);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(body.items)) {
        return json({ error: "بيانات الملخص غير صالحة." }, 400, cors.headers);
      }
      return json(await repository.saveDailySummary(date, body.items), 200, cors.headers);
    }
    if (summaryMatch && request.method === "DELETE") {
      await repository.deleteDailySummary(decodeURIComponent(summaryMatch[1]));
      return new Response(null, { status: 204, headers: cors.headers });
    }
    return json({ error: "المسار غير موجود." }, 404, cors.headers);
  } catch (error) {
    return apiError(error);
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Worker request failed:", error.message);
      return json({ error: "حدث خطأ أثناء معالجة الطلب." }, 500);
    }
  }
};
