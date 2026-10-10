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
      dashboards: {
        Row: {
          ai_mode: string;
          created_at: string;
          created_by: string | null;
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
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
