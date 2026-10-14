import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">DIBBS RFQ Browser</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Search and filter the Defense Logistics Agency&apos;s daily requests for quotation.
      </p>
      <Suspense fallback={<Status tone="pending" label="Checking database…" />}>
        <DatabaseStatus />
      </Suspense>
    </main>
  );
}

async function DatabaseStatus() {
  await connection();
  const started = performance.now();
  const ok = await getDb()
    .execute(sql`select 1`)
    .then(() => true)
    .catch(() => false);
  const ms = Math.round(performance.now() - started);
  return ok ? (
    <Status tone="ok" label={`Neon Postgres connected · ${ms} ms`} />
  ) : (
    <Status tone="error" label="Database unreachable" />
  );
}

function Status({ tone, label }: { tone: "ok" | "error" | "pending"; label: string }) {
  const dot = { ok: "bg-emerald-500", error: "bg-red-500", pending: "bg-neutral-400 animate-pulse" }[tone];
  return (
    <p className="mt-8 inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </p>
  );
}
