"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";

export type AdminUserTableRow = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  createdAtIso: string;
  lastMessageAtIso: string | null;
  planName: string | null;
  chatCount: number;
  messageCount: number;
};

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDate(iso: string | null, fallback = "—"): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

const columns: ColumnDef<AdminUserTableRow>[] = [
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.email}</span>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) =>
      row.original.name?.trim() ? (
        row.original.name
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    sortingFn: (a, b) =>
      (a.original.name ?? "").localeCompare(b.original.name ?? ""),
  },
  {
    accessorKey: "lastMessageAtIso",
    header: "Last message sent",
    sortingFn: (a, b) => {
      const aTime = a.original.lastMessageAtIso
        ? new Date(a.original.lastMessageAtIso).getTime()
        : 0;
      const bTime = b.original.lastMessageAtIso
        ? new Date(b.original.lastMessageAtIso).getTime()
        : 0;
      return aTime - bTime;
    },
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDate(row.original.lastMessageAtIso, "Never")}
      </span>
    ),
  },
  {
    accessorKey: "planName",
    header: "Plan",
    cell: ({ row }) =>
      row.original.planName ? (
        <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs">
          {row.original.planName}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Free</span>
      ),
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      const planName = row.original.planName?.toLowerCase() ?? "free";
      return planName.includes(String(filterValue).toLowerCase());
    },
  },
  {
    accessorKey: "chatCount",
    header: () => <span>Chats</span>,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {numberFormatter.format(row.original.chatCount)}
      </span>
    ),
  },
  {
    accessorKey: "messageCount",
    header: () => <span>Messages sent</span>,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {numberFormatter.format(row.original.messageCount)}
      </span>
    ),
  },
];

export function AdminUsersTable({ rows }: { rows: AdminUserTableRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search users by email, name, plan..."
      pageSize={25}
      emptyState="No users match your filters."
    />
  );
}
