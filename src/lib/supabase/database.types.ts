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
