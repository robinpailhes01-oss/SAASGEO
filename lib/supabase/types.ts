// Types TypeScript de la base Supabase
// =====================================
// Generes automatiquement par le MCP Supabase apres application des migrations.
// Pour regenerer apres un changement de schema :
//   pnpm dlx supabase gen types typescript --project-id pwshrjaacusyremrfaly > lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_response_analysis: {
        Row: {
          analyzed_at: string
          brand_citation_present: boolean
          brand_mentioned: boolean
          competitors_cited: string[]
          mention_context: string | null
          mention_position: number | null
          raw_analysis: Json | null
          response_id: string
          sentiment: Database["public"]["Enums"]["sentiment_label"] | null
          sources_cited: string[]
        }
        Insert: {
          analyzed_at?: string
          brand_citation_present?: boolean
          brand_mentioned?: boolean
          competitors_cited?: string[]
          mention_context?: string | null
          mention_position?: number | null
          raw_analysis?: Json | null
          response_id: string
          sentiment?: Database["public"]["Enums"]["sentiment_label"] | null
          sources_cited?: string[]
        }
        Update: {
          analyzed_at?: string
          brand_citation_present?: boolean
          brand_mentioned?: boolean
          competitors_cited?: string[]
          mention_context?: string | null
          mention_position?: number | null
          raw_analysis?: Json | null
          response_id?: string
          sentiment?: Database["public"]["Enums"]["sentiment_label"] | null
          sources_cited?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_response_analysis_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: true
            referencedRelation: "ai_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_responses: {
        Row: {
          cost_usd: number | null
          created_at: string
          error_message: string | null
          id: string
          latency_ms: number | null
          model: string
          provider: Database["public"]["Enums"]["ai_provider"]
          query_id: string
          raw_response: string | null
          sources: Json | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model: string
          provider: Database["public"]["Enums"]["ai_provider"]
          query_id: string
          raw_response?: string | null
          sources?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string
          provider?: Database["public"]["Enums"]["ai_provider"]
          query_id?: string
          raw_response?: string | null
          sources?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_responses_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage: {
        Row: {
          audit_id: string | null
          cost_eur: number
          cost_usd: number
          created_at: string
          id: string
          model: string | null
          provider: Database["public"]["Enums"]["ai_provider"]
          request_type: string | null
          tokens_in: number
          tokens_out: number
          user_id: string | null
        }
        Insert: {
          audit_id?: string | null
          cost_eur?: number
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string | null
          provider: Database["public"]["Enums"]["ai_provider"]
          request_type?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Update: {
          audit_id?: string | null
          cost_eur?: number
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string | null
          provider?: Database["public"]["Enums"]["ai_provider"]
          request_type?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Relationships: []
      }
      audit_business_info: {
        Row: {
          audit_id: string
          brand_aliases: string[]
          brand_name: string
          business_scope: string
          city: string | null
          city_main: string | null
          country: string | null
          created_at: string
          detected_competitors: string[]
          geo_zone: string | null
          industry: string | null
          raw_extraction: Json | null
          region: string | null
          services: Json
        }
        Insert: {
          audit_id: string
          brand_aliases?: string[]
          brand_name: string
          business_scope?: string
          city?: string | null
          city_main?: string | null
          country?: string | null
          created_at?: string
          detected_competitors?: string[]
          geo_zone?: string | null
          industry?: string | null
          raw_extraction?: Json | null
          region?: string | null
          services?: Json
        }
        Update: {
          audit_id?: string
          brand_aliases?: string[]
          brand_name?: string
          business_scope?: string
          city?: string | null
          city_main?: string | null
          country?: string | null
          created_at?: string
          detected_competitors?: string[]
          geo_zone?: string | null
          industry?: string | null
          raw_extraction?: Json | null
          region?: string | null
          services?: Json
        }
        Relationships: []
      }
      audit_recommendations: {
        Row: {
          audit_id: string
          category: string
          created_at: string
          description: string
          id: string
          impact_score: number
          position: number
          priority: Database["public"]["Enums"]["recommendation_priority"]
          title: string
        }
        Insert: {
          audit_id: string
          category: string
          created_at?: string
          description: string
          id?: string
          impact_score: number
          position?: number
          priority: Database["public"]["Enums"]["recommendation_priority"]
          title: string
        }
        Update: {
          audit_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          impact_score?: number
          position?: number
          priority?: Database["public"]["Enums"]["recommendation_priority"]
          title?: string
        }
        Relationships: []
      }
      audit_scores: {
        Row: {
          audit_id: string
          citation_rate: number | null
          computed_at: string
          global_score: number
          mention_rate: number | null
          technical_score: number
          top_competitor: string | null
          visibility_per_provider: Json
          visibility_score: number
        }
        Insert: {
          audit_id: string
          citation_rate?: number | null
          computed_at?: string
          global_score: number
          mention_rate?: number | null
          technical_score: number
          top_competitor?: string | null
          visibility_per_provider?: Json
          visibility_score: number
        }
        Update: {
          audit_id?: string
          citation_rate?: number | null
          computed_at?: string
          global_score?: number
          mention_rate?: number | null
          technical_score?: number
          top_competitor?: string | null
          visibility_per_provider?: Json
          visibility_score?: number
        }
        Relationships: []
      }
      audit_technical: {
        Row: {
          audit_id: string
          category: Database["public"]["Enums"]["tech_category"]
          checks: Json
          created_at: string
          score: number
        }
        Insert: {
          audit_id: string
          category: Database["public"]["Enums"]["tech_category"]
          checks?: Json
          created_at?: string
          score: number
        }
        Update: {
          audit_id?: string
          category?: Database["public"]["Enums"]["tech_category"]
          checks?: Json
          created_at?: string
          score?: number
        }
        Relationships: []
      }
      audits: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: string | null
          error_message: string | null
          geo_target: string | null
          id: string
          language: string | null
          manual_competitors: string[] | null
          progress: number
          status: Database["public"]["Enums"]["audit_status"]
          updated_at: string
          url: string
          url_normalized: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          geo_target?: string | null
          id?: string
          language?: string | null
          manual_competitors?: string[] | null
          progress?: number
          status?: Database["public"]["Enums"]["audit_status"]
          updated_at?: string
          url: string
          url_normalized: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          geo_target?: string | null
          id?: string
          language?: string | null
          manual_competitors?: string[] | null
          progress?: number
          status?: Database["public"]["Enums"]["audit_status"]
          updated_at?: string
          url?: string
          url_normalized?: string
          user_id?: string
        }
        Relationships: []
      }
      email_captures: {
        Row: {
          audit_id: string | null
          created_at: string
          email: string
          id: string
          ip_address: unknown
          source: string | null
          user_agent: string | null
        }
        Insert: {
          audit_id?: string | null
          created_at?: string
          email: string
          id?: string
          ip_address?: unknown
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          audit_id?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_address?: unknown
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      queries: {
        Row: {
          audit_id: string
          category: Database["public"]["Enums"]["query_category"]
          created_at: string
          id: string
          position: number
          source: string
          text: string
        }
        Insert: {
          audit_id: string
          category: Database["public"]["Enums"]["query_category"]
          created_at?: string
          id?: string
          position: number
          source?: string
          text: string
        }
        Update: {
          audit_id?: string
          category?: Database["public"]["Enums"]["query_category"]
          created_at?: string
          id?: string
          position?: number
          source?: string
          text?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          audit_id: string | null
          created_at: string
          id: string
          ip_address: unknown
        }
        Insert: {
          action: string
          audit_id?: string | null
          created_at?: string
          id?: string
          ip_address: unknown
        }
        Update: {
          action?: string
          audit_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
        }
        Relationships: []
      }
    }
    Views: {
      api_usage_monthly: {
        Row: {
          call_count: number | null
          month: string | null
          total_cost_eur: number | null
          total_cost_usd: number | null
          total_tokens_in: number | null
          total_tokens_out: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_action: string
          p_ip: unknown
          p_max: number
          p_window_minutes: number
        }
        Returns: boolean
      }
      user_owns_audit: { Args: { p_audit_id: string }; Returns: boolean }
    }
    Enums: {
      ai_provider: "openai" | "anthropic" | "perplexity" | "gemini"
      audit_status:
        | "queued"
        | "scraping"
        | "extracting"
        | "querying"
        | "analyzing"
        | "scoring"
        | "done"
        | "failed"
      query_category: "branded" | "service" | "comparative"
      recommendation_priority: "quick_win" | "medium" | "long_term"
      sentiment_label: "positive" | "neutral" | "negative"
      tech_category:
        | "foundations"
        | "geo_triptych"
        | "structured_data"
        | "content"
        | "authority"
      user_role: "admin" | "client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
