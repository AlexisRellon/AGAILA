/**
 * RSS Processing Logs Component (RSS-09)
 * 
 * Real-time log viewer for RSS feed processing history
 * 
 * Features:
 * - Paginated table (50 per page, max 100)
 * - Status badges (Success/Error/Partial)
 * - Filters: Feed URL dropdown, Status dropdown, Date range
 * - CSV export functionality
 * - Real-time updates (30s polling)
 * - Expandable error details
 * - Mobile-responsive design
 * 
 * API: GET /api/v1/admin/rss/logs?feed_url={url}&status={status}&limit={n}
 * Rate Limit: 30/min
 */

import React, { useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  Download,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../ui/collapsible';
import { toast } from 'sonner';
import { useProcessingLogs, useRSSFeeds } from '../../../hooks/useRSS';
import { ProcessingLog } from '../../../types/rss';

// ============================================================================
// TYPES
// ============================================================================

type LogStatus = 'success' | 'error' | 'partial' | 'all';

interface FilterState {
  feed_url?: string;
  status?: LogStatus;
  limit: number;
  page: number;
}

// ============================================================================
// TABLE COLUMNS DEFINITION
// ============================================================================

export const columns: ColumnDef<ProcessingLog>[] = [
  {
    accessorKey: 'feed_url',
    header: 'Feed',
    cell: ({ row }) => (
      <div className="max-w-xs truncate text-sm">
        {row.getValue('feed_url')}
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as LogStatus;
      return (
        <Badge
          variant={
            status === 'success'
              ? 'default'
              : status === 'error'
              ? 'destructive'
              : 'secondary'
          }
        >
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'items_processed',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Processed
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-center">{row.getValue('items_processed')}</div>
    ),
  },
  {
    accessorKey: 'items_added',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Added
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-center font-medium text-green-600">
        {row.getValue('items_added')}
      </div>
    ),
  },
  {
    accessorKey: 'duplicates_detected',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Duplicates
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-center text-yellow-600">
        {row.getValue('duplicates_detected')}
      </div>
    ),
  },
  {
    accessorKey: 'processing_time_seconds',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Time (s)
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const time = row.getValue('processing_time_seconds') as number;
      return (
        <div className="text-center">
          {time.toFixed(2)}
        </div>
      );
    },
  },
  {
    accessorKey: 'processed_at',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Timestamp
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const timestamp = row.getValue('processed_at') as string;
      return (
        <div className="text-xs text-muted-foreground">
          {new Date(timestamp).toLocaleString()}
        </div>
      );
    },
  },
  {
    id: 'details',
    header: 'Details',
    cell: ({ row }) => {
      const log = row.original;
      const hasError = log.error_details && Object.keys(log.error_details).length > 0;

      if (!hasError) return null;

      return <ErrorDetailsCell log={log} />;
    },
  },
];

// ============================================================================
// ERROR DETAILS CELL COMPONENT
// ============================================================================

function ErrorDetailsCell({ log }: { log: ProcessingLog }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="ml-2 text-xs">Error</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-auto max-h-40">
          {JSON.stringify(log.error_details, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// MAIN COMPONENT
/**
 * Render the RSS processing logs admin interface with filtering, sorting, CSV export, and server-side pagination.
 *
 * Displays a table of processing logs with feed and status filters, page size selection, refresh control, real-time update indicator,
 * expandable error details, and a CSV export that downloads the currently shown log rows.
 *
 * @returns The React element containing the RSS processing logs UI.
 */

export function RSSProcessingLogs() {
  // State
  const [filters, setFilters] = useState<FilterState>({
    limit: 50,
    page: 1,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'processed_at', desc: true }, // Most recent first
  ]);

  // Queries
  const { data: feeds = [] } = useRSSFeeds();
  const {
    data: logsData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useProcessingLogs(filters);

  const logs = logsData?.logs || [];
  const totalLogs = logsData?.total || 0;
  const currentPage = logsData?.page || 1;
  const totalPages = logsData?.pages || 1;
  const hasNextPage = logsData?.has_next || false;
  const hasPrevPage = logsData?.has_prev || false;

  // ============================================================================
  // CSV EXPORT
  // ============================================================================

  const handleExportCSV = () => {
    if (logs.length === 0) {
      toast.error('No logs to export');
      return;
    }

    // CSV headers
    const headers = [
      'Timestamp',
      'Feed URL',
      'Status',
      'Items Processed',
      'Items Added',
      'Duplicates',
      'Processing Time (s)',
      'Hazard IDs',
    ];

    // CSV rows
    const rows = logs.map((log) => [
      new Date(log.processed_at).toISOString(),
      log.feed_url,
      log.status,
      log.items_processed,
      log.items_added,
      log.duplicates_detected,
      log.processing_time_seconds.toFixed(2),
      log.hazard_ids?.join(';') || '',
    ]);

    // Generate CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `rss_processing_logs_${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${logs.length} log entries`);
  };

  // ============================================================================
  // FILTER HANDLERS
  // ============================================================================

  const handleFeedFilter = (feedUrl: string) => {
    setFilters((prev) => ({
      ...prev,
      feed_url: feedUrl === 'all' ? undefined : feedUrl,
      page: 1, // Reset to first page on filter change
    }));
  };

  const handleStatusFilter = (status: string) => {
    setFilters((prev) => ({
      ...prev,
      status: status === 'all' ? undefined : (status as LogStatus),
      page: 1, // Reset to first page on filter change
    }));
  };

  const handleLimitChange = (limit: string) => {
    setFilters((prev) => ({
      ...prev,
      limit: parseInt(limit),
      page: 1, // Reset to first page on limit change
    }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({
      ...prev,
      page: newPage,
    }));
  };

  const handleRefresh = () => {
    refetch();
    toast.info('Refreshing logs...');
  };

  // ============================================================================
  // TABLE SETUP
  // ============================================================================

  const table = useReactTable({
    data: logs,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-destructive">Error loading logs</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error.message}
          </p>
          <Button onClick={handleRefresh} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Feed Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Feed:</span>
          <Select
            value={filters.feed_url || 'all'}
            onValueChange={handleFeedFilter}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All feeds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All feeds</SelectItem>
              {feeds.map((feed) => (
                <SelectItem key={feed.id} value={feed.feed_url}>
                  {feed.feed_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Select
            value={filters.status || 'all'}
            onValueChange={handleStatusFilter}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Limit Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Show:</span>
          <Select value={filters.limit.toString()} onValueChange={handleLimitChange}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 rounded-md bg-muted px-4 py-2 text-sm">
        <span>
          Showing {logs.length} of {totalLogs} log entries
        </span>
        {isFetching && (
          <span className="text-muted-foreground">Updating...</span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading logs...
                </TableCell>
              </TableRow>
            ) : logs.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No processing logs found. Process some feeds to see results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Server-Side Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages} ({totalLogs} total entries)
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!hasPrevPage || isFetching}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!hasNextPage || isFetching}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
