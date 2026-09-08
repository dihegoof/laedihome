export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          audio_url: string | null
          created_at: string
          created_by: string | null
          created_by_name: string
          duration_seconds: number | null
          household_id: string
          id: string
          scheduled_at: string
          title: string | null
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          duration_seconds?: number | null
          household_id?: string
          id?: string
          scheduled_at: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          duration_seconds?: number | null
          household_id?: string
          id?: string
          scheduled_at?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          card_limit: number
          close_day: number | null
          created_at: string
          due_day: number | null
          household_id: string
          id: string
          name: string
        }
        Insert: {
          card_limit?: number
          close_day?: number | null
          created_at?: string
          due_day?: number | null
          household_id?: string
          id?: string
          name: string
        }
        Update: {
          card_limit?: number
          close_day?: number | null
          created_at?: string
          due_day?: number | null
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          created_at: string
          creditor: string | null
          description: string
          household_id: string
          id: string
          installment_value: number
          paid_installments: number
          payment_history: Json
          total_installments: number
          total_value: number
        }
        Insert: {
          created_at?: string
          creditor?: string | null
          description: string
          household_id?: string
          id?: string
          installment_value?: number
          paid_installments?: number
          payment_history?: Json
          total_installments?: number
          total_value?: number
        }
        Update: {
          created_at?: string
          creditor?: string | null
          description?: string
          household_id?: string
          id?: string
          installment_value?: number
          paid_installments?: number
          payment_history?: Json
          total_installments?: number
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "debts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      finances: {
        Row: {
          card_id: string | null
          category: string | null
          created_at: string
          current_installment: number | null
          date: string | null
          description: string
          household_id: string
          id: string
          installment_value: number | null
          total_installments: number | null
          total_value: number | null
          type: string
          value: number
        }
        Insert: {
          card_id?: string | null
          category?: string | null
          created_at?: string
          current_installment?: number | null
          date?: string | null
          description: string
          household_id?: string
          id?: string
          installment_value?: number | null
          total_installments?: number | null
          total_value?: number | null
          type?: string
          value?: number
        }
        Update: {
          card_id?: string | null
          category?: string | null
          created_at?: string
          current_installment?: number | null
          date?: string | null
          description?: string
          household_id?: string
          id?: string
          installment_value?: number | null
          total_installments?: number | null
          total_value?: number | null
          type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "finances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      history: {
        Row: {
          action: string
          created_at: string
          household_id: string
          id: string
          target: string | null
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          household_id?: string
          id?: string
          target?: string | null
          user_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          household_id?: string
          id?: string
          target?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "history_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_settings: {
        Row: {
          created_at: string
          finance_categories: Json
          household_id: string
          product_categories: Json
          theme: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finance_categories?: Json
          household_id?: string
          product_categories?: Json
          theme?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finance_categories?: Json
          household_id?: string
          product_categories?: Json
          theme?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_settings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          name: string
          owner_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code: string
          name?: string
          owner_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          household_id: string
          id: string
          image_url: string | null
          is_essential: boolean
          is_new: boolean
          name: string
          notes: string | null
          out_of_stock_since: string | null
          quantity: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          household_id?: string
          id?: string
          image_url?: string | null
          is_essential?: boolean
          is_new?: boolean
          name: string
          notes?: string | null
          out_of_stock_since?: string | null
          quantity?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          household_id?: string
          id?: string
          image_url?: string | null
          is_essential?: boolean
          is_new?: boolean
          name?: string
          notes?: string | null
          out_of_stock_since?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          household_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          household_id?: string | null
          id: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          household_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      wardrobe_items: {
        Row: {
          color: string | null
          created_at: string
          household_id: string
          id: string
          image_url: string | null
          last_used: string | null
          name: string
          occasion: string | null
          owner_id: string | null
          times_used: number
          type: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          household_id?: string
          id?: string
          image_url?: string | null
          last_used?: string | null
          name: string
          occasion?: string | null
          owner_id?: string | null
          times_used?: number
          type: string
        }
        Update: {
          color?: string | null
          created_at?: string
          household_id?: string
          id?: string
          image_url?: string | null
          last_used?: string | null
          name?: string
          occasion?: string | null
          owner_id?: string | null
          times_used?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wardrobe_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wardrobe_looks: {
        Row: {
          created_at: string
          household_id: string
          id: string
          item_ids: Json
          item_names: Json
        }
        Insert: {
          created_at?: string
          household_id?: string
          id?: string
          item_ids?: Json
          item_names?: Json
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          item_ids?: Json
          item_names?: Json
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_looks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_household: { Args: never; Returns: string }
      email_for_name: { Args: { _name: string }; Returns: string }
      join_household: { Args: { _code: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
