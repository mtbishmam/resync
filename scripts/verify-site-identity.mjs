import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const identity = JSON.parse(
  await readFile(resolve(root, "site-identity.json"), "utf8"),
);

const target = process.env.RESYNC_TARGET_HOST ?? process.argv[2];

if (identity.productName !== "ReSync") {
  throw new Error("Refusing to continue: the product name is not ReSync.");
}

if (
  identity.canonicalHostname !== "resync.mtbishmam.chatgpt.site" ||
  identity.hostnameIsHardRequirement !== true ||
  identity.allowGeneratedHostname !== false
) {
  throw new Error(
    "Refusing to continue: ReSync's canonical hostname guard was changed.",
  );
}

if (!target) {
  throw new Error(
    `Refusing to continue without an explicit target hostname. Pass ${identity.canonicalHostname} as the argument or set RESYNC_TARGET_HOST.`,
  );
}

if (target !== identity.canonicalHostname) {
  throw new Error(
    `Refusing to continue: target hostname ${target} does not match ${identity.canonicalHostname}. Generated or legacy hostnames are not allowed.`,
  );
}

console.log(`Site identity verified: ${identity.productName} → ${target}`);
