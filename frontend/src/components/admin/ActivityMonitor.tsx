/**
 * Activity Monitor Component - Enhanced with DataTable
 * 
 * Real-time monitoring dashboard for user activities and system events
 * Module: FP-04 (Activity Monitor), AC-01 (Audit Logs)
 * Permissions: Master Admin only
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, Download, RefreshCw, Eye } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

interface ActivityLog {
  id: string;
  user_email: string;
  user_role: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  timestamp: string;
}

async function fetchActivityLogs(): Promise<ActivityLog[]> {
  // Get Supabase session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  if (!token) {
    throw new Error('No authentication token found');
  }
  
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const response = await fetch(`${apiUrl}/api/v1/admin/activity?limit=100`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to fetch activity logs');
  return response.json();
}

/** Returns Tailwind classes for action badge to differentiate action types at a glance */
function getActionBadgeStyle(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('rejected') || lower.includes('delete') || lower.includes('error')) {
    return 'bg-red-500/90 text-white border-red-600';
  }
  if (lower.includes('validated') || lower.includes('approved') || lower.includes('created')) {
    return 'bg-emerald-600 text-white border-emerald-700';
  }
  if (lower.includes('login')) return 'bg-blue-600 text-white border-blue-700';
  if (lower.includes('logout')) return 'bg-slate-500 text-white border-slate-600';
  if (lower.includes('updated') || lower.includes('changed')) return 'bg-amber-600 text-white border-amber-700';
  if (lower.includes('print')) return 'bg-teal-600 text-white border-teal-700';
  if (lower.includes('processing') || lower.includes('started')) return 'bg-violet-600 text-white border-violet-700';
  return 'bg-secondary text-secondary-foreground';
}

function exportToCSV(data: ActivityLog[]) {
  const headers = ['Timestamp', 'User', 'Role', 'Action', 'Resource', 'IP'];
  const rows = data.map(log => [
    log.timestamp, log.user_email, log.user_role, log.action, log.resource_type, log.ip_address || ''
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${data.length} logs`);
}

interface PaginationControlsProps {
  table: ReturnType<typeof useReactTable<ActivityLog>>;
  totalLogs: number;
}

/** Reusable pagination controls for top and bottom of the table */
function PaginationControls({ table, totalLogs }: PaginationControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2">
      <div className="text-sm text-muted-foreground">
        Showing {table.getRowModel().rows.length} of {totalLogs} logs
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <div className="text-sm">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</div>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  );
}

/**
 * Activity Monitor UI showing a searchable, sortable, and paginated table of recent user activity with export and detail drill-down.
 *
 * The table auto-refreshes every 30 seconds, supports column filtering and sorting, allows exporting visible logs to CSV, and opens a details dialog for individual log entries.
 *
 * @returns The rendered Activity Monitor React element
 */
export default function ActivityMonitor() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [detailsDialog, setDetailsDialog] = useState<{ open: boolean; log: ActivityLog | null }>({ open: false, log: null });

  const { data: logs = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin', 'activity'],
    queryFn: fetchActivityLogs,
    refetchInterval: 30000,
  });

  const columns = useMemo<ColumnDef<ActivityLog>[]>(() => [
    {
      accessorKey: 'timestamp',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Timestamp <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        try {
          const date = parseISO(row.getValue('timestamp'));
          return (
            <div className="text-sm">
              <div className="font-medium">{format(date, 'MMM d, yyyy')}</div>
              <div className="text-muted-foreground">{format(date, 'h:mm:ss a')}</div>
            </div>
          );
        } catch {
          return <span className="text-muted-foreground">Invalid date</span>;
        }
      },
    },
    {
      accessorKey: 'user_email',
      header: 'User',
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-medium">{row.getValue('user_email')}</div>
          <div className="text-muted-foreground text-xs">{row.original.user_role}</div>
        </div>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <Badge variant="outline" className={`border ${getActionBadgeStyle(String(row.getValue('action') ?? ''))}`}>
          {row.getValue('action')}
        </Badge>
      ),
    },
    {
      accessorKey: 'resource_type',
      header: 'Resource',
      cell: ({ row }) => {
        const id = row.original.resource_id;
        return (
          <div className="text-sm">
            <div className="font-medium">{row.getValue('resource_type')}</div>
            {id && <div className="text-muted-foreground text-xs font-mono">{id.substring(0, 8)}...</div>}
          </div>
        );
      },
    },
    {
      accessorKey: 'ip_address',
      header: 'IP',
      cell: ({ row }) => <span className="text-sm font-mono text-muted-foreground">{row.getValue('ip_address') || 'N/A'}</span>,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" aria-label="View details" onClick={() => setDetailsDialog({ open: true, log: row.original })}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], []);

  const table = useReactTable({
    data: logs,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-y-2">
          <div>
            <CardTitle>Activity Monitor</CardTitle>
            <CardDescription>Real-time user actions (auto-refreshes every 30s)</CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToCSV(logs)} disabled={logs.length === 0}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Filter by user..."
            value={(table.getColumn('user_email')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('user_email')?.setFilterValue(e.target.value)}
            className="max-w-sm"
          />
          <Input
            placeholder="Filter by action..."
            value={(table.getColumn('action')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('action')?.setFilterValue(e.target.value)}
            className="max-w-sm"
          />
        </div>
        {/* Controls */}
        <PaginationControls table={table} totalLogs={logs.length} />

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">Loading...</TableCell></TableRow>
              ) : isError ? (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-destructive">Failed to load activity logs: {error?.message}</TableCell></TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No logs found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationControls table={table} totalLogs={logs.length} />
      </CardContent>

      <Dialog open={detailsDialog.open} onOpenChange={(open) => setDetailsDialog(prev => ({ open, log: prev.log }))}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Log Details</DialogTitle>
            <DialogDescription>Complete details for this activity</DialogDescription>
          </DialogHeader>
          {detailsDialog.log && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><p className="text-sm font-medium text-muted-foreground">User</p><p className="text-sm">{detailsDialog.log.user_email}</p></div>
                <div><p className="text-sm font-medium text-muted-foreground">Role</p><p className="text-sm">{detailsDialog.log.user_role}</p></div>
                <div><p className="text-sm font-medium text-muted-foreground">Action</p><Badge variant="outline" className={`border ${getActionBadgeStyle(detailsDialog.log.action)}`}>{detailsDialog.log.action}</Badge></div>
                <div><p className="text-sm font-medium text-muted-foreground">Timestamp</p><p className="text-sm">{format(parseISO(detailsDialog.log.timestamp), 'PPpp')}</p></div>
                <div><p className="text-sm font-medium text-muted-foreground">Resource</p><p className="text-sm">{detailsDialog.log.resource_type}</p></div>
                <div><p className="text-sm font-medium text-muted-foreground">Resource ID</p><p className="text-sm font-mono">{detailsDialog.log.resource_id || 'N/A'}</p></div>
                <div className="sm:col-span-2"><p className="text-sm font-medium text-muted-foreground">IP Address</p><p className="text-sm font-mono">{detailsDialog.log.ip_address || 'N/A'}</p></div>
              </div>
              {detailsDialog.log.details && Object.keys(detailsDialog.log.details).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Details</p>
                  <pre className="bg-muted p-4 rounded-md text-xs overflow-auto">{JSON.stringify(detailsDialog.log.details, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}