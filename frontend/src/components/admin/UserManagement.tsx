/**
 * UserManagement Component
 * 
 * Admin interface for user account management (CRUD operations).
 * Features:
 * - User list table with sorting, filtering, pagination
 * - Create new user with role assignment
 * - Update user role (master_admin only)
 * - Deactivate user account (master_admin only)
 * - Search by email, filter by role/status/organization
 * 
 * Permissions:
 * - Validators can view users (read-only)
 * - Master Admins can create, update roles, deactivate
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Shield,
  UserX,
  Edit,
  RefreshCw,
} from 'lucide-react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { TableSkeleton } from '../dashboard/AnalyticsSkeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { Alert, AlertDescription } from '../ui/alert';
import { toast } from 'sonner';

import { useAuth, UserRole, UserStatus } from '../../contexts/AuthContext';
import { adminApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';

// User data type
interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  organization: string | null;
  department: string | null;
  position: string | null;
  last_login: string | null;
  created_at: string;
}

// User roles enum
const UserRoleEnum = {
  master_admin: 'master_admin',
  validator: 'validator',
  lgu_responder: 'lgu_responder',
  citizen: 'citizen',
} as const;

// Create user form schema
const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  role: z.nativeEnum(UserRoleEnum),
  organization: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

// Update role form schema
const updateRoleSchema = z.object({
  role: z.nativeEnum(UserRoleEnum),
});

type UpdateRoleFormData = z.infer<typeof updateRoleSchema>;

const UserManagement: React.FC = () => {
  const { hasRole, userProfile } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [updateRoleDialogOpen, setUpdateRoleDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const isMasterAdmin = hasRole('master_admin');

  // Create user form
  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      password: '',
      full_name: '',
      role: 'lgu_responder',
      organization: '',
      department: '',
      position: '',
    },
  });

  // Update role form
  const updateRoleForm = useForm<UpdateRoleFormData>({
    resolver: zodResolver(updateRoleSchema),
  });

  // Fetch users using React Query for better caching
  const { data: usersData, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'users', { pagination, roleFilter, statusFilter }],
    queryFn: async () => {
      const params: {
        role?: string;
        status?: string;
        limit: number;
        offset: number;
      } = {
        limit: pagination.pageSize,
        offset: pagination.pageIndex * pagination.pageSize,
      };

      if (roleFilter !== 'all') params.role = roleFilter;
      if (statusFilter !== 'all') params.status = statusFilter;

      const response = await adminApi.users.list(params);
      // eslint-disable-next-line no-console
      console.log('[UserManagement] API response:', response);
      // eslint-disable-next-line no-console
      console.log('[UserManagement] Is array?', Array.isArray(response));
      // Backend returns array directly, not wrapped in {users: []}
      return Array.isArray(response) ? response : [];
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
  });

  // Set users from query data
  useEffect(() => {
    if (usersData) {
      setUsers(usersData);
    }
  }, [usersData]);

  // Subscribe to Realtime changes for user_profiles table
  useEffect(() => {
    const channel = supabase
      .channel('user_profiles_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'gaia',
          table: 'user_profiles',
        },
        () => {
          // eslint-disable-next-line no-console
          console.log('[UserManagement] User profile changed, refetching...');
          refetch(); // Only refetch when actual database changes occur
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Create user
  const onCreateUser = async (data: CreateUserFormData) => {
    try {
      await adminApi.users.create(data);
      toast.success('User created successfully');
      setCreateDialogOpen(false);
      createForm.reset();
      // Realtime subscription will automatically trigger refetch
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating user:', error);
      toast.error(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Update role
  const onUpdateRole = async (data: UpdateRoleFormData) => {
    if (!selectedUser) return;

    try {
      await adminApi.users.updateRole(selectedUser.id, data.role);
      toast.success('User role updated successfully');
      setUpdateRoleDialogOpen(false);
      updateRoleForm.reset();
      setSelectedUser(null);
      // Realtime subscription will automatically trigger refetch
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error updating role:', error);
      toast.error(`Failed to update role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Deactivate user
  const onDeactivateUser = async () => {
    if (!selectedUser) return;

    try {
      await adminApi.users.deactivate(selectedUser.id);
      toast.success('User deactivated successfully');
      setDeactivateDialogOpen(false);
      setSelectedUser(null);
      // Realtime subscription will automatically trigger refetch
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deactivating user:', error);
      toast.error(`Failed to deactivate user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Role badge color
  const getRoleBadgeVariant = (role: UserRole): 'default' | 'secondary' | 'outline' => {
    switch (role) {
      case 'master_admin': return 'default';
      case 'validator': return 'secondary';
      case 'lgu_responder': return 'outline';
      default: return 'outline';
    }
  };

  // Status badge color
  const getStatusBadgeVariant = (status: UserStatus): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (status) {
      case 'active': return 'default';
      case 'pending_activation': return 'secondary';
      case 'inactive': return 'destructive';
      case 'suspended': return 'destructive';
      default: return 'outline';
    }
  };

  // Table columns
  const columns: ColumnDef<UserData>[] = [
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.email}</span>
          {row.original.full_name && (
            <span className="text-sm text-muted-foreground">{row.original.full_name}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={getRoleBadgeVariant(row.original.role)}>
          {row.original.role.replace('_', ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={getStatusBadgeVariant(row.original.status)}>
          {row.original.status.replace('_', ' ').toUpperCase()}
        </Badge>
      ),
    },
    {
      accessorKey: 'organization',
      header: 'Organization',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.organization || '-'}</span>
          {row.original.department && (
            <span className="text-sm text-muted-foreground">{row.original.department}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'last_login',
      header: 'Last Login',
      cell: ({ row }) => (
        row.original.last_login
          ? new Date(row.original.last_login).toLocaleString()
          : 'Never'
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const user = row.original;
        const isSelf = user.id === userProfile?.id;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isMasterAdmin && !isSelf && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedUser(user);
                      updateRoleForm.setValue('role', user.role);
                      setUpdateRoleDialogOpen(true);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Update Role
                  </DropdownMenuItem>
                  {user.status === 'active' && (
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedUser(user);
                        setDeactivateDialogOpen(true);
                      }}
                      className="text-red-600"
                    >
                      <UserX className="mr-2 h-4 w-4" />
                      Deactivate
                    </DropdownMenuItem>
                  )}
                </>
              )}
              {isSelf && (
                <DropdownMenuItem disabled>
                  <Shield className="mr-2 h-4 w-4" />
                  Cannot modify own account
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // Table instance
  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>
              {isMasterAdmin ? 'Create, update, and manage user accounts' : 'View user accounts (read-only)'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {isMasterAdmin && (
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              value={(table.getColumn('email')?.getFilterValue() as string) ?? ''}
              onChange={(event) => table.getColumn('email')?.setFilterValue(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="master_admin">Master Admin</SelectItem>
              <SelectItem value="validator">Validator</SelectItem>
              <SelectItem value="lgu_responder">LGU Responder</SelectItem>
              <SelectItem value="citizen">Citizen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending_activation">Pending</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : (
          <>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between py-4">
              <div className="text-sm text-muted-foreground">
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  users.length
                )}{' '}
                of {users.length} users
              </div>
              <div className="flex gap-2">
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
          </>
        )}

        {/* Create User Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Create a new user account. The user will receive an email to verify their account.
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateUser)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="********" {...field} />
                      </FormControl>
                      <FormDescription>Minimum 8 characters</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Juan Dela Cruz" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="master_admin">Master Admin</SelectItem>
                          <SelectItem value="validator">Validator</SelectItem>
                          <SelectItem value="lgu_responder">LGU Responder</SelectItem>
                          <SelectItem value="citizen">Citizen</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="organization"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Quezon City CDRRMO" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Operations" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Response Officer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createForm.formState.isSubmitting}>
                    {createForm.formState.isSubmitting ? 'Creating...' : 'Create User'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Update Role Dialog */}
        <Dialog open={updateRoleDialogOpen} onOpenChange={setUpdateRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update User Role</DialogTitle>
              <DialogDescription>
                Change the role for {selectedUser?.email}
              </DialogDescription>
            </DialogHeader>
            <Form {...updateRoleForm}>
              <form onSubmit={updateRoleForm.handleSubmit(onUpdateRole)} className="space-y-4">
                <FormField
                  control={updateRoleForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select new role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="master_admin">Master Admin</SelectItem>
                          <SelectItem value="validator">Validator</SelectItem>
                          <SelectItem value="lgu_responder">LGU Responder</SelectItem>
                          <SelectItem value="citizen">Citizen</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    This action will be logged in the audit trail.
                  </AlertDescription>
                </Alert>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setUpdateRoleDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateRoleForm.formState.isSubmitting}>
                    {updateRoleForm.formState.isSubmitting ? 'Updating...' : 'Update Role'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Deactivate User Dialog */}
        <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate User</DialogTitle>
              <DialogDescription>
                Are you sure you want to deactivate {selectedUser?.email}?
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <UserX className="h-4 w-4" />
              <AlertDescription>
                This will prevent the user from logging in. This action can be reversed by reactivating the user.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={onDeactivateUser}>
                Deactivate User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default UserManagement;
