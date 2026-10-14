import { ExternalLinkIcon, FileTextIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { type Filters, hrefWith, lineItemId } from "@/lib/rfqs/filters";
import {
  AMSC,
  daysBetween,
  dibbsLinks,
  formatDate,
  formatNsn,
  officeLabel,
  POINTS,
  SET_ASIDE_DESCRIPTIONS,
  SOLICITATION_TYPE_DESCRIPTIONS,
  SOLICITATION_TYPES,
} from "@/lib/rfqs/labels";
import type { RfqDetail } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";
import { closingTone, relativeDays } from "./closing";
import { CopyButton } from "./copy-button";
import { SetAside } from "./results-list";

const FIELD_LABELS: Record<string, string> = {
  returnByDate: "Return-by date",
  quantity: "Quantity",
  nomenclature: "Item name",
  setAside: "Set-aside",
  solicitationType: "Award type",
  requiredDeliveryDays: "Required delivery",
  fobPoint: "FOB",
  inspectionPoint: "Inspection",
  buyerCode: "Buyer",
};

export function DetailPanel({ item, filters, today }: { item: RfqDetail | null; filters: Filters; today: string }) {
  const close = hrefWith(filters, { id: null });
  if (!item) {
    return (
      <div className="p-6 text-sm">
        <p className="font-semibold">That line item isn&apos;t in the loaded data.</p>
        <Link href={close} scroll={false} className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
          Close
        </Link>
      </div>
    );
  }
  const links = dibbsLinks(item.solicitationNumber, item.nsn);
  const isNsn = item.itemType === "1";
  const nsn = isNsn ? formatNsn(item.nsn) : item.nsn;
  const daysLeft = daysBetween(today, item.returnByDate);
  const tone = closingTone(daysLeft);

  return (
    <article>
      <header className="sticky top-0 z-10 border-b bg-card/95 px-5 pt-4 pb-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Solicitation</span>
            <span className="ml-1.5 truncate font-mono text-sm font-semibold">{item.solicitationNumber}</span>
            <CopyButton value={item.solicitationNumber} label="solicitation number" />
          </div>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={close} scroll={false} aria-label="Close details">
              <XIcon />
            </Link>
          </Button>
        </div>
        <h2 className="mt-1.5 text-xl leading-snug font-semibold tracking-tight">{item.nomenclature.replace(/,+$/, "")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {item.fsc ? `${item.fsc} · ${item.fscName ?? "Unknown class"}` : "Part-numbered item"}
        </p>
      </header>

      <div className="space-y-6 px-5 py-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
          <Stat
            label="Closes"
            value={formatDate(item.returnByDate)}
            sub={relativeDays(daysLeft)}
            className={cn(tone === "urgent" && "text-red-700 dark:text-red-300", tone === "soon" && "text-amber-700 dark:text-amber-300")}
          />
          <Stat label="Quantity" value={item.quantity.toLocaleString()} sub={item.unitOfIssue} />
          <Stat
            label="Required delivery"
            value={item.requiredDeliveryDays !== null ? `${item.requiredDeliveryDays} days` : "—"}
            sub="after award"
          />
          <Stat
            label="Eligibility"
            value={<SetAside code={item.setAside} className="text-sm" />}
            sub={item.setAside !== "N" && item.setAsidePct !== null ? `${item.setAsidePct}% set aside` : "Open to all vendors"}
            title={SET_ASIDE_DESCRIPTIONS[item.setAside]}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={links.record} target="_blank" rel="noreferrer">
                <ExternalLinkIcon /> Open on DIBBS
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={links.pdf} target="_blank" rel="noreferrer">
                <FileTextIcon /> Solicitation PDF
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={links.quote} target="_blank" rel="noreferrer">
                Quote
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={links.techDocs} target="_blank" rel="noreferrer">
                Tech docs
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">DIBBS shows a DoD consent notice once per session before opening these.</p>
        </div>

        <Group title="Identifiers">
          <Field label={isNsn ? "NSN" : "Part number"} copy={nsn} mono>
            {isNsn ? (
              <a href={links.nsn} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                {nsn}
              </a>
            ) : (
              nsn
            )}
          </Field>
          <Field label="PR number" copy={item.prNumber} mono>
            {item.prNumber}
          </Field>
          {item.lineNumber && (
            <Field label="Line" mono>
              {item.lineNumber}
            </Field>
          )}
        </Group>

        <Group title="Terms">
          <Field label="Award type" hint={SOLICITATION_TYPE_DESCRIPTIONS[item.solicitationType ?? ""]}>
            {SOLICITATION_TYPES[item.solicitationType ?? ""] ?? "—"}
          </Field>
          <Field label="Acquisition method" hint={item.amsc ? AMSC[item.amsc] : undefined}>
            {item.amsc ? `AMSC ${item.amsc}` : "—"}
          </Field>
          <Field label="FOB">{POINTS[item.fobPoint ?? ""] ?? "—"}</Field>
          <Field label="Inspection">{POINTS[item.inspectionPoint ?? ""] ?? "—"}</Field>
        </Group>

        <Group title="Buyer">
          <Field label="Buying office" hint={item.buyingOffice}>
            {officeLabel(item.buyingOffice)}
          </Field>
          {item.buyerCode && (
            <Field label="Buyer code" copy={item.buyerCode} mono>
              {item.buyerCode}
            </Field>
          )}
          <Field label="First posted">{formatDate(item.postedDate, { weekday: "short", month: "short", day: "numeric" })}</Field>
          <Field label="Last seen in DIBBS files">{formatDate(item.lastSeenDate, { weekday: "short", month: "short", day: "numeric" })}</Field>
        </Group>

        <Group title={`Approved sources · ${item.sources.length}`}>
          {item.sources.length ? (
            <>
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 bg-muted/50 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <span>CAGE</span>
                <span>Part number</span>
              </div>
              {item.sources.map((s) => (
                <div key={`${s.cage}${s.partNumber}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 px-3 py-1.5 font-mono text-sm">
                  <span className="flex items-center gap-0.5">
                    {s.cage}
                    <CopyButton value={s.cage} label="CAGE code" />
                  </span>
                  <span className="flex min-w-0 items-center gap-0.5">
                    <span className="break-all">{s.partNumber}</span>
                    <CopyButton value={s.partNumber} label="part number" />
                  </span>
                </div>
              ))}
            </>
          ) : (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              None published. The item may be competitive, or sources are listed only in the solicitation.
            </p>
          )}
        </Group>

        {item.changes.length > 0 && (
          <Group title="History">
            {item.changes.map((c) => (
              <Field key={c.id} label={formatDate(c.seenDate)}>
                {FIELD_LABELS[c.field] ?? c.field}:{" "}
                {c.field === "returnByDate" && c.oldValue && c.newValue
                  ? `${formatDate(c.oldValue)} → ${formatDate(c.newValue)}`
                  : `${c.oldValue ?? "—"} → ${c.newValue ?? "—"}`}
              </Field>
            ))}
          </Group>
        )}

        {item.siblings.length > 0 && (
          <Group title={`Other lines on this solicitation · ${item.siblings.length}`}>
            {item.siblings.map((s) => (
              <Link
                key={s.prNumber}
                href={hrefWith(filters, { id: lineItemId(item.solicitationNumber, s.prNumber) })}
                scroll={false}
                className="flex justify-between gap-3 px-3 py-2 text-sm hover:bg-accent/60"
              >
                <span className="truncate font-medium">{s.nomenclature.replace(/,+$/, "")}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {s.quantity.toLocaleString()} {s.unitOfIssue}
                </span>
              </Link>
            ))}
          </Group>
        )}

        {item.sameNsn.length > 0 && (
          <Group title="Other open RFQs for this NSN">
            {item.sameNsn.map((s) => (
              <Link
                key={`${s.solicitationNumber}${s.prNumber}`}
                href={hrefWith(filters, { id: lineItemId(s.solicitationNumber, s.prNumber) })}
                scroll={false}
                className="flex justify-between gap-3 px-3 py-2 text-sm hover:bg-accent/60"
              >
                <span className="font-mono font-medium">{s.solicitationNumber}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {s.quantity.toLocaleString()} {s.unitOfIssue} · closes {formatDate(s.returnByDate)}
                </span>
              </Link>
            ))}
          </Group>
        )}
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  sub,
  title,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className="bg-card px-3.5 py-3" title={title}>
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-1 text-lg leading-tight font-semibold tabular-nums", className)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="divide-y overflow-hidden rounded-lg border">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  copy,
  mono,
  children,
}: {
  label: string;
  hint?: string;
  copy?: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-0.5 text-right">
        <span className="min-w-0">
          <span className={cn("block font-medium", mono && "font-mono")}>{children}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
        {copy && <CopyButton value={copy} label={label} className="-my-0.5" />}
      </span>
    </div>
  );
}
