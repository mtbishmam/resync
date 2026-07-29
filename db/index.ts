import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return env.DB;
}

export async function getR2() {
  const { env } = await import("cloudflare:workers");
  if (!env.R2) {
    throw new Error(
      "Cloudflare R2 binding `R2` is unavailable. Set the `r2` field in .openai/hosting.json to `R2` or let your control plane inject the real binding values before using source storage.",
    );
  }

  return env.R2;
}

export function getDb() {
  return getD1().then((d1) => drizzle(d1, { schema }));
}
