/**
 * RSS Feed Manager Component (RSS-09)
 * 
 * Complete CRUD interface for RSS feed management using TanStack Table
 * 
 * Features:
 * - Data table with sorting, filtering, pagination
 * - Add/Edit/Delete dialogs with form validation
 * - Active/Inactive toggle with optimistic updates
 * - Test Feed button for preview
 * - Real-time statistics display
 * - Mobile-responsive design
 * - **Auto-processing**: Automatically processes RSS feeds every 20 minutes
 *   - Managed by RSSAutoProcessContext (persists across views)
 *   - Non-blocking: Processing runs in background without freezing the UI
 *   - Overlap prevention: Skips if a process is already running
 *   - Visual countdown: Shows time until next automatic run
 *   - Pause/Resume: Can be toggled on/off by the user
 *   - Manual override: "Process Now" resets the timer
 * 
 * Columns: Name, URL, Category, Priority, Active, Last Fetched, Total Hazards, Actions
 * Rate Limits: GET (30/min), POST (10/min), PATCH (20/min), DELETE (10/min), Test (3/min)
 */

import React, { useState } from 'react';
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
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronDown,
  MoreHorizontal,
  Plus,
  RefreshCw,
  TestTube,
  Trash,
  Edit,
  Check,
  X,
  Timer,
  Pause,
  Play,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
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
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { toast } from 'sonner';
import {
  useRSSFeeds,
  useCreateRSSFeed,
  useUpdateRSSFeed,
  useDeleteRSSFeed,
  useTestRSSFeed,
} from '../../../hooks/useRSS';
import { useRSSAutoProcess } from '../../../contexts/RSSAutoProcessContext';
import { RSSFeed, RSSFeedCreate, RSSFeedUpdate } from '../../../types/rss';

// ============================================================================
// FEED CATEGORIES (from backend Philippine news sources)
// ============================================================================

const FEED_CATEGORIES = [
  'National News',
  'Local News',
  'Weather Alerts',
  'Government Bulletins',
  'Emergency Alerts',
  'Other',
] as const;

// ============================================================================
// TABLE COLUMNS DEFINITION
// ============================================================================

export const columns: ColumnDef<RSSFeed>[] = [
  {
    accessorKey: 'feed_name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('feed_name')}</div>
    ),
  },
  {
    accessorKey: 'feed_url',
    header: 'URL',
    cell: ({ row }) => (
      <div className="max-w-xs truncate text-xs text-muted-foreground">
        {row.getValue('feed_url')}
      </div>
    ),
  },
  {
    accessorKey: 'feed_category',
    header: 'Category',
    cell: ({ row }) => (
      <Badge variant="outline">{row.getValue('feed_category')}</Badge>
    ),
  },
  {
    accessorKey: 'priority',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Priority
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-center">{row.getValue('priority')}</div>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              Active
            </>
          ) : (
            <>
              <X className="mr-1 h-3 w-3" />
              Inactive
            </>
          )}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'last_fetched_at',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Last Fetched
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const lastFetched = row.getValue('last_fetched_at') as
        | string
        | undefined;
      if (!lastFetched) return <span className="text-muted-foreground">Never</span>;
      return (
        <span className="text-xs">
          {new Date(lastFetched).toLocaleString()}
        </span>
      );
    },
  },
  {
    accessorKey: 'total_hazards_found',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Hazards
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-center font-medium">
        {row.getValue('total_hazards_found')}
      </div>
    ),
  },
  {
    accessorKey: 'last_fetch_status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('last_fetch_status') as
        | 'success'
        | 'error'
        | 'partial'
        | undefined;
      if (!status) return null;
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
    id: 'actions',
    enableHiding: false,
    cell: ({ row, table }) => {
      const feed = row.original;
      const { setEditingFeed, setDeletingFeedId, handleTestFeed } =
        table.options.meta as TableMeta;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(feed.feed_url)}
            >
              Copy URL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTestFeed(feed.id)}>
              <TestTube className="mr-2 h-4 w-4" />
              Test Feed
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditingFeed(feed)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeletingFeedId(feed.id)}
              className="text-destructive"
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

// ============================================================================
// TABLE META TYPE
// ============================================================================

interface TableMeta {
  setEditingFeed: (feed: RSSFeed) => void;
  setDeletingFeedId: (id: string) => void;
  handleTestFeed: (id: string) => void;
}

// ============================================================================
// FORM STATE TYPES
// ============================================================================

interface FeedFormData {
  feed_url: string;
  feed_name: string;
  feed_category: string;
  priority: number;
  fetch_interval_minutes: number;
  is_active: boolean;
}

const initialFormData: FeedFormData = {
  feed_url: '',
  feed_name: '',
  feed_category: 'National News',
  priority: 5,
  fetch_interval_minutes: 30,
  is_active: true,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RSSFeedManager() {
  // Query hooks
  const { data: feeds = [], isLoading, error } = useRSSFeeds();
  const createMutation = useCreateRSSFeed();
  const updateMutation = useUpdateRSSFeed();
  const deleteMutation = useDeleteRSSFeed();
  const testMutation = useTestRSSFeed();

  // Auto-processing from context (persists across views)
  const { 
    isEnabled: isAutoProcessEnabled, 
    isProcessing, 
    countdown, 
    toggle: toggleAutoProcessing,
    processNow 
  } = useRSSAutoProcess();

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<RSSFeed | null>(null);
  const [deletingFeedId, setDeletingFeedId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<FeedFormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Table states
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'priority', desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  const validateForm = (data: FeedFormData): boolean => {
    const errors: Record<string, string> = {};

    // URL validation
    try {
      new URL(data.feed_url);
    } catch {
      errors.feed_url = 'Invalid URL format';
    }

    // Name validation
    if (!data.feed_name.trim()) {
      errors.feed_name = 'Feed name is required';
    } else if (data.feed_name.length > 255) {
      errors.feed_name = 'Feed name must be less than 255 characters';
    }

    // Priority validation (1-10)
    if (data.priority < 1 || data.priority > 10) {
      errors.priority = 'Priority must be between 1 and 10';
    }

    // Interval validation (1-1440 minutes = 24 hours)
    if (
      data.fetch_interval_minutes < 1 ||
      data.fetch_interval_minutes > 1440
    ) {
      errors.fetch_interval_minutes =
        'Interval must be between 1 and 1440 minutes';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddFeed = async () => {
    if (!validateForm(formData)) return;

    const createData: RSSFeedCreate = {
      feed_url: formData.feed_url,
      feed_name: formData.feed_name,
      feed_category: formData.feed_category,
      priority: formData.priority,
      fetch_interval_minutes: formData.fetch_interval_minutes,
      is_active: formData.is_active,
    };

    try {
      await createMutation.mutateAsync(createData);
      setIsAddDialogOpen(false);
      setFormData(initialFormData);
      setFormErrors({});
    } catch (error) {
      console.error('Create feed error:', error);
    }
  };

  const handleEditFeed = async () => {
    if (!editingFeed || !validateForm(formData)) return;

    const updates: RSSFeedUpdate = {
      feed_name: formData.feed_name,
      feed_category: formData.feed_category,
      priority: formData.priority,
      fetch_interval_minutes: formData.fetch_interval_minutes,
      is_active: formData.is_active,
    };

    try {
      await updateMutation.mutateAsync({ id: editingFeed.id, updates });
      setEditingFeed(null);
      setFormData(initialFormData);
      setFormErrors({});
    } catch (error) {
      console.error('Update feed error:', error);
    }
  };

  const handleDeleteFeed = async () => {
    if (!deletingFeedId) return;

    try {
      await deleteMutation.mutateAsync(deletingFeedId);
      setDeletingFeedId(null);
    } catch (error) {
      console.error('Delete feed error:', error);
    }
  };

  const handleTestFeed = async (feedId: string) => {
    try {
      await testMutation.mutateAsync(feedId);
    } catch (error) {
      console.error('Test feed error:', error);
    }
  };

  const handleProcessAllFeeds = async () => {
    toast.info('Starting RSS feed processing...');
    try {
      await processNow();
    } catch (error) {
      console.error('Process feeds error:', error);
    }
  };

  const openAddDialog = () => {
    setFormData(initialFormData);
    setFormErrors({});
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (feed: RSSFeed) => {
    setFormData({
      feed_url: feed.feed_url,
      feed_name: feed.feed_name,
      feed_category: feed.feed_category,
      priority: feed.priority,
      fetch_interval_minutes: feed.fetch_interval_minutes,
      is_active: feed.is_active,
    });
    setFormErrors({});
    setEditingFeed(feed);
  };

  // ============================================================================
  // TABLE SETUP
  // ============================================================================

  const table = useReactTable({
    data: feeds,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    meta: {
      setEditingFeed: openEditDialog,
      setDeletingFeedId,
      handleTestFeed,
    } as TableMeta,
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-destructive">Error loading RSS feeds</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter feeds..."
            value={
              (table.getColumn('feed_name')?.getFilterValue() as string) ?? ''
            }
            onChange={(event) =>
              table.getColumn('feed_name')?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
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
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-Processing Status Indicator */}
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={toggleAutoProcessing}
              title={isAutoProcessEnabled ? 'Pause auto-processing' : 'Resume auto-processing'}
            >
              {isAutoProcessEnabled ? (
                <Pause className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
            <Timer className={`h-4 w-4 ${isAutoProcessEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            {isAutoProcessEnabled ? (
              <span className="text-muted-foreground">
                Next: <span className="font-mono font-medium text-foreground">{countdown || '--:--'}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Auto-process paused</span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleProcessAllFeeds}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Process Now
              </>
            )}
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Feed
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border">
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
                  Loading feeds...
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
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No RSS feeds configured. Add your first feed to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end space-x-2">
        <div className="text-muted-foreground flex-1 text-sm">
          {table.getFilteredRowModel().rows.length} feed(s) total
        </div>
        <div className="space-x-2">
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

      {/* Add/Edit Feed Dialog */}
      <FeedFormDialog
        open={isAddDialogOpen || editingFeed !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingFeed(null);
            setFormData(initialFormData);
            setFormErrors({});
          }
        }}
        formData={formData}
        setFormData={setFormData}
        formErrors={formErrors}
        isEditing={editingFeed !== null}
        onSubmit={editingFeed ? handleEditFeed : handleAddFeed}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingFeedId !== null}
        onOpenChange={(open: boolean) => !open && setDeletingFeedId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete RSS Feed</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this feed? This will also delete
              all associated processing logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFeed}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// FEED FORM DIALOG COMPONENT
// ============================================================================

interface FeedFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: FeedFormData;
  setFormData: (data: FeedFormData) => void;
  formErrors: Record<string, string>;
  isEditing: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function FeedFormDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  formErrors,
  isEditing,
  onSubmit,
  isSubmitting,
}: FeedFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} RSS Feed</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update RSS feed configuration'
              : 'Add a new Philippine news RSS feed source'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Feed URL */}
          <div className="grid gap-2">
            <Label htmlFor="feed_url">
              Feed URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="feed_url"
              type="url"
              placeholder="https://example.com/rss"
              value={formData.feed_url}
              onChange={(e) =>
                setFormData({ ...formData, feed_url: e.target.value })
              }
              disabled={isEditing} // URL cannot be changed after creation
              className={formErrors.feed_url ? 'border-destructive' : ''}
            />
            {formErrors.feed_url && (
              <p className="text-xs text-destructive">{formErrors.feed_url}</p>
            )}
          </div>

          {/* Feed Name */}
          <div className="grid gap-2">
            <Label htmlFor="feed_name">
              Feed Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="feed_name"
              placeholder="e.g., GMA News"
              value={formData.feed_name}
              onChange={(e) =>
                setFormData({ ...formData, feed_name: e.target.value })
              }
              className={formErrors.feed_name ? 'border-destructive' : ''}
            />
            {formErrors.feed_name && (
              <p className="text-xs text-destructive">{formErrors.feed_name}</p>
            )}
          </div>

          {/* Category */}
          <div className="grid gap-2">
            <Label htmlFor="feed_category">Category</Label>
            <Select
              value={formData.feed_category}
              onValueChange={(value) =>
                setFormData({ ...formData, feed_category: value })
              }
            >
              <SelectTrigger id="feed_category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEED_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority and Interval */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="priority">
                Priority (1-10) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="priority"
                type="number"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: parseInt(e.target.value) || 1,
                  })
                }
                className={formErrors.priority ? 'border-destructive' : ''}
              />
              {formErrors.priority && (
                <p className="text-xs text-destructive">
                  {formErrors.priority}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fetch_interval">Interval (min)</Label>
              <Input
                id="fetch_interval"
                type="number"
                min="1"
                max="1440"
                value={formData.fetch_interval_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fetch_interval_minutes: parseInt(e.target.value) || 30,
                  })
                }
                className={
                  formErrors.fetch_interval_minutes ? 'border-destructive' : ''
                }
              />
              {formErrors.fetch_interval_minutes && (
                <p className="text-xs text-destructive">
                  {formErrors.fetch_interval_minutes}
                </p>
              )}
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Active</Label>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked: boolean) =>
                setFormData({ ...formData, is_active: checked })
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
