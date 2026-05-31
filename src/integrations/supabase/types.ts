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
      ai_chat_memory: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      daily_backup_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          last_backup_time: string | null
          status: string
          tables_backed_up: Json | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_backup_time?: string | null
          status: string
          tables_backed_up?: Json | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_backup_time?: string | null
          status?: string
          tables_backed_up?: Json | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      raw_content: {
        Row: {
          core_hooks: string | null
          created_at: string | null
          date_extracted: string | null
          duration: string | null
          id: string
          new_thumbnail_outline: string | null
          original_summary: string | null
          original_title: string
          processing_step: string | null
          proposed_title: string | null
          published_at: string | null
          published_date: string | null
          source_id: string | null
          status: string | null
          summary_points: Json | null
          target_audience: string | null
          thumbnail_url: string | null
          updated_at: string | null
          video_outline: Json | null
          video_url: string
          views: number | null
        }
        Insert: {
          core_hooks?: string | null
          created_at?: string | null
          date_extracted?: string | null
          duration?: string | null
          id?: string
          new_thumbnail_outline?: string | null
          original_summary?: string | null
          original_title: string
          processing_step?: string | null
          proposed_title?: string | null
          published_at?: string | null
          published_date?: string | null
          source_id?: string | null
          status?: string | null
          summary_points?: Json | null
          target_audience?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_outline?: Json | null
          video_url: string
          views?: number | null
        }
        Update: {
          core_hooks?: string | null
          created_at?: string | null
          date_extracted?: string | null
          duration?: string | null
          id?: string
          new_thumbnail_outline?: string | null
          original_summary?: string | null
          original_title?: string
          processing_step?: string | null
          proposed_title?: string | null
          published_at?: string | null
          published_date?: string | null
          source_id?: string | null
          status?: string | null
          summary_points?: Json | null
          target_audience?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_outline?: Json | null
          video_url?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_content_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources_master"
            referencedColumns: ["id"]
          },
        ]
      }
      script_chunks: {
        Row: {
          annotations: Json | null
          audio_url: string | null
          chunk_index: number
          content: string
          created_at: string | null
          id: string
          script_id: string | null
          slide_id: string | null
          slide_prompt: string | null
          slide_url: string | null
          status: string | null
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          annotations?: Json | null
          audio_url?: string | null
          chunk_index: number
          content: string
          created_at?: string | null
          id?: string
          script_id?: string | null
          slide_id?: string | null
          slide_prompt?: string | null
          slide_url?: string | null
          status?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          annotations?: Json | null
          audio_url?: string | null
          chunk_index?: number
          content?: string
          created_at?: string | null
          id?: string
          script_id?: string | null
          slide_id?: string | null
          slide_prompt?: string | null
          slide_url?: string | null
          status?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "script_chunks_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          content: string
          created_at: string | null
          final_audio_url: string | null
          id: string
          idea_id: string | null
          model: string | null
          status: string | null
          title: string
          updated_at: string | null
          video_type: string | null
          word_count: number | null
        }
        Insert: {
          content: string
          created_at?: string | null
          final_audio_url?: string | null
          id?: string
          idea_id?: string | null
          model?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          video_type?: string | null
          word_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string | null
          final_audio_url?: string | null
          id?: string
          idea_id?: string | null
          model?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          video_type?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scripts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "raw_content"
            referencedColumns: ["id"]
          },
        ]
      }
      sources_master: {
        Row: {
          channel_name: string
          created_at: string | null
          id: string
          source_url: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          channel_name: string
          created_at?: string | null
          id?: string
          source_url: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          channel_name?: string
          created_at?: string | null
          id?: string
          source_url?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      youtube_seo: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          script_id: string | null
          selected_title: string | null
          tags: string[] | null
          thumbnail_lines: Json | null
          thumbnail_prompt: string | null
          thumbnail_url: string | null
          title_variations: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          script_id?: string | null
          selected_title?: string | null
          tags?: string[] | null
          thumbnail_lines?: Json | null
          thumbnail_prompt?: string | null
          thumbnail_url?: string | null
          title_variations?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          script_id?: string | null
          selected_title?: string | null
          tags?: string[] | null
          thumbnail_lines?: Json | null
          thumbnail_prompt?: string | null
          thumbnail_url?: string | null
          title_variations?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_seo_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: true
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
