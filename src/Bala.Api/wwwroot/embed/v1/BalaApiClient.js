import { BalaUtils } from "./BalaUtils.js";

export class BalaApiClient {
  constructor({ apiBase, logger, timeoutMs = 8000, retryCount = 2 }) {
    this.apiBase = apiBase;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.retryCount = retryCount;
  }

  async getArticleByUrl(url, refresh) {
    const endpoint = `${this.apiBase}/v1/articles/by-url?url=${encodeURIComponent(url)}&refresh=${refresh}`;
    const response = await this.fetchJson(endpoint, { method: "GET" });
    if (!response.ok) {
      return {
        ok: false,
        error: response.error || { message: "Failed to fetch article" },
      };
    }
    return { ok: true, data: response.data };
  }

  async postListenEvent(payload) {
    const endpoint = `${this.apiBase}/v1/events/listen`;
    const response = await this.fetchJson(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      1,
    );
    if (!response.ok) {
      this.logger?.warn(
        "analytics post failed",
        response.error || response.status,
      );
    }
    return response.ok;
  }

  async fetchJson(url, options, retryCount = this.retryCount) {
    let attempt = 0;
    while (attempt <= retryCount) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");
        const payload = isJson ? await response.json() : null;
        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            error: payload?.error || {
              message: payload?.message || "Request failed",
            },
          };
        }
        return payload?.success === false
          ? { ok: false, error: payload.error || { message: "Request failed" } }
          : { ok: true, data: payload?.data ?? payload };
      } catch (error) {
        clearTimeout(timer);
        if (attempt >= retryCount) {
          return {
            ok: false,
            error: { message: error?.message || "Network error" },
          };
        }
        await BalaUtils.sleep(300 + attempt * 300);
      }
      attempt += 1;
    }
    return { ok: false, error: { message: "Request failed" } };
  }
}
