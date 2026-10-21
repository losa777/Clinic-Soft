import {
  type ColumnDef,
  type ReactTable,
  type RowData,
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

/** სისტემის ცხრილების საერთო ფუნქციები: ფილტრი, ძებნა, სორტირება, გვერდები. */
export const tableFeatureSet = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
  /** className — სვეტის უჯრების კლასები (მაგ. მობილურზე დამალვა) */
  columnMeta: {} as { className?: string },
});

export type AppFeatures = typeof tableFeatureSet;
export type AppColumnDef<T extends RowData> = ColumnDef<AppFeatures, T>;
export type AppTable<T extends RowData> = ReactTable<AppFeatures, T>;
