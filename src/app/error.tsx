"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-semibold">Something went wrong loading RFQs.</h1>
      <p className="mt-2 text-sm text-muted-foreground">The database may be waking up. Try again in a moment.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
