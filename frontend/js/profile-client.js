window.profileClient = (() => {
  const config = window.ALUMNILINK ?? {};
  const status = document.getElementById("status");
  const tokenKey = config.DEMO_SESSION_URL ? "alumnilink.accessToken" : "token";
  let token = sessionStorage.getItem(tokenKey);
  function message(text, error = false, target = status) {
    target.textContent = text;
    target.classList.toggle("error", error);
  }
  async function request(path, method = "GET", body) {
    if (!token)
      throw new Error("Sign in through the Identity service to continue.");
    // Only the explicit local demo config enables renewal. Normal team login is unchanged.
    if (config.DEMO_SESSION_URL) {
      const endpoint = new URL(config.DEMO_SESSION_URL);
      if (location.origin !== "http://localhost:4566" || endpoint.hostname !== "127.0.0.1" || endpoint.protocol !== "http:")
        throw new Error("Local demo sessions are available only on localhost.");
      try {
        const renewed = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!renewed.ok) throw new Error("Session unavailable");
        const session = await renewed.json();
        if (typeof session.token !== "string") throw new Error("Session unavailable");
        token = session.token;
        sessionStorage.setItem(tokenKey, token);
      } catch {
        throw new Error("Start the local demo in PowerShell to continue testing.");
      }
    }
    const photoUpload = body instanceof Blob;
    let response;
    try {
      response = await fetch((config.PROFILE_API_URL ?? "") + path, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          ...(body ? { "Content-Type": photoUpload ? body.type : "application/json" } : {}),
        },
        body: photoUpload ? body : JSON.stringify(body),
      });
    } catch {
      throw new Error("Profile service is unavailable. Please retry.");
    }
    if (response.status === 204) return null;
    if (response.ok && response.headers.get("Content-Type") === "image/webp") {
      return response.blob();
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(result?.error?.message ?? "The request could not be completed.");
      error.code = result?.error?.code;
      throw error;
    }
    return result;
  }
  document.getElementById("logout").addEventListener("click", () => {
    token = null;
    sessionStorage.removeItem(tokenKey);
    if (config.LOGIN_URL) window.location.assign(config.LOGIN_URL);
    else window.location.reload();
  });
  return { request, message };
})();
