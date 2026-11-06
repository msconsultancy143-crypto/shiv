export const apiBase = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "https://shiv-tsyz.onrender.com" : "")
).replace(/\/+$/, "");

export async function api(path, options = {}) {
  const token = localStorage.getItem("counter_token");
  const headers = new Headers(options.headers || {});
  if (
    options.body !== undefined &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof ArrayBuffer)
  ) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${apiBase}/api${path}`, { ...options, headers });
  } catch {
    throw new Error("Cannot connect to the backend. Check that the API server is running.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      localStorage.removeItem("counter_token");
      window.dispatchEvent(new Event("counter:unauthorized"));
    }
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

export const jsonBody = (value) => JSON.stringify(value);
