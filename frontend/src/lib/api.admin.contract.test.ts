import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
          },
        },
      }),
    },
  },
}));

import { adminApi } from './api';

describe('adminApi contract alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;
  });

  it('sends config_value payload key when updating system config', async () => {
    await adminApi.config.update('confidence_threshold_rss', '0.75');

    const [, options] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options as RequestInit).body).toBe(JSON.stringify({ config_value: '0.75' }));
  });

  it('uses event query parameter for audit log filtering', async () => {
    await adminApi.auditLogs.list({ event: 'report_rejected' });

    const [url] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('event=report_rejected');
    expect(String(url)).not.toContain('action=');
  });
});