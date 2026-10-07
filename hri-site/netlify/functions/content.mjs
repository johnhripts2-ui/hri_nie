import { getStore } from "@netlify/blobs";
import { DEFAULTS } from "../lib/shared.mjs";

export default async () => {
  const store = getStore("hri-site");
  const data = (await store.get("content", { type: "json" })) ?? DEFAULTS;
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/content" };
