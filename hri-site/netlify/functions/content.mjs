import { getStore } from "@netlify/blobs";
import { normalize } from "../lib/shared.mjs";

export default async () => {
  const store = getStore("hri-site");
  const data = normalize(await store.get("content", { type: "json" }));
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/content" };
