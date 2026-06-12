import { getUrl, HAS_REMOTE_BACKEND } from '../config/api.js';
import { dbService } from './db';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  details_json?: string;
  details?: string;
  correlation_id?: string;
  ip_address?: string;
  user_agent?: string;
  status: string;
}

const getHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const userJson = sessionStorage.getItem('nexus_user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        if (user.id) headers['x-user-id'] = user.id;
        if (user.role) headers['x-user-role'] = user.role;
      } catch (e) {
        console.warn('Failed to parse user from session storage', e);
      }
    }
    const companyConfig = localStorage.getItem('nexus_company_config');
    if (companyConfig) {
      try {
        const parsed = JSON.parse(companyConfig);
        if (parsed?.companyId) headers['x-company-id'] = parsed.companyId;
      } catch { /* ignore */ }
    }
    return headers;
};

export const auditLogService = {
  async getEntityLogs(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    const getLocalLogs = async () => {
      const rows = await dbService.getAll<any>('auditLogs');
      return rows
        .map((row) => ({
          id: String(row?.id || ''),
          timestamp: String(row?.timestamp || row?.date || new Date().toISOString()),
          action: String(row?.action || ''),
          entity_type: String(row?.entity_type || row?.entityType || ''),
          entity_id: String(row?.entity_id || row?.entityId || ''),
          user_id: String(row?.user_id || row?.userId || ''),
          details_json: row?.details_json,
          details: row?.details,
          correlation_id: row?.correlation_id || row?.correlationId,
          ip_address: row?.ip_address,
          user_agent: row?.user_agent,
          status: String(row?.status || 'LOCAL'),
        }))
        .filter((row) => row.entity_type === entityType && row.entity_id === entityId);
    };

    if (!HAS_REMOTE_BACKEND) {
      return getLocalLogs();
    }

    try {
      const response = await fetch(getUrl(`/examination/audit-logs/${entityType}/${entityId}`), {
        headers: getHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      return await response.json();
    } catch (error) {
      console.error('[AuditLogService] Error fetching entity logs:', error);
      return getLocalLogs();
    }
  },

  async getCorrelationTrail(correlationId: string): Promise<AuditLogEntry[]> {
    const getLocalTrail = async () => {
      const rows = await dbService.getAll<any>('auditLogs');
      return rows
        .map((row) => ({
          id: String(row?.id || ''),
          timestamp: String(row?.timestamp || row?.date || new Date().toISOString()),
          action: String(row?.action || ''),
          entity_type: String(row?.entity_type || row?.entityType || ''),
          entity_id: String(row?.entity_id || row?.entityId || ''),
          user_id: String(row?.user_id || row?.userId || ''),
          details_json: row?.details_json,
          details: row?.details,
          correlation_id: row?.correlation_id || row?.correlationId,
          ip_address: row?.ip_address,
          user_agent: row?.user_agent,
          status: String(row?.status || 'LOCAL'),
        }))
        .filter((row) => String(row.correlation_id || '') === correlationId);
    };

    if (!HAS_REMOTE_BACKEND) {
      return getLocalTrail();
    }

    try {
      const response = await fetch(getUrl(`/examination/audit-trail/${correlationId}`), {
        headers: getHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch audit trail');
      return await response.json();
    } catch (error) {
      console.error('[AuditLogService] Error fetching correlation trail:', error);
      return getLocalTrail();
    }
  }
};
