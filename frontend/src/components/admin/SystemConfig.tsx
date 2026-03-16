/**
 * System Configuration Component (AC-02)
 * 
 * Features:
 * - View all system configuration parameters
 * - Edit configuration with validation (min/max, type checking)
 * - Save confirmation with audit trail
 * - Real-time sync with database
 * 
 * Module: AC-02 (Configuration Management)
 * Permissions: Master Admin only (read/write), Validators (read-only)
 */

import React, { useState } from 'react';
import { Edit2, Save, X, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { adminApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface SystemConfig {
  id: string;
  config_key: string;
  config_value: string;
  description: string | null;
  value_type: string;
  min_value: number | null;
  max_value: number | null;
  modified_by: string | null;
  modified_at: string | null;
  created_at: string;
}

const updateConfigSchema = z.object({
  config_value: z.string().min(1, 'Value is required'),
});

const SystemConfig: React.FC = () => {
  const { hasRole } = useAuth();
  const isMasterAdmin = hasRole('master_admin');

  // Fetch system configuration with React Query
  const { data: configs = [], isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['admin', 'systemConfig'],
    queryFn: async () => await adminApi.config.list(),
    staleTime: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const error = queryError ? (queryError as Error).message : null;
  const [selectedConfig, setSelectedConfig] = useState<SystemConfig | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<z.infer<typeof updateConfigSchema>>({
    resolver: zodResolver(updateConfigSchema),
    defaultValues: {
      config_value: '',
    },
  });



  // Open edit dialog
  const handleEdit = (config: SystemConfig) => {
    setSelectedConfig(config);
    form.reset({ config_value: config.config_value });
    setIsEditDialogOpen(true);
  };

  // Save configuration
  const onSave = async (values: z.infer<typeof updateConfigSchema>) => {
    if (!selectedConfig) return;

    setIsSaving(true);

    try {
      // Validate number type and min/max
      if (selectedConfig.value_type === 'number') {
        const numValue = parseFloat(values.config_value);
        if (isNaN(numValue)) {
          form.setError('config_value', { message: 'Value must be a valid number' });
          setIsSaving(false);
          return;
        }
        if (selectedConfig.min_value !== null && numValue < selectedConfig.min_value) {
          form.setError('config_value', { message: `Value must be >= ${selectedConfig.min_value}` });
          setIsSaving(false);
          return;
        }
        if (selectedConfig.max_value !== null && numValue > selectedConfig.max_value) {
          form.setError('config_value', { message: `Value must be <= ${selectedConfig.max_value}` });
          setIsSaving(false);
          return;
        }
      }

      await adminApi.config.update(selectedConfig.config_key, values.config_value);

      // Refresh config list
      await refetch();

      setIsEditDialogOpen(false);
      setSelectedConfig(null);
    } catch (err) {
      console.error('Error updating config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const getValueTypeBadge = (type: string) => {
    switch (type) {
      case 'number':
        return <Badge variant="default">Number</Badge>;
      case 'string':
        return <Badge variant="secondary">String</Badge>;
      case 'boolean':
        return <Badge variant="outline">Boolean</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Configuration</CardTitle>
        <CardDescription>
          Manage system parameters and thresholds (AC-02) {!isMasterAdmin && '(Read-only)'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Configuration Table */}
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">Configuration Key</TableHead>
                <TableHead className="font-semibold">Current Value</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Constraints</TableHead>
                <TableHead className="font-semibold">Last Modified</TableHead>
                {isMasterAdmin && <TableHead className="font-semibold w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isMasterAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    Loading configuration...
                  </TableCell>
                </TableRow>
              ) : configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMasterAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    No configuration parameters found
                  </TableCell>
                </TableRow>
              ) : (
                configs.map((config: SystemConfig) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{config.config_key}</span>
                        {config.description && (
                          <span className="text-xs text-muted-foreground">{config.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{config.config_value}</span>
                    </TableCell>
                    <TableCell>{getValueTypeBadge(config.value_type)}</TableCell>
                    <TableCell>
                      {config.value_type === 'number' && (config.min_value !== null || config.max_value !== null) ? (
                        <span className="text-sm text-muted-foreground">
                          {config.min_value !== null && `min: ${config.min_value}`}
                          {config.min_value !== null && config.max_value !== null && ', '}
                          {config.max_value !== null && `max: ${config.max_value}`}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.modified_at ? (
                        <span className="text-xs text-muted-foreground">
                          {new Date(config.modified_at).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    {isMasterAdmin && (
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(config)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit Configuration Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Configuration</DialogTitle>
              <DialogDescription>
                Update system configuration parameter. Changes are logged in audit trail.
              </DialogDescription>
            </DialogHeader>

            {selectedConfig && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Key:</span>
                      <Badge variant="secondary">{selectedConfig.config_key}</Badge>
                    </div>
                    {selectedConfig.description && (
                      <p className="text-sm text-muted-foreground">{selectedConfig.description}</p>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name="config_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Value</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={`Enter ${selectedConfig.value_type} value`}
                            type={selectedConfig.value_type === 'number' ? 'number' : 'text'}
                          />
                        </FormControl>
                        {selectedConfig.value_type === 'number' && (
                          <FormDescription>
                            {selectedConfig.min_value !== null && selectedConfig.max_value !== null
                              ? `Must be between ${selectedConfig.min_value} and ${selectedConfig.max_value}`
                              : selectedConfig.min_value !== null
                              ? `Must be at least ${selectedConfig.min_value}`
                              : selectedConfig.max_value !== null
                              ? `Must be at most ${selectedConfig.max_value}`
                              : ''}
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Alert className="border-yellow-500 bg-yellow-50">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">
                      This change will be logged in the audit trail and may affect system behavior.
                    </AlertDescription>
                  </Alert>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditDialogOpen(false)}
                      disabled={isSaving}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default SystemConfig;
