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
import { Search, Plus, Pencil, Trash2, Eye, ArrowRight, ArrowLeft } from "lucide-react";
import { useState, useMemo, ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
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

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((k) =>
        String(row[k] ?? "")
          .toLowerCase()
          .includes(q)
      )
    );
  }, [data, search, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);

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
        {searchKeys.length > 0 && (
          <div className="relative max-w-sm">
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
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {columns.map((c, idx) => (
                  <TableHead key={`${c.key}-${idx}`} className={c.className}>
                    {c.label}
                  </TableHead>
                ))}
                {(onView || onEdit || onDelete) && (
                  <TableHead className="text-left w-32">عملیات</TableHead>
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
                      <TableCell key={`${c.key}-${idx}`} className={c.className}>
                        {c.render ? c.render(row) : String((row as any)[c.key] ?? "-")}
                      </TableCell>
                    ))}
                    {(onView || onEdit || onDelete) && (
                      <TableCell className="text-left">
                        <div className="flex items-center gap-1 justify-end">
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
            <p className="text-xs text-muted-foreground">
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
