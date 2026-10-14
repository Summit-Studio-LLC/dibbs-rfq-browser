import { ExternalLinkIcon, FileTextIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { type Filters, hrefWith, lineItemId } from "@/lib/rfqs/filters";
import {
  AMSC,
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
import { Closing } from "./closing";
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
        <p className="font-medium">That line item isn&apos;t in the loaded data.</p>
        <Link href={close} scroll={false} className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
          Close
        </Link>
      </div>
    );
  }
  const links = dibbsLinks(item.solicitationNumber, item.nsn);
  const isNsn = item.itemType === "1";

  return (
    <article className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg leading-tight font-semibold">{item.nomenclature.replace(/,+$/, "")}</h2>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={close} scroll={false} aria-label="Close details">
              <XIcon />
            </Link>
          </Button>
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          {item.solicitationNumber}
          {item.lineNumber && ` · line ${item.lineNumber}`} · PR {item.prNumber}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <a href={links.record} target="_blank" rel="noreferrer">
            <ExternalLinkIcon /> Open on DIBBS
          </a>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={links.pdf} target="_blank" rel="noreferrer">
            <FileTextIcon /> Solicitation PDF
          </a>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={links.quote} target="_blank" rel="noreferrer">
            Quote on DIBBS
          </a>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={links.techDocs} target="_blank" rel="noreferrer">
            Tech docs
          </a>
        </Button>
      </div>
      <p className="-mt-4 text-xs text-muted-foreground">DIBBS asks you to accept a DoD notice once per session before opening these.</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Fact label="Return by">
          <Closing date={item.returnByDate} today={today} />
        </Fact>
        <Fact label="Quantity">
          <span className="tabular-nums">
            {item.quantity.toLocaleString()} {item.unitOfIssue}
          </span>
        </Fact>
        <Fact label="Required delivery">{item.requiredDeliveryDays !== null ? `${item.requiredDeliveryDays} days after award` : "—"}</Fact>
        <Fact label="Set-aside" title={SET_ASIDE_DESCRIPTIONS[item.setAside]}>
          <SetAside code={item.setAside} />
          {item.setAside !== "N" && item.setAsidePct !== null && item.setAsidePct !== 100 && ` ${item.setAsidePct}%`}
        </Fact>
        <Fact label="Award type" title={SOLICITATION_TYPE_DESCRIPTIONS[item.solicitationType ?? ""]}>
          {SOLICITATION_TYPES[item.solicitationType ?? ""] ?? "—"}
        </Fact>
        <Fact label="AMSC">
          {item.amsc ? (
            <>
              <span className="font-mono">{item.amsc}</span> · {AMSC[item.amsc] ?? "Unknown code"}
            </>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label={isNsn ? "NSN" : "Part number"}>
          {isNsn ? (
            <a href={links.nsn} target="_blank" rel="noreferrer" className="font-mono underline-offset-4 hover:underline">
              {formatNsn(item.nsn)}
            </a>
          ) : (
            <span className="font-mono">{item.nsn}</span>
          )}
        </Fact>
        <Fact label="Supply class">{item.fsc ? `${item.fsc} · ${item.fscName ?? "Unknown"}` : "—"}</Fact>
        <Fact label="FOB · Inspection">
          {POINTS[item.fobPoint ?? ""] ?? "—"} · {POINTS[item.inspectionPoint ?? ""] ?? "—"}
        </Fact>
        <Fact label="Buying office">
          {officeLabel(item.buyingOffice)}
          {item.buyerCode && <span className="text-muted-foreground"> · buyer {item.buyerCode}</span>}
        </Fact>
        <Fact label="First posted">{formatDate(item.postedDate, { weekday: "short", month: "short", day: "numeric" })}</Fact>
        <Fact label="Last seen in DIBBS files">{formatDate(item.lastSeenDate, { weekday: "short", month: "short", day: "numeric" })}</Fact>
      </dl>

      <Section title={`Approved sources (${item.sources.length})`}>
        {item.sources.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">CAGE</th>
                <th className="py-1 font-medium">Part number</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {item.sources.map((s) => (
                <tr key={`${s.cage}${s.partNumber}`} className="border-t">
                  <td className="py-1.5 pr-4">{s.cage}</td>
                  <td className="py-1.5 break-all">{s.partNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">
            None published. The item may be competitive, or sources are listed only in the solicitation.
          </p>
        )}
      </Section>

      {item.changes.length > 0 && (
        <Section title="History">
          <ul className="space-y-1 text-sm">
            {item.changes.map((c) => (
              <li key={c.id}>
                <span className="text-muted-foreground">{formatDate(c.seenDate)}:</span> {FIELD_LABELS[c.field] ?? c.field}{" "}
                {c.field === "returnByDate" && c.oldValue && c.newValue
                  ? `${formatDate(c.oldValue)} → ${formatDate(c.newValue)}`
                  : `${c.oldValue ?? "—"} → ${c.newValue ?? "—"}`}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {item.siblings.length > 0 && (
        <Section title={`Other lines on this solicitation (${item.siblings.length})`}>
          <ul className="divide-y text-sm">
            {item.siblings.map((s) => (
              <li key={s.prNumber}>
                <Link
                  href={hrefWith(filters, { id: lineItemId(item.solicitationNumber, s.prNumber) })}
                  scroll={false}
                  className="flex justify-between gap-3 py-1.5 hover:underline"
                >
                  <span className="truncate">{s.nomenclature.replace(/,+$/, "")}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {s.quantity.toLocaleString()} {s.unitOfIssue}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {item.sameNsn.length > 0 && (
        <Section title="Other open RFQs for this NSN">
          <ul className="divide-y text-sm">
            {item.sameNsn.map((s) => (
              <li key={`${s.solicitationNumber}${s.prNumber}`}>
                <Link
                  href={hrefWith(filters, { id: lineItemId(s.solicitationNumber, s.prNumber) })}
                  scroll={false}
                  className="flex justify-between gap-3 py-1.5 hover:underline"
                >
                  <span className="font-mono">{s.solicitationNumber}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {s.quantity.toLocaleString()} {s.unitOfIssue} · closes {formatDate(s.returnByDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Fact({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div title={title}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}
