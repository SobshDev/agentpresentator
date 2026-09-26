import { connection } from "next/server";
import Experience from "@/components/Experience";
import { config } from "@/lib/config";

export default async function Page() {
  // Rendered per request so the CSP nonce from proxy.ts applies and runtime env vars are read.
  await connection();
  return <Experience turnstileSiteKey={config.turnstileSiteKey} />;
}
