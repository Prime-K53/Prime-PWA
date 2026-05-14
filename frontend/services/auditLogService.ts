import { getUrl } from '../config/api.js';

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
    return headers;
};

export const auditLogService = {
  async getEntityLogs(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    try {
      const response = await fetch(getUrl(`/examination/audit-logs/${entityType}/${entityId}`), {
        headers: getHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      return await response.json();
    } catch (error) {
      console.error('[AuditLogService] Error fetching entity logs:', error);
      return [];
    }
  },

  async getCorrelationTrail(correlationId: string): Promise<AuditLogEntry[]> {
    try {
      const response = await fetch(getUrl(`/examination/audit-trail/${correlationId}`), {
        headers: getHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch audit trail');
      return await response.json();
    } catch (error) {
      console.error('[AuditLogService] Error fetching correlation trail:', error);
      return [];
    }
  }
};
