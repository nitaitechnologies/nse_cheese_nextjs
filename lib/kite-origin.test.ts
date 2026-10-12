import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserUrl, kiteCallbackOrigin } from "./kite-origin";

describe("kite callback origin", () => {
  it("rewrites local http callbacks to 127.0.0.1", () => {
    const origin = kiteCallbackOrigin("http://localhost:3000/api/kite/callback");
    assert.equal(origin?.origin, "http://127.0.0.1:3000");
    assert.equal(origin?.pathname, "/api/kite/callback");
  });

  it("keeps an already registered loopback callback", () => {
    const origin = kiteCallbackOrigin("http://127.0.0.1:3000/api/kite/callback");
    assert.equal(origin?.host, "127.0.0.1:3000");
  });

  it("leaves a public https callback unchanged", () => {
    const origin = kiteCallbackOrigin("https://nitaidemo.in.net/api/kite/callback");
    assert.equal(origin?.origin, "https://nitaidemo.in.net");
  });

  it("ignores a missing or invalid redirect", () => {
    assert.equal(kiteCallbackOrigin(undefined), null);
    assert.equal(kiteCallbackOrigin("not a url"), null);
  });
});

describe("browser url", () => {
  it("follows the host header between localhost and 127.0.0.1", () => {
    const request = new Request("http://localhost:3000/api/kite/callback", {
      headers: { host: "127.0.0.1:3000" },
    });
    assert.equal(browserUrl(request).origin, "http://127.0.0.1:3000");
  });

  it("does not follow an unrelated host header", () => {
    const request = new Request("http://localhost:3000/api/kite/callback", {
      headers: { host: "evil.example" },
    });
    assert.equal(browserUrl(request).origin, "http://localhost:3000");
  });
});
