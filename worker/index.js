// 静的アセットの前段に置く最小の Worker。
// /_monitor/health だけを受け持ち、それ以外はすべて静的アセットに任せる。
// 監視: https://monitor.wagaya.org （Monitor Health Check Protocol v1）

const SERVICE = { id: "nekomitsu", name: "ねこみつ", environment: "production" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/_monitor/health") return health(url, env);
    return env.ASSETS.fetch(request);
  },
};

async function health(url, env) {
  const now = new Date().toISOString();
  let status = "ok";
  let message;
  try {
    const res = await env.ASSETS.fetch(new URL("/", url));
    if (!res.ok) {
      status = "critical";
      message = `トップページが ${res.status} を返しました`;
    } else {
      message = `${res.status} OK`;
    }
  } catch (err) {
    status = "critical";
    message = `トップページを取得できません: ${err instanceof Error ? err.message : String(err)}`;
  }

  const body = {
    protocol_version: "1.0",
    service: SERVICE,
    generated_at: now,
    status,
    checks: [
      { id: "web-root", type: "web", name: "トップページ応答", status, message, checked_at: now },
    ],
    alert_urls: [{ label: "GitHub リポジトリ", url: "https://github.com/onishi/nekomitsu" }],
  };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
