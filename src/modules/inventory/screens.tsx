import Link from "next/link";
import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import { ArrowLeft, PackageMinus, PackagePlus, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, tbilisiToday } from "@/lib/appointment-slots";
import { prisma } from "@/lib/db";
import { formatGel } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ExportLink, FilterBar, FilterField, DateInput, NativeSelect, Pager } from "@/modules/finance/components/filters";
import { param, periodParams, positiveInt, type SearchParams, withParams } from "@/modules/finance/params";
import { ExpiryBadge, LevelBadge } from "@/modules/inventory/components/badges";
import { type CatalogItemRow, CatalogManager, type SupplierRow } from "@/modules/inventory/components/catalog-manager";
import { type IssueBatch, IssueForm, type IssueItem } from "@/modules/inventory/components/issue-form";
import { type CountItem, CountForm } from "@/modules/inventory/components/count-form";
import { MovementList } from "@/modules/inventory/components/movement-list";
import { NormsEditor } from "@/modules/inventory/components/norms-editor";
import { ReceiptForm } from "@/modules/inventory/components/receipt-form";
import { StockTable } from "@/modules/inventory/components/stock-table";
import { CATEGORY_LABELS, MOVEMENT_TYPES, type MovementTypeValue, STOCK_STATUSES, type StockStatusFilter } from "@/modules/inventory/labels";
import { type InventoryRoutes, itemUrl } from "@/modules/inventory/routes";
import { dateOnly } from "@/modules/inventory/server/db";
import { loadNormServices } from "@/modules/inventory/server/norms";
import { listMovements, loadItem, loadPickerData, loadStock } from "@/modules/inventory/server/stock";
import { expiryStatus, formatQuantity, fromDecimal, inputQuantity } from "@/modules/inventory/stock";

/**
 * საწყობის ეკრანები — როლზე დამოუკიდებელი (გვერდები: src/app/(dashboard)/warehouse/, admin/inventory/).
 * უფლებას გვერდი ამოწმებს (requirePermission); ღილაკები აქ — can()-ით.
 */

type User = Session["user"];

function Header({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function ActionLink({ href, children, variant = "default" }: { href: string; children: React.ReactNode; variant?: "default" | "outline" }) {
  return (
    <Link href={href} className={buttonVariants({ variant, size: "lg" })}>
      {children}
    </Link>
  );
}

export async function StockScreen({ routes, user, params }: { routes: InventoryRoutes; user: User; params: SearchParams }) {
  const rows = await loadStock();
  const status = STOCK_STATUSES.some((s) => s.value === param(params.status)) ? (param(params.status) as StockStatusFilter) : "all";
  const active = rows.filter((r) => r.isActive);
  const low = active.filter((r) => r.level !== "ok").length;
  const expiry = active.filter((r) => r.expiry === "expired" || r.expiry === "expiring").length;
  return (
    <section className="flex flex-col gap-4">
      <Header
        title="ნაშთები"
        description={`${active.length} დასახელება${low ? ` · მცირე ან ამოწურული: ${low}` : ""}${expiry ? ` · ვადის გაფრთხილება: ${expiry}` : ""}`}
      >
        {can(user, "inventory.reports") && <ExportLink href="/api/inventory/stock" />}
        {routes.issue && can(user, "inventory.consume") && (
          <ActionLink href={routes.issue} variant="outline">
            <PackageMinus />
            გახარჯვა
          </ActionLink>
        )}
        {routes.receive && can(user, "inventory.receive") && (
          <ActionLink href={routes.receive}>
            <PackagePlus />
            შემოსავალი
          </ActionLink>
        )}
      </Header>
      <StockTable rows={rows} routes={routes} showValue={can(user, "inventory.reports")} initialStatus={status} />
    </section>
  );
}

export async function ItemScreen({ routes, user, rawId }: { routes: InventoryRoutes; user: User; rawId: string }) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = await loadItem(id);
  if (!data) notFound();
  const { stock, batches, movements } = data;
  const writeoffHref = routes.issue && can(user, "inventory.manage") ? routes.issue : null;
  const showCost = can(user, "inventory.reports");
  return (
    <section className="flex flex-col gap-4">
      <Link href={routes.stock} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        ნაშთები
      </Link>
      <Header title={stock.name} description={`${CATEGORY_LABELS[stock.category]} · ერთეული: ${stock.unit}${data.note ? ` · ${data.note}` : ""}`}>
        {routes.issue && stock.isActive && can(user, "inventory.consume") && (
          <ActionLink href={withParams(routes.issue, { item: id })} variant="outline">
            <PackageMinus />
            გახარჯვა
          </ActionLink>
        )}
        {routes.receive && stock.isActive && can(user, "inventory.receive") && (
          <ActionLink href={routes.receive}>
            <PackagePlus />
            შემოსავალი
          </ActionLink>
        )}
      </Header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ვარგისი ნაშთი" value={`${formatQuantity(stock.usable)} ${stock.unit}`} extra={<LevelBadge level={stock.level} />} />
        <Stat label="ვადაგასული (ჩამოსაწერი)" value={`${formatQuantity(stock.expired)} ${stock.unit}`} danger={stock.expired > 0} />
        <Stat label="მინიმალური ნაშთი" value={stock.minQuantity > 0 ? `${formatQuantity(stock.minQuantity)} ${stock.unit}` : "—"} />
        {showCost ? <Stat label="ღირებულება" value={formatGel(stock.valueTetri / 100)} /> : <Stat label="უახლოესი ვადა" value={stock.nextExpiry ? formatDate(stock.nextExpiry) : "—"} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>პარტიები</CardTitle>
          <p className="text-sm text-muted-foreground">ნაშთიანი პარტიები გახარჯვის რიგით (ჯერ — ყველაზე ადრე ვადაგასული)</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>სერია</TableHead>
                <TableHead>ვარგისია</TableHead>
                <TableHead className="text-right">ნაშთი</TableHead>
                <TableHead className="hidden text-right sm:table-cell">მიღებული</TableHead>
                <TableHead className="hidden md:table-cell">მიღება</TableHead>
                {showCost && <TableHead className="hidden text-right md:table-cell">ერთ. ფასი</TableHead>}
                {writeoffHref && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                    ნაშთი არ არის
                  </TableCell>
                </TableRow>
              )}
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.lotNumber ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <ExpiryBadge date={b.expiryDate} status={b.expiry} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatQuantity(b.quantity)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{formatQuantity(b.received)}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {[b.receivedOn && formatDate(b.receivedOn), b.supplier].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  {showCost && <TableCell className="hidden text-right tabular-nums md:table-cell">{b.unitCost ? formatGel(b.unitCost) : "—"}</TableCell>}
                  {writeoffHref && (
                    <TableCell>
                      <Link
                        href={withParams(writeoffHref, { mode: "writeoff", item: id, batch: b.id })}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-destructive hover:text-destructive")}
                        aria-label="ჩამოწერა"
                        title="ჩამოწერა"
                      >
                        <Trash2 />
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <h2 className="font-semibold">ბოლო მოძრაობები</h2>
          {routes.movements && (
            <Link href={withParams(routes.movements, { item: id })} className="text-sm text-primary hover:underline">
              სრული ისტორია
            </Link>
          )}
        </div>
        <MovementList rows={movements} itemHref={null} />
      </div>
    </section>
  );
}

function Stat({ label, value, extra, danger }: { label: string; value: string; extra?: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("flex items-center gap-2 text-lg font-semibold tabular-nums", danger && "text-destructive")}>
        {value}
        {extra}
      </span>
    </div>
  );
}

export async function ReceiveScreen({ routes }: { routes: InventoryRoutes }) {
  const { items, suppliers } = await loadPickerData();
  return (
    <section className="flex flex-col gap-4">
      <Header title="შემოსავალი" description="მომწოდებლისგან მიღებული მედიკამენტი და მასალა. ყოველი ხაზი ახალი პარტიაა (სერია, ვადა, ფასი)." />
      {items.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          კატალოგი ცარიელია. ჯერ დაამატეთ დასახელებები
          {routes.catalog && (
            <>
              {" — "}
              <Link href={routes.catalog} className="text-primary hover:underline">
                კატალოგი
              </Link>
            </>
          )}
          .
        </p>
      ) : (
        <ReceiptForm items={items} suppliers={suppliers} today={tbilisiToday()} routes={routes} />
      )}
    </section>
  );
}

export async function IssueScreen({ user, params }: { user: User; params: SearchParams }) {
  const today = tbilisiToday();
  const [stock, batches] = await Promise.all([
    loadStock(),
    prisma.inventoryBatch.findMany({
      where: { quantity: { gt: 0 }, item: { isActive: true } },
      select: { id: true, itemId: true, lotNumber: true, expiryDate: true, quantity: true },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    }),
  ]);
  const modes = [can(user, "inventory.consume") && ("consume" as const), can(user, "inventory.manage") && ("writeoff" as const)].filter(
    (m): m is "consume" | "writeoff" => Boolean(m),
  );
  const items: IssueItem[] = stock.filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name, unit: r.unit, usable: r.usable, total: r.total }));
  const issueBatches: IssueBatch[] = batches.map((b) => {
    const expiryDate = dateOnly(b.expiryDate);
    return { id: b.id, itemId: b.itemId, lotNumber: b.lotNumber, expiryDate, expiry: expiryStatus(expiryDate, today), quantity: fromDecimal(b.quantity) };
  });
  const mode = param(params.mode) === "writeoff" ? "writeoff" : param(params.mode) === "consume" ? "consume" : null;
  const itemId = positiveInt(params.item);
  return (
    <section className="flex flex-col gap-4">
      <Header
        title={modes.length > 1 ? "გახარჯვა და ჩამოწერა" : modes[0] === "writeoff" ? "ჩამოწერა" : "გახარჯვა"}
        description="ყოველი ოპერაცია მოძრაობების ჟურნალში იწერება (ვინ, როდის, რამდენი) და არ იშლება."
      />
      <IssueForm
        items={items}
        batches={issueBatches}
        modes={modes}
        initial={{ mode, itemId: items.some((i) => i.id === itemId) ? itemId : null, batchId: positiveInt(params.batch) }}
      />
    </section>
  );
}

export async function MovementsScreen({ routes, user, params }: { routes: InventoryRoutes; user: User; params: SearchParams }) {
  const base = routes.movements;
  if (!base) notFound();
  const period = periodParams(params, 30);
  const type = MOVEMENT_TYPES.some((t) => t.value === param(params.type)) ? (param(params.type) as MovementTypeValue) : null;
  const itemId = positiveInt(params.item);
  const page = positiveInt(params.page) ?? 1;
  const [result, items] = await Promise.all([
    listMovements({ ...period, type, itemId, page }),
    prisma.inventoryItem.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const query = { from: period.from, to: period.to, type, item: itemId };
  return (
    <section className="flex flex-col gap-4">
      <Header title="მოძრაობები" description={`${formatDate(period.from)} — ${formatDate(period.to)} · ${result.count} ჩანაწერი`}>
        {can(user, "inventory.reports") && <ExportLink href={withParams("/api/inventory/movements", query)} />}
      </Header>
      <FilterBar action={base}>
        <FilterField label="დან">
          <DateInput name="from" value={period.from} />
        </FilterField>
        <FilterField label="მდე">
          <DateInput name="to" value={period.to} />
        </FilterField>
        <FilterField label="ოპერაცია">
          <NativeSelect name="type" value={type ?? ""} options={[{ value: "", label: "ყველა" }, ...MOVEMENT_TYPES]} />
        </FilterField>
        <FilterField label="დასახელება">
          <NativeSelect
            name="item"
            value={itemId ? String(itemId) : ""}
            options={[{ value: "", label: "ყველა" }, ...items.map((i) => ({ value: String(i.id), label: i.name }))]}
            className="max-w-64"
          />
        </FilterField>
      </FilterBar>
      <MovementList rows={result.rows} itemHref={(id) => itemUrl(routes, id)} />
      <Pager page={result.page} pageCount={result.pageCount} href={(p) => withParams(base, { ...query, page: p })} />
    </section>
  );
}

export async function CatalogScreen() {
  const [items, suppliers] = await Promise.all([
    prisma.inventoryItem.findMany({ orderBy: { name: "asc" } }),
    prisma.inventorySupplier.findMany({ include: { _count: { select: { receipts: true } } }, orderBy: { name: "asc" } }),
  ]);
  const itemRows: CatalogItemRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    minQuantity: inputQuantity(fromDecimal(i.minQuantity)),
    tracksExpiry: i.tracksExpiry,
    note: i.note,
    isActive: i.isActive,
  }));
  const supplierRows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    taxId: s.taxId,
    phone: s.phone,
    note: s.note,
    isActive: s.isActive,
    receipts: s._count.receipts,
  }));
  return (
    <section className="flex flex-col gap-4">
      <Header
        title="კატალოგი"
        description="მედიკამენტები, სახარჯი მასალა და რეაგენტები. დასახელება არ იშლება — ითიშება (ისტორია რჩება)."
      >
        <Badge variant="secondary">{items.filter((i) => i.isActive).length} აქტიური</Badge>
      </Header>
      <CatalogManager items={itemRows} suppliers={supplierRows} />
    </section>
  );
}

export async function NormsScreen() {
  const [services, items] = await Promise.all([
    loadNormServices(),
    prisma.inventoryItem.findMany({ where: { isActive: true }, select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <section className="flex flex-col gap-4">
      <Header
        title="ნორმები"
        description="რა მასალა იხარჯება სერვისის ერთ შესრულებაზე. ექთანი და ლაბორანტი „შესრულდა“-სას მას წინასწარ შევსებულს ხედავენ და ასწორებენ."
      />
      <NormsEditor services={services} items={items} />
    </section>
  );
}

export async function CountScreen() {
  const batches = await prisma.inventoryBatch.findMany({
    where: { quantity: { gt: 0 } },
    select: { id: true, lotNumber: true, expiryDate: true, quantity: true, item: { select: { id: true, name: true, unit: true, category: true } } },
    orderBy: [{ item: { name: "asc" } }, { expiryDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
  });
  const items = new Map<number, CountItem>();
  for (const b of batches) {
    const item = items.get(b.item.id) ?? { ...b.item, batches: [] };
    item.batches.push({ id: b.id, lotNumber: b.lotNumber, expiryDate: dateOnly(b.expiryDate), quantity: fromDecimal(b.quantity) });
    items.set(b.item.id, item);
  }
  return (
    <section className="flex flex-col gap-4">
      <Header title="ინვენტარიზაცია" description="დაითვალეთ თაროზე არსებული რაოდენობა და შეიყვანეთ — სხვაობა კორექტირებად აისახება." />
      <CountForm items={[...items.values()]} today={tbilisiToday()} />
    </section>
  );
}
