import { supabase } from './supabaseClient';

const META_API_VERSION = 'v22.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface WhatsAppAccount {
  id: string;
  user_id: string;
  phone_number_id: string | null;
  access_token: string | null;
  display_name: string | null;
  connection_status: 'disconnected' | 'connected';
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppClientStatus {
  configured: boolean;
  ready: boolean;
  status: string;
  accountId: string | null;
  userId: string | null;
}

export interface WhatsAppMessageEvent {
  from: string;
  body: string;
  contactName: string;
  contactNumber: string;
  chatId: string;
}

export interface QueuedMessage {
  id: string;
  account_id: string;
  recipient: string;
  message_content: string;
  status: string;
  retry_count: number;
  batch_id: string | null;
}

type StatusCallback = (status: WhatsAppClientStatus) => void;
type MessageCallback = (msg: WhatsAppMessageEvent) => void;
type ErrorCallback = (err: Error) => void;
type AccountCallback = (account: WhatsAppAccount | null) => void;

class WhatsAppClientService {
  private statusListeners: StatusCallback[] = [];
  private messageListeners: MessageCallback[] = [];
  private errorListeners: ErrorCallback[] = [];
  private accountListeners: AccountCallback[] = [];

  private currentStatus: WhatsAppClientStatus = {
    configured: false,
    ready: false,
    status: 'disconnected',
    accountId: null,
    userId: null,
  };

  private _account: WhatsAppAccount | null = null;

  async getAccount(userId: string): Promise<WhatsAppAccount | null> {
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      this._account = data as WhatsAppAccount;
      this.currentStatus = {
        configured: !!data.access_token,
        ready: !!data.access_token,
        status: data.access_token ? 'connected' : 'disconnected',
        accountId: data.id,
        userId: data.user_id,
      };
    }
    return data as WhatsAppAccount | null;
  }

  async saveConfig(userId: string, phoneNumberId: string, accessToken: string): Promise<WhatsAppAccount> {
    const existing = await this.getAccount(userId);
    const payload = {
      user_id: userId,
      phone_number_id: phoneNumberId,
      access_token: accessToken,
      display_name: 'Meta WhatsApp API',
      connection_status: 'connected' as const,
      last_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { data } = await supabase
        .from('whatsapp_accounts')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      this._account = data as WhatsAppAccount;
    } else {
      const { data } = await supabase
        .from('whatsapp_accounts')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      this._account = data as WhatsAppAccount;
    }

    this.currentStatus = {
      configured: true,
      ready: true,
      status: 'connected',
      accountId: this._account!.id,
      userId,
    };
    this.statusListeners.forEach((cb) => cb(this.currentStatus));
    this.accountListeners.forEach((cb) => cb(this._account));
    return this._account!;
  }

  async disconnect(userId: string): Promise<void> {
    if (this._account) {
      await supabase
        .from('whatsapp_accounts')
        .update({ connection_status: 'disconnected', access_token: null, phone_number_id: null, updated_at: new Date().toISOString() })
        .eq('id', this._account.id);
    }
    this._account = null;
    this.currentStatus = { configured: false, ready: false, status: 'disconnected', accountId: null, userId: null };
    this.statusListeners.forEach((cb) => cb(this.currentStatus));
    this.accountListeners.forEach((cb) => cb(null));
  }

  async sendMessage(phoneNumberId: string, accessToken: string, to: string, message: string): Promise<{ messageId: string }> {
    const res = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { body: message },
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `Meta API error: ${res.status}`);
    }
    const data = await res.json();
    return { messageId: data.messages?.[0]?.id || `meta-${Date.now()}` };
  }

  async logMessage(accountId: string, userId: string, recipient: string, content: string, status: string, direction: string, messageId?: string) {
    await supabase.from('whatsapp_messages').insert({
      account_id: accountId,
      user_id: userId,
      recipient,
      message_content: content,
      status,
      direction,
      message_id: messageId || null,
      created_at: new Date().toISOString(),
    });
  }

  async getMessageLogs(accountId: string, userId: string, filters?: { status?: string; dateRange?: string }): Promise<any[]> {
    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.dateRange === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      query = query.gte('created_at', start.toISOString());
    } else if (filters?.dateRange === 'week') {
      const start = new Date(); start.setDate(start.getDate() - 7);
      query = query.gte('created_at', start.toISOString());
    } else if (filters?.dateRange === 'month') {
      const start = new Date(); start.setMonth(start.getMonth() - 1);
      query = query.gte('created_at', start.toISOString());
    }

    const { data } = await query;
    return (data || []);
  }

  async queueMessages(accountId: string, userId: string, recipients: { phone: string; name?: string }[], messageContent: string, options?: { batchId?: string }): Promise<{ queued: number }> {
    const batchId = options?.batchId || `batch-${Date.now()}`;
    const rows = recipients.map((r) => ({
      account_id: accountId,
      user_id: userId,
      recipient: r.phone,
      message_content: messageContent,
      status: 'pending',
      batch_id: batchId,
      created_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('whatsapp_message_queue').insert(rows);
    if (error) throw new Error(error.message);
    return { queued: rows.length };
  }

  async processQueue(accountId: string, userId: string, phoneNumberId: string, accessToken: string): Promise<number> {
    const { data: pending } = await supabase
      .from('whatsapp_message_queue')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(50);

    if (!pending || pending.length === 0) return 0;

    let processed = 0;
    for (const item of pending) {
      try {
        const result = await this.sendMessage(phoneNumberId, accessToken, item.recipient, item.message_content);
        await supabase.from('whatsapp_message_queue').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', item.id);
        await this.logMessage(accountId, userId, item.recipient, item.message_content, 'sent', 'outbound', result.messageId);
        processed++;
      } catch {
        await supabase.from('whatsapp_message_queue').update({
          status: 'failed',
          retry_count: (item.retry_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', item.id);
        await this.logMessage(accountId, userId, item.recipient, item.message_content, 'failed', 'outbound');
      }
    }
    return processed;
  }

  async getQueueStatus(accountId: string): Promise<{ status: string; count: number }[]> {
    const { data } = await supabase
      .from('whatsapp_message_queue')
      .select('status, count')
      .eq('account_id', accountId)
      .then(({ data: rows }) => {
        if (!rows) return { data: [] };
        const counts: Record<string, number> = {};
        for (const r of rows as any[]) { counts[r.status] = (counts[r.status] || 0) + 1; }
        return { data: Object.entries(counts).map(([status, count]) => ({ status, count })) };
      });
    return data || [];
  }

  getStatus(): WhatsAppClientStatus {
    return this.currentStatus;
  }

  getAccountInfo(): WhatsAppAccount | null {
    return this._account;
  }

  triggerIncomingMessage(msg: WhatsAppMessageEvent) {
    this.messageListeners.forEach((cb) => cb(msg));
  }

  onStatus(cb: StatusCallback) {
    this.statusListeners.push(cb);
    return () => { this.statusListeners = this.statusListeners.filter((l) => l !== cb); };
  }

  onMessage(cb: MessageCallback) {
    this.messageListeners.push(cb);
    return () => { this.messageListeners = this.messageListeners.filter((l) => l !== cb); };
  }

  onError(cb: ErrorCallback) {
    this.errorListeners.push(cb);
    return () => { this.errorListeners = this.errorListeners.filter((l) => l !== cb); };
  }

  onAccount(cb: AccountCallback) {
    this.accountListeners.push(cb);
    return () => { this.accountListeners = this.accountListeners.filter((l) => l !== cb); };
  }
}

export const whatsappClient = new WhatsAppClientService();
