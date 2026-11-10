// Tipos do schema `public`. Escrito à mão espelhando supabase/migrations enquanto não há projeto cloud;
// será sobrescrito por `pnpm db:types` (supabase gen types). Não edite depois disso.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string;
type Uuid = string;

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      merchants: Table<
        {
          id: Uuid;
          name: string;
          ifood_merchant_id: string | null;
          voice_tone: string;
          min_margin_pct: number;
          timezone: string;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        'name'
      >;
      merchant_members: Table<
        { merchant_id: Uuid; user_id: Uuid; role: 'owner' | 'staff'; created_at: Timestamp },
        'merchant_id' | 'user_id'
      >;
      catalog_items: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          external_id: string | null;
          name: string;
          description: string | null;
          category: string | null;
          price_cents: number;
          cost_cents: number | null;
          status: 'draft' | 'available' | 'unavailable';
          embedding: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        'merchant_id' | 'name' | 'price_cents'
      >;
      menu_uploads: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          storage_path: string;
          status: 'pending' | 'processing' | 'drafted' | 'failed';
          draft: Json | null;
          error: string | null;
          created_by: Uuid | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        'merchant_id' | 'storage_path'
      >;
      orders: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          external_id: string | null;
          placed_at: Timestamp;
          status: 'placed' | 'confirmed' | 'dispatched' | 'concluded' | 'cancelled';
          subtotal_cents: number;
          delivery_fee_cents: number;
          discount_cents: number;
          total_cents: number;
          customer_name: string | null;
          customer_phone: string | null;
          customer_hash: string | null;
          neighborhood: string | null;
          created_at: Timestamp;
        },
        'merchant_id' | 'placed_at' | 'subtotal_cents' | 'total_cents'
      >;
      order_items: Table<
        {
          id: Uuid;
          order_id: Uuid;
          merchant_id: Uuid;
          catalog_item_id: Uuid | null;
          name: string;
          quantity: number;
          unit_price_cents: number;
          total_cents: number;
        },
        'order_id' | 'merchant_id' | 'name' | 'quantity' | 'unit_price_cents' | 'total_cents'
      >;
      reviews: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          external_id: string | null;
          order_id: Uuid | null;
          rating: number;
          comment: string | null;
          customer_name: string | null;
          reviewed_at: Timestamp;
          sentiment: 'positive' | 'neutral' | 'negative' | null;
          topics: string[];
          embedding: string | null;
          created_at: Timestamp;
        },
        'merchant_id' | 'rating' | 'reviewed_at'
      >;
      review_replies: Table<
        {
          id: Uuid;
          review_id: Uuid;
          merchant_id: Uuid;
          body: string;
          status: 'draft' | 'approved' | 'published' | 'rejected';
          approval_id: Uuid | null;
          published_at: Timestamp | null;
          created_at: Timestamp;
        },
        'review_id' | 'merchant_id' | 'body'
      >;
      approvals: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          kind: 'catalog.publish' | 'review.reply' | 'promo.create' | 'message.send';
          payload: Json;
          payload_hash: string;
          summary: string;
          status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';
          token_hash: string | null;
          expires_at: Timestamp | null;
          requested_by: string;
          approved_by: Uuid | null;
          approved_at: Timestamp | null;
          executed_at: Timestamp | null;
          created_at: Timestamp;
        },
        'merchant_id' | 'kind' | 'payload' | 'payload_hash' | 'requested_by'
      >;
      agent_runs: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          conversation_id: Uuid | null;
          agent: string;
          model: string;
          prompt_version: string | null;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number;
          latency_ms: number | null;
          status: 'ok' | 'error' | 'blocked';
          error: string | null;
          trace_id: string | null;
          created_at: Timestamp;
        },
        'merchant_id' | 'agent' | 'model'
      >;
      roi_events: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          kind: string;
          value_cents: number;
          minutes_saved: number;
          ref_id: Uuid | null;
          manual_minutes_estimate: number;
          estimate_source: string;
          flow_duration_ms: number | null;
          created_at: Timestamp;
        },
        'merchant_id' | 'kind'
      >;
      conversations: Table<
        {
          id: Uuid;
          merchant_id: Uuid;
          channel: 'whatsapp' | 'panel';
          external_ref: string | null;
          state: Json;
          last_message_at: Timestamp | null;
          created_at: Timestamp;
        },
        'merchant_id' | 'channel'
      >;
    };
    Views: {
      v_sales_daily: {
        Row: {
          merchant_id: Uuid;
          day: string;
          orders_count: number;
          cancelled_count: number;
          gross_cents: number;
          discount_cents: number;
          total_cents: number;
          avg_ticket_cents: number;
        };
        Relationships: [];
      };
      v_item_performance: {
        Row: {
          merchant_id: Uuid;
          catalog_item_id: Uuid;
          item_name: string;
          category: string | null;
          status: string;
          price_cents: number;
          cost_cents: number | null;
          margin_pct: number | null;
          units_sold: number;
          revenue_cents: number;
          last_sold_at: Timestamp | null;
        };
        Relationships: [];
      };
      v_item_sales_daily: {
        Row: {
          merchant_id: Uuid;
          day: string;
          catalog_item_id: Uuid | null;
          item_name: string;
          units_sold: number;
          revenue_cents: number;
          avg_unit_price_cents: number | null;
        };
        Relationships: [];
      };
      v_reviews: {
        Row: {
          merchant_id: Uuid;
          review_id: Uuid;
          rating: number;
          comment: string | null;
          reviewed_at: Timestamp;
          sentiment: string | null;
          topics: string[];
          has_reply: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_merchant_member: { Args: { target: Uuid }; Returns: boolean };
      is_merchant_owner: { Args: { target: Uuid }; Returns: boolean };
      analyst_merchant_id: { Args: Record<string, never>; Returns: Uuid };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
