/**
 * RSS Articles Manager Component
 * 
 * Admin dashboard for viewing and deleting collected RSS news articles stored in Supabase.
 * 
 * Features:
 * - Data table with sorting, filtering, and pagination using TanStack Table
 * - Real-time updates after article deletion
 * - Bulk selection and deletion
 * - Filter by hazard type, validation status, and source feed
 * - Secure deletion with confirmation dialogs
 * - Mobile-responsive design
 * 
 * Access: master_admin, validator roles
 */

import React, { useState, useMemo } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronDown,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Checkbox } from '../../ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import {
  useRSSArticles,
  useDeleteRSSArticle,
  useBulkDeleteRSSArticles,
  useRSSFeeds,
  useUpdateRSSArticle,
  useValidateRSSArticle,
} from '../../../hooks/useRSS';
import { RSSArticle, RSSArticlesFilter } from '../../../types/rss';

// ============================================================================
// HAZARD TYPE CONFIGURATION
// ============================================================================

const HAZARD_TYPES = [
  { value: 'typhoon', label: 'Typhoon', color: 'bg-blue-500' },
  { value: 'flood', label: 'Flood', color: 'bg-cyan-500' },
  { value: 'earthquake', label: 'Earthquake', color: 'bg-orange-500' },
  { value: 'landslide', label: 'Landslide', color: 'bg-amber-600' },
  { value: 'volcanic_eruption', label: 'Volcanic Eruption', color: 'bg-red-600' },
  { value: 'storm_surge', label: 'Storm Surge', color: 'bg-indigo-500' },
  { value: 'drought', label: 'Drought', color: 'bg-yellow-600' },
  { value: 'fire', label: 'Fire', color: 'bg-red-500' },
  { value: 'other', label: 'Other', color: 'bg-gray-500' },
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getHazardBadge(hazardType: string) {
  const config = HAZARD_TYPES.find((h) => h.value === hazardType) || {
    label: hazardType,
    color: 'bg-gray-500',
  };
  return (
    <Badge className={`${config.color} text-white`}>
      {config.label}
    </Badge>
  );
}

function formatDate(dateString: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// TABLE META TYPE
// ============================================================================

interface TableMeta {
  setDeletingArticle: (article: RSSArticle | null) => void;
  handleValidate: (article: RSSArticle) => void;
  handleStatusChange: (article: RSSArticle, status: 'active' | 'resolved' | 'archived') => void;
}

// ============================================================================
// TABLE COLUMNS DEFINITION
// ============================================================================

const columns: ColumnDef<RSSArticle>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ? true :
          table.getIsSomePageRowsSelected() ? 'indeterminate' : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'source_title',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Title
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const title = row.getValue('source_title') as string;
      const url = row.original.source_url;
      return (
        <div className="flex flex-col gap-1 max-w-md">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-medium line-clamp-2 cursor-help">
                  {title}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-lg">
                <p>{title}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'hazard_type',
    header: 'Hazard Type',
    cell: ({ row }) => getHazardBadge(row.getValue('hazard_type')),
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'location_name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Location
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const location = row.getValue('location_name') as string;
      const adminDiv = row.original.admin_division;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{location || 'Unknown'}</span>
          {adminDiv && (
            <span className="text-xs text-muted-foreground">{adminDiv}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'confidence_score',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Confidence
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const score = row.getValue('confidence_score') as number;
      const percentage = Math.round(score * 100);
      const colorClass =
        percentage >= 80
          ? 'text-green-600'
          : percentage >= 60
          ? 'text-yellow-600'
          : 'text-red-600';
      return (
        <div className={`font-mono font-medium ${colorClass}`}>
          {percentage}%
        </div>
      );
    },
  },
  {
    accessorKey: 'validated',
    header: 'Status',
    cell: ({ row }) => {
      const validated = row.getValue('validated') as boolean;
      return validated ? (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Validated
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <XCircle className="h-3 w-3" />
          Pending
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.getValue(id) === (value === 'validated');
    },
  },
  {
    accessorKey: 'source',
    header: 'Source Feed',
    cell: ({ row }) => {
      const source = row.getValue('source') as string;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground max-w-[150px] truncate block cursor-help">
                {source}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{source}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    accessorKey: 'source_published_at',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Published
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-xs whitespace-nowrap">
        {formatDate(row.getValue('source_published_at'))}
      </span>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Collected
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-xs whitespace-nowrap">
        {formatDate(row.getValue('created_at'))}
      </span>
    ),
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row, table }) => {
      const article = row.original;
      const { setDeletingArticle, handleValidate, handleStatusChange } = table.options.meta as TableMeta;
      const isValidated = article.validated;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <span className="sr-only">Open menu</span>
              •••
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            
            {/* Validation Actions */}
            {!isValidated && (
              <DropdownMenuItem
                onClick={() => handleValidate(article)}
                className="text-green-600"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Validate
              </DropdownMenuItem>
            )}
            
            {/* Status Change Actions */}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Change Status</DropdownMenuLabel>
            {article.status !== 'active' && (
              <DropdownMenuItem onClick={() => handleStatusChange(article, 'active')}>
                Mark Active
              </DropdownMenuItem>
            )}
            {article.status !== 'resolved' && (
              <DropdownMenuItem onClick={() => handleStatusChange(article, 'resolved')}>
                Mark Resolved
              </DropdownMenuItem>
            )}
            {article.status !== 'archived' && (
              <DropdownMenuItem onClick={() => handleStatusChange(article, 'archived')}>
                Archive
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(article.source_url)}
            >
              Copy URL
            </DropdownMenuItem>
            {article.source_url && (
              <DropdownMenuItem asChild>
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Source
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeletingArticle(article)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

// ============================================================================
// MAIN COMPONENT
/**
 * Admin interface for viewing, filtering, and managing collected RSS articles.
 *
 * Renders a dashboard that lists RSS articles with sorting, filtering, pagination,
 * column visibility, row selection, single and bulk deletion (with confirmation),
 * validation, and status updates. Shows header statistics and integrates with
 * Supabase-backed queries and mutations for real-time operations.
 *
 * @returns The rendered RSS articles management dashboard UI.
 */

export function RSSArticlesManager() {
  // Filters state - no limit to show all articles
  const [filters, setFilters] = useState<RSSArticlesFilter>({});

  // Query hooks
  const { data, isLoading, error, refetch, isFetching } = useRSSArticles(filters);
  const { data: feeds = [] } = useRSSFeeds();
  const deleteMutation = useDeleteRSSArticle();
  const bulkDeleteMutation = useBulkDeleteRSSArticles();
  const updateMutation = useUpdateRSSArticle();
  const validateMutation = useValidateRSSArticle();

  const articles = useMemo(() => data?.articles ?? [], [data?.articles]);
  const totalCount = data?.total ?? 0;

  // Dialog states
  const [deletingArticle, setDeletingArticle] = useState<RSSArticle | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Table states
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    source: false, // Hide source column by default (can be shown via column toggle)
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  // Selected rows
  const selectedArticleIds = useMemo(() => {
    return Object.keys(rowSelection).map(
      (index) => articles[parseInt(index)]?.id
    ).filter(Boolean);
  }, [rowSelection, articles]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleDeleteArticle = async () => {
    if (!deletingArticle) return;
    await deleteMutation.mutateAsync(deletingArticle.id);
    setDeletingArticle(null);
  };

  const handleBulkDelete = async () => {
    if (selectedArticleIds.length === 0) return;
    await bulkDeleteMutation.mutateAsync(selectedArticleIds);
    setRowSelection({});
    setShowBulkDeleteDialog(false);
  };

  const handleValidate = (article: RSSArticle) => {
    validateMutation.mutate({ id: article.id });
  };

  const handleStatusChange = (article: RSSArticle, status: 'active' | 'resolved' | 'archived') => {
    updateMutation.mutate({ id: article.id, data: { status } });
  };

  const handleFilterChange = (key: keyof RSSArticlesFilter, value: string | boolean | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
    }));
  };

  // ============================================================================
  // TABLE SETUP
  // ============================================================================

  const table = useReactTable({
    data: articles,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    meta: {
      setDeletingArticle,
      handleValidate,
      handleStatusChange,
    } as TableMeta,
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Error Loading Articles
          </CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Articles</CardDescription>
            <CardTitle className="text-2xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Validated</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {articles.filter((a) => a.validated).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Review</CardDescription>
            <CardTitle className="text-2xl text-yellow-600">
              {articles.filter((a) => !a.validated).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Selected</CardDescription>
            <CardTitle className="text-2xl text-blue-600">
              {selectedArticleIds.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap flex-1 items-center gap-2">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search articles..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
              aria-label="Search articles"
            />
          </div>

          {/* Hazard Type Filter */}
          <Select
            value={filters.hazard_type || 'all'}
            onValueChange={(value) => handleFilterChange('hazard_type', value)}
          >
            <SelectTrigger className="w-[160px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Hazard Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {HAZARD_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Validation Status Filter */}
          <Select
            value={
              filters.validated === undefined
                ? 'all'
                : filters.validated
                ? 'validated'
                : 'pending'
            }
            onValueChange={(value) =>
              handleFilterChange(
                'validated',
                value === 'all' ? undefined : value === 'validated'
              )
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="validated">Validated</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          {/* Source Feed Filter */}
          <Select
            value={filters.source || 'all'}
            onValueChange={(value) => handleFilterChange('source', value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Source Feed" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Feeds</SelectItem>
              {feeds.map((feed) => (
                <SelectItem key={feed.id} value={feed.feed_url}>
                  {feed.feed_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columns <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id.replace(/_/g, ' ')}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Bulk Delete Button */}
          {selectedArticleIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowBulkDeleteDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedArticleIds.length})
            </Button>
          )}
        </div>
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
                  <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">Loading articles...</p>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
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
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <p className="text-muted-foreground">No RSS articles found.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Articles will appear here after RSS feeds are processed.
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="flex items-center space-x-2">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount()}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
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

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingArticle !== null}
        onOpenChange={(open) => !open && setDeletingArticle(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete RSS Article
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to delete this article?</p>
              {deletingArticle && (
                <div className="rounded-md bg-muted p-3 mt-2">
                  <p className="font-medium text-sm">{deletingArticle.source_title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getHazardBadge(deletingArticle.hazard_type)} • {deletingArticle.location_name}
                  </p>
                </div>
              )}
              <p className="text-destructive font-medium mt-3">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteArticle}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Multiple Articles
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{' '}
                <span className="font-bold">{selectedArticleIds.length}</span>{' '}
                article(s)?
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete {selectedArticleIds.length} Article(s)
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
