import { getStore } from "@netlify/blobs";
import { normalize, publicView } from "../lib/shared.mjs";

export default async () => {
  const store = getStore("hri-site");
  const users = (await store.get("users", { type: "json" })) ?? [];
  const data = publicView(normalize(await store.get("content", { type: "json" })), users);
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/content" };
