const USER_AGENT =
  "Mozilla/5.0 (compatible; dibbs-rfq-browser/0.1; +https://github.com/Summit-Studio-LLC/dibbs-rfq-browser)";

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/**
 * A minimal HTTP session for DIBBS.
 *
 * Both www.dibbs.bsm.dla.mil and dibbs2.bsm.dla.mil (file downloads) put a DoD
 * Warning & Consent banner in front of every page. It is an ASP.NET postback
 * that sets session cookies, so we keep a per-host cookie jar, follow redirects
 * by hand (cookies arrive on 302s), and click "OK" whenever the banner shows up.
 */
export class DibbsSession {
  private jar = new Map<string, Map<string, string>>();

  /** GET a DIBBS URL, accepting the consent banner if it intercepts the request. */
  async get(target: string): Promise<Buffer> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { res, url } = await this.request(new URL(target));
      if (!res.ok) throw new Error(`DIBBS returned ${res.status} for ${target}`);
      const body = Buffer.from(await res.arrayBuffer());
      const isConsentPage =
        (res.headers.get("content-type") ?? "").includes("text/html") && body.includes('id="butAgree"');
      if (!isConsentPage) return body;
      await this.acceptConsent(body.toString("latin1"), url);
    }
    throw new Error(`Could not get past the DoD consent banner for ${target}`);
  }

  private async acceptConsent(html: string, pageUrl: URL) {
    const action = html.match(/<form[^>]*action="([^"]+)"/i)?.[1];
    if (!action) throw new Error("DoD consent form not found");
    const fields = new URLSearchParams();
    for (const [, name, value] of html.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) {
      fields.set(name, decodeEntities(value));
    }
    fields.set("butAgree", "OK");
    await this.request(new URL(decodeEntities(action), pageUrl), { method: "POST", body: fields.toString() });
  }

  private async request(url: URL, init: { method?: string; body?: string } = {}) {
    let { method = "GET", body } = init;
    for (let hop = 0; hop < 8; hop++) {
      const res = await fetch(url, {
        method,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
        headers: {
          "user-agent": USER_AGENT,
          cookie: this.cookieHeader(url),
          ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
      });
      this.storeCookies(url, res);
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        method = "GET";
        body = undefined;
        continue;
      }
      return { res, url };
    }
    throw new Error(`Too many redirects fetching ${url}`);
  }

  private cookieHeader(url: URL) {
    const cookies = this.jar.get(url.hostname);
    return cookies ? [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") : "";
  }

  private storeCookies(url: URL, res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const cookies = this.jar.get(url.hostname) ?? new Map<string, string>();
      cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      this.jar.set(url.hostname, cookies);
    }
  }
}
