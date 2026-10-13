// Généré depuis le schéma Supabase (outil generate_typescript_types), réduit aux types utilisés.
// À régénérer après chaque migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_calls: {
        Row: {
          ai_mode: string;
          created_at: string;
          dashboard_id: string | null;
          id: string;
          input_tokens: number | null;
          model: string | null;
          organization_id: string;
          output_tokens: number | null;
          provider: string;
          user_id: string | null;
        };
        Insert: {
          ai_mode: string;
          created_at?: string;
          dashboard_id?: string | null;
          id?: string;
          input_tokens?: number | null;
          model?: string | null;
          organization_id: string;
          output_tokens?: number | null;
          provider: string;
          user_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_calls"]["Insert"]>;
        Relationships: [];
      };
      analysis_feedback: {
        Row: {
          created_at: string
          dashboard_id: string
          id: string
          organization_id: string
          suggestion_index: number
          useful: boolean
          user_id: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          dashboard_id: string
          id?: string
          organization_id: string
          suggestion_index: number
          useful: boolean
          user_id?: string
          variation_id: string
        }
        Update: {
          created_at?: string
          dashboard_id?: string
          id?: string
          organization_id?: string
          suggestion_index?: number
          useful?: boolean
          user_id?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_feedback_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json;
          id: number;
          organization_id: string;
          target_id: string | null;
          target_type: string | null;
          user_email: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json;
          id?: never;
          organization_id: string;
          target_id?: string | null;
          target_type?: string | null;
          user_email?: string | null;
          user_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          revoked_at: string | null;
          role: string;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          role: string;
          token_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
        Relationships: [];
      };
      dashboard_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          dashboard_id: string;
          file_name: string;
          id: string;
          organization_id: string;
          period_end: string | null;
          period_start: string | null;
          result: Json;
          row_count: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          dashboard_id: string;
          file_name: string;
          id?: string;
          organization_id: string;
          period_end?: string | null;
          period_start?: string | null;
          result: Json;
          row_count: number;
        };
        Update: Partial<Database["public"]["Tables"]["dashboard_versions"]["Insert"]>;
        Relationships: [];
      };
      dashboard_shares: {
        Row: {
          access: string;
          created_at: string;
          created_by: string | null;
          dashboard_id: string;
          enabled: boolean;
          expires_at: string | null;
          id: string;
          organization_id: string;
          revoked_at: string | null;
          token_hash: string;
        };
        Insert: {
          access: string;
          created_at?: string;
          created_by?: string | null;
          dashboard_id: string;
          enabled?: boolean;
          expires_at?: string | null;
          id?: string;
          organization_id: string;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["dashboard_shares"]["Insert"]>;
        Relationships: [];
      };
      dashboards: {
        Row: {
          ai_mode: string;
          created_at: string;
          created_by: string | null;
          display: Json;
          file_name: string;
          id: string;
          organization_id: string;
          result: Json;
          row_count: number;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          ai_mode: string;
          created_at?: string;
          created_by?: string | null;
          display?: Json;
          file_name: string;
          id?: string;
          organization_id: string;
          result: Json;
          row_count: number;
          title: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["dashboards"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: {
          created_at: string;
          organization_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          role: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          branding: Json;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          branding?: Json;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      shared_dashboard: { Args: { share_token: string }; Returns: Json };
      invitation_info: { Args: { invite_token: string }; Returns: Json };
      accept_invitation: { Args: { invite_token: string }; Returns: string };
      organization_members: { Args: { org: string }; Returns: { user_id: string; email: string; role: string; joined_at: string }[] };
      set_member_role: { Args: { org: string; member: string; new_role: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
