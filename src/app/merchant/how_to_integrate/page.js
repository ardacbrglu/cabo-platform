"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import MerchantLayout from "@/components/merchant/MerchantLayout";
import { useTranslation } from "@/hooks/useTranslation";

const COLOR_CABO = "#d1ffd0";

export default function HowToIntegratePage() {
  const t = useTranslation();

  // Fallback: çeviri yoksa İngilizceye düş
  const tt = (key, fallback) => {
    const v = t(key);
    return v === key ? (fallback ?? key) : v;
  };

  const clientSnippet = `<!-- Cabo Affiliate — Client Integration -->
<script>
// Identify the affiliate click (example)
// In real usage you set this when rendering product page or buy button.
window.CABO = window.CABO || {};
CABO.productCode = "<YOUR_PRODUCT_CODE>";
CABO.redirectToMerchant = function () {
  const url = new URL("https://yourshop.example/checkout");
  url.searchParams.set("cabo", CABO.productCode);
  // optional: pass along session info, utm params etc.
  // window.location.href = url.toString();
};
</script>
<button onclick="CABO.redirectToMerchant()">
  Buy Now
</button>`;

  const serverSnippet = `// Cabo Affiliate — Webhook (Node/Express example)
import crypto from "node:crypto";
import express from "express";

const app = express();
app.use(express.json());

const CABO_WEBHOOK_SECRET = process.env.CABO_WEBHOOK_SECRET || "<YOUR_SECRET>";

function safeEquals(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

app.post("/api/cabo/webhook", (req, res) => {
  const sig = req.header("x-cabo-signature") || "";
  const payload = JSON.stringify(req.body || {});
  const expected = crypto.createHmac("sha256", CABO_WEBHOOK_SECRET).update(payload).digest("hex");
  if (!safeEquals(sig, expected)) {
    return res.status(401).json({ ok: false, error: "bad_signature" });
  }

  // TODO: persist order + commission, idempotency, etc.
  // req.body contains { orderId, productCode, amount, quantity, ... }
  return res.json({ ok: true });
});

app.listen(3000);`;

  const [copied, setCopied] = useState({ client: false, server: false });

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((s) => ({ ...s, [key]: true }));
      setTimeout(() => setCopied((s) => ({ ...s, [key]: false })), 1200);
    } catch {
      // no-op
    }
  };

  return (
    <MerchantLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: COLOR_CABO }}>
          {tt("howto.title", "How to Integrate Cabo Affiliate")}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {tt(
            "howto.subtitle",
            "Follow the steps below to connect your product pages and confirm completed sales with webhooks."
          )}
        </p>
      </div>

      {/* Download Kit (disabled for now) */}
      <div className="mb-8 flex items-center gap-3">
        <button
          type="button"
          disabled
          className="bg-[#1b1f1b] border border-[#2c3b2c] text-[#9fd29f] px-4 py-2 rounded opacity-70 cursor-not-allowed"
          title={tt("howto.downloadDisabledNote", "Not available yet — coming soon.")}
        >
          {tt("howto.downloadKit", "Download Integration Kit")}
        </button>
        <span className="text-xs text-gray-500">
          {tt("howto.downloadDisabledNote", "Not available yet — coming soon.")}
        </span>
      </div>

      {/* Overview */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-[#d1ffd0] bg-[#161a16] border border-[#243823] rounded-lg px-4 py-3">
          {tt("howto.section.overview.title", "Overview")}
        </h2>
        <div className="mt-3 text-sm text-gray-300">
          {tt(
            "howto.section.overview.p1",
            "Integration has two parts: (1) client-side click/redirect with your product code, (2) server-side webhook to confirm conversions securely."
          )}
        </div>
      </section>

      {/* Client-side */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-[#d1ffd0] bg-[#161a16] border border-[#243823] rounded-t-lg px-4 py-3">
          {tt("howto.section.client.title", "Client-side (Product Page)")}
        </h2>
        <div className="border border-t-0 border-[#243823] rounded-b-lg p-4 bg-[#141614] space-y-3 text-sm">
          <ol className="list-decimal pl-5 space-y-1 text-gray-300">
            <li>{tt("howto.section.client.step1", "Place the snippet on your product page and set your productCode.")}</li>
            <li>{tt("howto.section.client.step2", "Trigger the redirect function on the purchase button (it appends your product code).")}</li>
            <li>{tt("howto.section.client.step3", "Keep UTM/session info if you need it — pass only what is necessary.")}</li>
          </ol>

          <div className="mt-3 text-xs text-gray-500">{tt("howto.code.clientSnippetLabel", "Client snippet (HTML/JS)")}</div>
          <div className="relative">
            <button
              type="button"
              onClick={() => copy(clientSnippet, "client")}
              className="absolute right-2 -top-10 text-[#7fda6a] hover:text-green-300 flex items-center gap-1 text-xs"
              title={tt("howto.copy", "Copy")}
            >
              <Copy size={14} />
              {copied.client ? tt("howto.copied", "Copied!") : tt("howto.copy", "Copy")}
            </button>
            <pre className="bg-[#0f130f] border border-[#243823] rounded-lg p-4 overflow-x-auto text-xs leading-5 text-[#d6ffd6]">
{clientSnippet}
            </pre>
          </div>
        </div>
      </section>

      {/* Server-side */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-[#d1ffd0] bg-[#161a16] border border-[#243823] rounded-t-lg px-4 py-3">
          {tt("howto.section.server.title", "Server-side (Webhook)")}
        </h2>
        <div className="border border-t-0 border-[#243823] rounded-b-lg p-4 bg-[#141614] space-y-3 text-sm">
          <ul className="list-disc pl-5 space-y-1 text-gray-300">
            <li>{tt("howto.section.server.webhookIntro", "When a sale is completed, Cabo calls your webhook with the order payload.")}</li>
            <li>{tt("howto.section.server.endpoint", "Expose a POST endpoint like /api/cabo/webhook that accepts JSON.")}</li>
            <li>{tt("howto.section.server.verifySig", "Verify the X-Cabo-Signature HMAC with your secret before trusting the payload.")}</li>
          </ul>

          <div className="mt-3 text-xs text-gray-500">{tt("howto.code.serverSnippetLabel", "Server snippet (Node/Express)")}</div>
          <div className="relative">
            <button
              type="button"
              onClick={() => copy(serverSnippet, "server")}
              className="absolute right-2 -top-10 text-[#7fda6a] hover:text-green-300 flex items-center gap-1 text-xs"
              title={tt("howto.copy", "Copy")}
            >
              <Copy size={14} />
              {copied.server ? tt("howto.copied", "Copied!") : tt("howto.copy", "Copy")}
            </button>
            <pre className="bg-[#0f130f] border border-[#243823] rounded-lg p-4 overflow-x-auto text-xs leading-5 text-[#d6ffd6]">
{serverSnippet}
            </pre>
          </div>
        </div>
      </section>

      {/* Testing */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-[#d1ffd0] bg-[#161a16] border border-[#243823] rounded-lg px-4 py-3">
          {tt("howto.section.test.title", "Testing & Tips")}
        </h2>
        <div className="mt-3 text-sm text-gray-300">
          {tt(
            "howto.section.test.p1",
            "Test in a staging environment first. Log payloads, validate signatures, and rotate your webhook secret periodically."
          )}
        </div>
      </section>
    </MerchantLayout>
  );
}
