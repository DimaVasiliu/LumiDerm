export const testJwks = {
  keys: [
    {
      kty: "RSA",
      n: "qz1OD1EV4E0NKesLbJT2QmU3PDfw8ebLA8GlnsV8eQgiiZlEEEDkFB2Bn-Peh6t5WsIsujwqTp3Upn01EMXX6YwN11zB0w3YgPYkXkqqtTrMJqU92dUdGl0eaU3JtJIs6ptDwh1SHuCfenp3hVcJMq2x0iHwolEoAl4aS-rSt_1pc3kfr5WZVdwvaw2cQ0JZAsS2WNzv_gCq4cmo4RcxWKdl46sPmxqk_MTcbNaJuep6dO8liN5c0BYFKAXaGCUgk4V-Jq4pfk9H63_mEvd_w4bNFIgM5MxFSJT8xGhw9npxrJ9lZDUYVljv_VFqcrG6Elfe_IIJvJs76htS-IKV8Q",
      e: "AQAB",
      kid: "test-access-key",
      alg: "RS256",
      use: "sig",
    },
  ],
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://test-team.cloudflareaccess.com/cdn-cgi/access/certs") {
    return Response.json(testJwks);
  }
  return originalFetch(url, options);
};

const tokens = {
  "owner@example.com":
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QtYWNjZXNzLWtleSJ9.eyJpc3MiOiJodHRwczovL3Rlc3QtdGVhbS5jbG91ZGZsYXJlYWNjZXNzLmNvbSIsImF1ZCI6InRlc3QtYXVkaWVuY2UiLCJleHAiOjQxMDI0NDQ4MDAsIm5iZiI6MCwiaWF0IjoxNzAwMDAwMDAwLCJzdWIiOiJzdWI6b3duZXJAZXhhbXBsZS5jb20iLCJlbWFpbCI6Im93bmVyQGV4YW1wbGUuY29tIn0.MPaK0IcZj16zTluF0o3iEnGmhZsmbsKY4E-uiV6AydCr6xvTF3nW42Jn6K4gwN10ZXuCQ2T-fguRNlBYW6cCrizNt_6CtqbfFwW-sibGV_R5ikr16bdV14cjcow8SoRK0ue-nj2pH1F3-AKcSPZX40Vq7xdXb8NrELs4zcBpc8uo0iGgu9qtpwx70rJIbR1caJrxTJO3VpgUv4MCKTRL7MCLv0_qcI_ZLZ4afw3Xqq6rtUCzUjTdq1utJkEL4tb08GjabfoeIrzSPMkUNiGonS1tKPSnC0lbQqjLz8y2yRfk-bOPDpg6Lzf5zn72EU-qO7_HK5QbiZFnS8gu9Uwftg",
  "assistant@example.com":
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QtYWNjZXNzLWtleSJ9.eyJpc3MiOiJodHRwczovL3Rlc3QtdGVhbS5jbG91ZGZsYXJlYWNjZXNzLmNvbSIsImF1ZCI6InRlc3QtYXVkaWVuY2UiLCJleHAiOjQxMDI0NDQ4MDAsIm5iZiI6MCwiaWF0IjoxNzAwMDAwMDAwLCJzdWIiOiJzdWI6YXNzaXN0YW50QGV4YW1wbGUuY29tIiwiZW1haWwiOiJhc3Npc3RhbnRAZXhhbXBsZS5jb20ifQ.AgdqjPldggzX9mUTRdZxHn5GhuqrZczoXjVRbQqmKlSYb6XL2_kEbiyITQmEwfZf2pBxnq_ZP1_1irTxiKayFbTjvz4KsCMqJB_Sjukca4-Orxrn35cMEbLYh59GOI-DUG28IaOkjMUJXOsR_Z4WnZEcRp1fixUQMCSqASD3b-rCN3iUclux0R_m9IU6PTbo02DsuhY4T8vxNKJFuBelY6cYjedL0wou-PgrjyfNkjh1MqUVFKq2TIggl2eKXAI_ILgFw-wjfko-pgBKR5ec80KwtWjbDiJIgMb0Rfof53pFY3ANkgFRHqppH0_5laPaRuaZ79c8C08rYrK0OU9ecA",
  "help@example.com":
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QtYWNjZXNzLWtleSJ9.eyJpc3MiOiJodHRwczovL3Rlc3QtdGVhbS5jbG91ZGZsYXJlYWNjZXNzLmNvbSIsImF1ZCI6InRlc3QtYXVkaWVuY2UiLCJleHAiOjQxMDI0NDQ4MDAsIm5iZiI6MCwiaWF0IjoxNzAwMDAwMDAwLCJzdWIiOiJzdWI6aGVscEBleGFtcGxlLmNvbSIsImVtYWlsIjoiaGVscEBleGFtcGxlLmNvbSJ9.AUheHUvTp2F_I--Ez9X_Qh8gMxlFCZjqxkbRoeKyEUBSK-IYdNinIOeGy5GVBNWkvIn2uOu-7T2H2l-VBxGRyOOf0pjCs9ufNYqw-6O-o52buipx9pSMc4bl0rR7iwavr23CW63O9RMFdFB14djXp734EWbKbhszzrIGQioDQnnVqC2UTCWmpnXjSRw34UV7a-Hxx7S5vErk78OpXhCHn0_uDwB_jm3Io5R7oQqefq-9hFCAKYyUNWA5PQlfU83k6bjMoeYX7kvOeGA3MXCgLpnqfvmrNMw_BC13jJ9GoSvn1rcPlvJsBke-YNHOPlDIi_wWN-mRpFZ3GC16paNraQ",
};

export function accessEnv(extra = {}) {
  return {
    CF_ACCESS_TEAM_NAME: "test-team",
    CF_ACCESS_AUD: "test-audience",
    ...extra,
  };
}

export function accessHeaders(email = "owner@example.com") {
  return { "Cf-Access-Jwt-Assertion": tokens[email] };
}

export const invalidAccessHeaders = {
  "Cf-Access-Jwt-Assertion": tokens["owner@example.com"].slice(0, -1) + "x",
};
