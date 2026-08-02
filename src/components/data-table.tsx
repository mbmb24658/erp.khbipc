"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Pencil, Trash2, Eye, ArrowRight, ArrowLeft, Filter, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useMemo, ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  // Enable per-column filter (dropdown of unique values)
  filterable?: boolean;
  // Custom filter options (defaults to unique values from data)
  filterOptions?: (row: T) => string;
  // Center-align this column (default: true for all columns now)
  center?: boolean;
  // Custom sort value extractor (defaults to row[key])
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  title: string;
  description?: string;
  searchKeys?: (keyof T)[];
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onView?: (row: T) => void;
  onDelete?: (row: T) => void;
  addLabel?: string;
  pageSize?: number;
  emptyMessage?: string;
}

export function DataTable<T extends { id?: string }>({
  data,
  columns,
  title,
  description,
  searchKeys = [],
  onAdd,
  onEdit,
  onView,
  onDelete,
  addLabel = "افزودن",
  pageSize = 20,
  emptyMessage = "موردی یافت نشد",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  // Per-column filter values: { columnKey: selectedValue }
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  // Sort state: { key, direction } where direction is "asc" | "desc" | null
  const [sortState, setSortState] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  // Compute unique values for each filterable column
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      const set = new Set<string>();
      for (const row of data) {
        const val = col.filterOptions
          ? col.filterOptions(row)
          : String((row as any)[col.key] ?? "");
        if (val) set.add(val);
      }
      opts[col.key] = Array.from(set).sort();
    }
    return opts;
  }, [data, columns]);

  const filtered = useMemo(() => {
    let result = data;

    // Apply text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((k) =>
          String(row[k] ?? "")
            .toLowerCase()
            .includes(q)
        )
      );
    }

    // Apply column filters
    for (const [colKey, selectedValue] of Object.entries(columnFilters)) {
      if (!selectedValue) continue;
      const col = columns.find((c) => c.key === colKey);
      if (!col) continue;
      result = result.filter((row) => {
        const val = col.filterOptions
          ? col.filterOptions(row)
          : String((row as any)[colKey] ?? "");
        return val === selectedValue;
      });
    }

    // Apply sort
    if (sortState) {
      const col = columns.find((c) => c.key === sortState.key);
      if (col) {
        const getVal = (row: T): string | number => {
          if (col.sortValue) return col.sortValue(row);
          const v = (row as any)[col.key];
          // Try numeric comparison if value looks numeric
          if (typeof v === "number") return v;
          if (typeof v === "string" && !isNaN(Number(v)) && v.trim() !== "") return Number(v);
          return String(v ?? "");
        };
        result = [...result].sort((a, b) => {
          const va = getVal(a);
          const vb = getVal(b);
          let cmp: number;
          if (typeof va === "number" && typeof vb === "number") {
            cmp = va - vb;
          } else {
            cmp = String(va).localeCompare(String(vb), "fa");
          }
          return sortState.direction === "asc" ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [data, search, searchKeys, columnFilters, columns, sortState]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when filters change
  const handleFilterChange = (colKey: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [colKey]: value }));
    setPage(0);
  };

  const handleSort = (colKey: string) => {
    setSortState((prev) => {
      if (!prev || prev.key !== colKey) {
        return { key: colKey, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { key: colKey, direction: "desc" };
      }
      // desc → clear sort
      return null;
    });
    setPage(0);
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setSearch("");
    setSortState(null);
    setPage(0);
  };

  const hasActiveFilters =
    search !== "" || Object.values(columnFilters).some((v) => v) || sortState !== null;

  // Helper: center-align class (default true)
  const getCellClass = (col: Column<T>) => {
    const center = col.center !== false; // default true
    return `${center ? "text-center" : ""} ${col.className || ""}`.trim();
  };

  // Render sort icon for a column header
  const renderSortIcon = (col: Column<T>) => {
    if (!col.sortable) return null;
    const isActive = sortState?.key === col.key;
    if (!isActive) {
      return <ArrowUpDown className="w-3 h-3 inline-block mr-1 opacity-40" />;
    }
    return sortState.direction === "asc"
      ? <ArrowUp className="w-3 h-3 inline-block mr-1 text-primary" />
      : <ArrowDown className="w-3 h-3 inline-block mr-1 text-primary" />;
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {onAdd && (
            <Button onClick={onAdd} size="sm">
              <Plus className="w-4 h-4 ml-1" />
              {addLabel}
            </Button>
          )}
        </div>

        {/* Search + column filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          {searchKeys.length > 0 && (
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="جستجو..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pr-9"
              />
            </div>
          )}

          {/* Per-column dropdown filters */}
          {columns
            .filter((c) => c.filterable)
            .map((col) => (
              <Select
                key={col.key}
                value={columnFilters[col.key] || "__all__"}
                onValueChange={(v) =>
                  handleFilterChange(col.key, v === "__all__" ? "" : v)
                }
              >
                <SelectTrigger className="w-[160px] h-9">
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs">{col.label}:</span>
                    <SelectValue placeholder="همه" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">همه</SelectItem>
                  {(filterOptions[col.key] || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-9 text-xs"
            >
              <X className="w-3 h-3 ml-1" />
              پاک کردن فیلترها
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {columns.map((c, idx) => (
                  <TableHead
                    key={`${c.key}-${idx}`}
                    className={`${getCellClass(c)} font-semibold ${c.sortable ? "cursor-pointer hover:bg-muted/70 select-none" : ""}`}
                    onClick={c.sortable ? () => handleSort(c.key) : undefined}
                  >
                    {c.label}
                    {renderSortIcon(c)}
                  </TableHead>
                ))}
                {(onView || onEdit || onDelete) && (
                  <TableHead className="text-center w-32">عملیات</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="text-center text-muted-foreground py-8"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                pageData.map((row, i) => (
                  <TableRow key={row.id || i}>
                    {columns.map((c, idx) => (
                      <TableCell
                        key={`${c.key}-${idx}`}
                        className={getCellClass(c)}
                      >
                        {c.render ? c.render(row) : String((row as any)[c.key] ?? "-")}
                      </TableCell>
                    ))}
                    {(onView || onEdit || onDelete) && (
                      <TableCell className="text-center">
                        <div className="flex items-center gap-1 justify-center">
                          {onView && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => onView(row)}
                              title="مشاهده"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          {onEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => onEdit(row)}
                              title="ویرایش"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => onDelete(row)}
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground text-center flex-1">
              نمایش {(page * pageSize + 1).toLocaleString("fa-IR")} تا{" "}
              {Math.min((page + 1) * pageSize, filtered.length).toLocaleString("fa-IR")}{" "}
              از {filtered.length.toLocaleString("fa-IR")} مورد
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ArrowRight className="w-4 h-4 ml-1" />
                قبلی
              </Button>
              <Badge variant="secondary" className="font-num">
                {(page + 1).toLocaleString("fa-IR")} / {totalPages.toLocaleString("fa-IR")}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                بعدی
                <ArrowLeft className="w-4 h-4 mr-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Page header component
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// Stat card component
export function StatCard({
  label,
  value,
  icon: Icon,
  color = "from-emerald-500 to-teal-600",
}: {
  label: string;
  value: string | number;
  icon: any;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold truncate">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
