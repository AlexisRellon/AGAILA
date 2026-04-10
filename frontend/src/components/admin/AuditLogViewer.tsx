/**
 * Audit Log Viewer Component (AC-01)
 * 
 * Features:
 * - Audit log table with sorting, filtering, pagination
 * - Filters: user_email, action, resource_type, date range, success status
 * - CSV export functionality
 * - Real-time log monitoring
 * 
 * Module: AC-01 (Audit Log Query)
 * Permissions: Master Admin, Validator (read-only)
 */

import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, Download, Filter, CheckCircle2, XCircle, Eye } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { TableSkeleton } from '../dashboard/AnalyticsSkeleton';
import { adminApi } from '../../lib/api';
import { cn } from '../../lib/utils';

interface AuditLog {
  id: string;
  user_email: string | null;
  user_role: string | null;
  user_id?: string | null;
  action: string;
  action_description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  error_message: string | null;
  event_type?: string | null;
  severity?: string;
  status: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  error_category?: string | null;
  error_source?: string | null;
  error_code?: string | null;
  stack_trace?: string | null;
  created_at: string;
}

const columnHelper = createColumnHelper<AuditLog>();

/** Returns Tailwind classes for action badge to differentiate action types at a glance */
function getActionBadgeStyle(action: string): string {
  const lower = action.toLowerCase();
  // Destructive/negative actions - red
  if (lower.includes('rejected') || lower.includes('deleted') || lower.includes('deactivated')) {
    return 'bg-red-500/90 text-white border-red-600 hover:bg-red-500';
  }
  // Positive/approval actions - green
  if (lower.includes('validated') || lower.includes('approved') || lower.includes('created')) {
    return 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-600';
  }
  // Auth - failed login orange/warning, login blue, logout muted
  if (lower === 'failed_login') return 'bg-orange-600 text-white border-orange-700 hover:bg-orange-600';
  if (lower.includes('login')) return 'bg-blue-600 text-white border-blue-700 hover:bg-blue-600';
  if (lower.includes('logout')) return 'bg-slate-500 text-white border-slate-600 hover:bg-slate-500';
  // Updates - amber
  if (lower.includes('updated') || lower.includes('changed')) {
    return 'bg-amber-600 text-white border-amber-700 hover:bg-amber-600';
  }
  // Report printing - teal
  if (lower.includes('printed') || lower.includes('print')) {
    return 'bg-teal-600 text-white border-teal-700 hover:bg-teal-600';
  }
  // RSS feed added - green (already covered by 'created' above, but explicit for clarity)
  if (lower === 'rss_feed_added') return 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-600';
  // RSS feed removed - red (already covered by 'deleted' above, but explicit for clarity)
  if (lower === 'rss_feed_removed') return 'bg-red-500/90 text-white border-red-600 hover:bg-red-500';
  // RSS feed status changed - amber
  if (lower === 'rss_feed_status_changed') return 'bg-amber-600 text-white border-amber-700 hover:bg-amber-600';
  // RSS processing - violet
  if (lower.includes('processing') || lower.includes('started')) {
    return 'bg-violet-600 text-white border-violet-700 hover:bg-violet-600';
  }
  // Config - indigo
  if (lower.includes('config')) return 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-600';
  // Default
  return 'bg-secondary text-secondary-foreground';
}

const AuditLogViewer: React.FC = () => {
  // Filter state
  const [emailFilter, setEmailFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [successFilter, setSuccessFilter] = useState<boolean | null>(null);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  // Details dialog state
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  // Fetch audit logs with React Query
  const { data: rawLogs, isLoading, error: queryError } = useQuery({
    queryKey: ['admin', 'auditLogs', { emailFilter, actionFilter, resourceTypeFilter, successFilter, dateRange }],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        limit: 500,
        offset: 0,
      };

      if (emailFilter) params.user_email = emailFilter;
      if (actionFilter !== 'all') params.action = actionFilter;
      if (resourceTypeFilter !== 'all') params.resource_type = resourceTypeFilter;
      if (successFilter !== null) params.success = successFilter;
      if (dateRange.from) params.start_date = dateRange.from.toISOString();
      if (dateRange.to) params.end_date = dateRange.to.toISOString();

      return await adminApi.auditLogs.list(params);
    },
    staleTime: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const logs = useMemo(() => rawLogs ?? [], [rawLogs]);
  const error = queryError ? (queryError as Error).message : null;

  const columns = [
    columnHelper.accessor('created_at', {
      header: 'Timestamp',
      cell: (info) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {format(new Date(info.getValue()), 'MMM dd, yyyy HH:mm:ss')}
        </span>
      ),
    }),
    columnHelper.accessor('user_email', {
      header: 'User',
      cell: (info) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{info.getValue() || 'System'}</span>
          {info.row.original.user_role && (
            <span className="text-xs text-muted-foreground capitalize">{info.row.original.user_role}</span>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('action', {
      header: 'Action',
      cell: (info) => (
        <div className="flex flex-col max-w-xs">
          <Badge variant="outline" className={cn('w-fit mb-1 border', getActionBadgeStyle(String(info.getValue() ?? '')))}>
            {info.getValue()}
          </Badge>
          <span className="text-xs text-muted-foreground line-clamp-2">
            {info.row.original.action_description || '-'}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor('resource_type', {
      header: 'Resource',
      cell: (info) => (
        <div className="flex flex-col">
          <span className="text-sm">{info.getValue() || '-'}</span>
          {info.row.original.resource_id && (
            <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">
              {info.row.original.resource_id}
            </span>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('success', {
      header: 'Status',
      cell: (info) => (
        <div className="flex items-center gap-2">
          {info.getValue() ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">Success</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-600">Failed</span>
            </>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('ip_address', {
      header: 'IP Address',
      cell: (info) => (
        <span className="text-xs font-mono text-muted-foreground">
          {info.getValue() || '-'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedLog(info.row.original);
            setIsDetailsOpen(true);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    }),
  ];

  const table = useReactTable({
    data: logs,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  });

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Timestamp', 'User Email', 'Role', 'Action', 'Description', 'Resource Type', 'Resource ID', 'Status', 'IP Address'];
    const rows = logs.map((log: AuditLog) => [
      format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
      log.user_email || 'System',
      log.user_role || '',
      log.action,
      log.action_description,
      log.resource_type || '',
      log.resource_id || '',
      log.success ? 'Success' : 'Failed',
      log.ip_address || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: (string | number | boolean | null)[]) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
    link.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logs</CardTitle>
        <CardDescription>
          View system activity logs and administrative actions (AC-01)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Email Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Action Filter */}
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="LOGIN">Login</SelectItem>
                <SelectItem value="LOGOUT">Logout</SelectItem>
                <SelectItem value="FAILED_LOGIN">Failed Login</SelectItem>
                <SelectItem value="user_created">User Created</SelectItem>
                <SelectItem value="role_changed">Role Changed</SelectItem>
                <SelectItem value="user_deactivated">User Deactivated</SelectItem>
                <SelectItem value="config_updated">Config Updated</SelectItem>
                <SelectItem value="report_validated">Report Validated</SelectItem>
                <SelectItem value="report_rejected">Report Rejected</SelectItem>
                <SelectItem value="report_printed">Report Printed</SelectItem>
                <SelectItem value="rss_feed_added">RSS Feed Added</SelectItem>
                <SelectItem value="rss_feed_removed">RSS Feed Removed</SelectItem>
                <SelectItem value="rss_feed_status_changed">RSS Feed Status Changed</SelectItem>
                <SelectItem value="rss_feed_updated">RSS Feed Updated</SelectItem>
                <SelectItem value="rss_processing_started">RSS Processing Started</SelectItem>
                <SelectItem value="rss_article_validated">RSS Article Validated</SelectItem>
                <SelectItem value="rss_article_updated">RSS Article Updated</SelectItem>
                <SelectItem value="rss_article_deleted">RSS Article Deleted</SelectItem>
                <SelectItem value="rss_articles_bulk_deleted">RSS Articles Bulk Deleted</SelectItem>
              </SelectContent>
            </Select>

            {/* Resource Type Filter */}
            <Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All resources</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
                <SelectItem value="user_profiles">User Profiles</SelectItem>
                <SelectItem value="system_config">System Config</SelectItem>
                <SelectItem value="citizen_reports">Citizen Reports</SelectItem>
                <SelectItem value="hazards">Hazards</SelectItem>
                <SelectItem value="rss_feeds">RSS Feeds</SelectItem>
                <SelectItem value="reports">Reports</SelectItem>
              </SelectContent>
            </Select>

            {/* Success Filter */}
            <Select
              value={successFilter === null ? 'all' : successFilter ? 'success' : 'failed'}
              onValueChange={(value) => {
                if (value === 'all') setSuccessFilter(null);
                else if (value === 'success') setSuccessFilter(true);
                else setSuccessFilter(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Success only</SelectItem>
                <SelectItem value="failed">Failed only</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range - Start Date */}
            <Input
              type="date"
              placeholder="Start date"
              value={dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                const date = e.target.value ? new Date(e.target.value) : undefined;
                setDateRange((prev) => ({ ...prev, from: date }));
              }}
            />

            {/* Date Range - End Date */}
            <Input
              type="date"
              placeholder="End date"
              value={dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                const date = e.target.value ? new Date(e.target.value) : undefined;
                setDateRange((prev) => ({ ...prev, to: date }));
              }}
            />

            {/* Export Button */}
            <Button onClick={exportToCSV} variant="outline" disabled={logs.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          {/* Clear Filters */}
          {(emailFilter || actionFilter !== 'all' || resourceTypeFilter !== 'all' || successFilter !== null || dateRange.from || dateRange.to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEmailFilter('');
                setActionFilter('all');
                setResourceTypeFilter('all');
                setSuccessFilter(null);
                setDateRange({});
              }}
            >
              Clear all filters
            </Button>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Table */}
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="font-semibold">
                      {header.isPlaceholder ? null : (
                        <div
                          className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() ? (
                            <span className="ml-1">{header.column.getIsSorted() === 'asc' ? '↑' : '↓'}</span>
                          ) : null}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <TableSkeleton rows={6} columns={8} />
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                    No audit logs found
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 mt-4">
          <div className="text-sm text-muted-foreground">
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, logs.length)} of{' '}
            {logs.length} logs
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              {selectedLog && format(new Date(selectedLog.created_at), 'PPP pp')}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 text-sm mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">User</h4>
                  <p>{selectedLog.user_email || 'System'} ({selectedLog.user_role || 'No Role'})</p>
                </div>
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">Action</h4>
                  <Badge variant="outline" className={getActionBadgeStyle(selectedLog.action)}>
                    {selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">Resource</h4>
                  <p>{selectedLog.resource_type || '-'} {selectedLog.resource_id ? `(${selectedLog.resource_id})` : ''}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">Status</h4>
                  <div className="flex items-center gap-1">
                    {selectedLog.success ? (
                      <><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-green-600">Success</span></>
                    ) : (
                      <><XCircle className="h-4 w-4 text-red-600" /><span className="text-red-600">Failed</span></>
                    )}
                  </div>
                </div>
              </div>

              {selectedLog.action_description && (
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">Description</h4>
                  <p>{selectedLog.action_description}</p>
                </div>
              )}

              {selectedLog.error_message && (
                <div>
                  <h4 className="font-semibold text-red-500 mb-1">Error Message</h4>
                  <p className="text-red-600 bg-red-50 p-2 rounded border border-red-100">{selectedLog.error_message}</p>
                </div>
              )}

              {selectedLog.error_category && (
                <div className="grid grid-cols-2 gap-4 bg-muted p-3 rounded-md">
                  <div>
                    <h4 className="font-semibold text-muted-foreground mb-1">Error Category</h4>
                    <p>{selectedLog.error_category}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-muted-foreground mb-1">Error Source</h4>
                    <p>{selectedLog.error_source || '-'}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedLog.old_values && Object.keys(selectedLog.old_values).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-muted-foreground mb-1">Old Values</h4>
                    <pre className="bg-muted p-2 rounded-md overflow-x-auto text-xs">
                      {JSON.stringify(selectedLog.old_values, null, 2)}
                    </pre>
                  </div>
                )}
                {selectedLog.new_values && Object.keys(selectedLog.new_values).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-muted-foreground mb-1">New Values</h4>
                    <pre className="bg-muted p-2 rounded-md overflow-x-auto text-xs">
                      {JSON.stringify(selectedLog.new_values, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">Context</h4>
                  <pre className="bg-muted p-2 rounded-md overflow-x-auto text-xs border-l-4 border-l-blue-500">
                    {JSON.stringify(selectedLog.context, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">Metadata</h4>
                  <pre className="bg-muted p-2 rounded-md overflow-x-auto text-xs">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.stack_trace && (
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-1">Stack Trace</h4>
                  <pre className="bg-muted p-2 rounded-md overflow-x-auto text-xs text-red-500">
                    {selectedLog.stack_trace}
                  </pre>
                </div>
              )}

            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AuditLogViewer;
