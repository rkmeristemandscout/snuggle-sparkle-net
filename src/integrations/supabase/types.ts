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
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          last_used_ip: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name?: string
          organization_id?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          category: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          metadata: Json
          organization_id: string | null
          request_id: string | null
          summary: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          category: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id?: string | null
          request_id?: string | null
          summary: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id?: string | null
          request_id?: string | null
          summary?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json
          method: string | null
          organization_id: string | null
          path: string | null
          request_id: string | null
          source: string
          stack: string | null
          status: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          metadata?: Json
          method?: string | null
          organization_id?: string | null
          path?: string | null
          request_id?: string | null
          source: string
          stack?: string | null
          status?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          method?: string | null
          organization_id?: string | null
          path?: string | null
          request_id?: string | null
          source?: string
          stack?: string | null
          status?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          key: string
          metadata: Json
          name: string
          organization_id: string | null
          rollout_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          metadata?: Json
          name: string
          organization_id?: string | null
          rollout_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          metadata?: Json
          name?: string
          organization_id?: string | null
          rollout_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          created_at: string
          currency: string
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          number: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          status: string
          stripe_invoice_id: string
          updated_at: string
        }
        Insert: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          number?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          status: string
          stripe_invoice_id: string
          updated_at?: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          number?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          metadata: Json
          organization_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json
          organization_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json
          organization_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          rejected_at: string | null
          role: Database["public"]["Enums"]["org_role"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          rejected_at?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          rejected_at?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          description: string | null
          id: string
          organization_id: string
          paid_at: string | null
          receipt_url: string | null
          status: string
          stripe_charge_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          receipt_url?: string | null
          status: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          receipt_url?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          key: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          key: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          api_key_limit: number | null
          created_at: string
          currency: string
          department_limit: number | null
          description: string | null
          features: Json
          id: string
          interval: string
          is_active: boolean
          key: string
          member_limit: number | null
          name: string
          price_cents: number
          sort_order: number
          storage_limit_mb: number | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          team_limit: number | null
          updated_at: string
        }
        Insert: {
          api_key_limit?: number | null
          created_at?: string
          currency?: string
          department_limit?: number | null
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          key: string
          member_limit?: number | null
          name: string
          price_cents?: number
          sort_order?: number
          storage_limit_mb?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          team_limit?: number | null
          updated_at?: string
        }
        Update: {
          api_key_limit?: number | null
          created_at?: string
          currency?: string
          department_limit?: number | null
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          key?: string
          member_limit?: number | null
          name?: string
          price_cents?: number
          sort_order?: number
          storage_limit_mb?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          team_limit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string
          id: string
          is_system: boolean
          key: string
          name: string
          rank: number
          scope: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          rank?: number
          scope: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          rank?: number
          scope?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          organization_id: string
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_metrics: {
        Row: {
          id: string
          metadata: Json
          metric: string
          organization_id: string
          period_end: string
          period_start: string
          recorded_at: string
          value: number
        }
        Insert: {
          id?: string
          metadata?: Json
          metric: string
          organization_id: string
          period_end?: string
          period_start?: string
          recorded_at?: string
          value?: number
        }
        Update: {
          id?: string
          metadata?: Json
          metric?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          recorded_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          organization_id: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          organization_id?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          organization_id?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { _token: string }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_stats: { Args: never; Returns: Json }
      admin_list_organizations: {
        Args: never
        Returns: {
          created_at: string
          id: string
          member_count: number
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          org_count: number
        }[]
      }
      can_manage_team: {
        Args: { _team: string; _user: string }
        Returns: boolean
      }
      cleanup_expired_invitations: { Args: never; Returns: number }
      cleanup_old_audit_logs: { Args: { _days?: number }; Returns: number }
      cleanup_old_error_logs: { Args: { _days?: number }; Returns: number }
      cleanup_old_notifications: { Args: { _days?: number }; Returns: number }
      create_api_key: {
        Args: {
          _expires_at?: string
          _name: string
          _org: string
          _scopes?: string[]
        }
        Returns: {
          id: string
          prefix: string
          token: string
        }[]
      }
      create_organization: {
        Args: { _description?: string; _name: string; _slug: string }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_email: { Args: never; Returns: string }
      delete_notification: { Args: { _id: string }; Returns: undefined }
      expire_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      get_user_permissions: {
        Args: { _org: string }
        Returns: {
          permission_key: string
        }[]
      }
      get_user_roles: {
        Args: { _org: string }
        Returns: {
          organization_id: string
          role_key: string
          role_name: string
        }[]
      }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
          _user: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: { _org: string; _perm: string; _user: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_super_admin: { Args: { _user: string }; Returns: boolean }
      is_team_member: {
        Args: { _team: string; _user: string }
        Returns: boolean
      }
      leave_organization: { Args: { _org: string }; Returns: undefined }
      log_auth_event: {
        Args: { _action: string; _org?: string }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: { _org?: string }; Returns: number }
      mark_notification_read: { Args: { _id: string }; Returns: undefined }
      notify_org_members: {
        Args: {
          _except: string
          _link: string
          _message: string
          _metadata: Json
          _org: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      regenerate_api_key: {
        Args: { _id: string }
        Returns: {
          id: string
          prefix: string
          token: string
        }[]
      }
      reject_invitation: { Args: { _token: string }; Returns: undefined }
      resend_invitation: {
        Args: { _invitation_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          rejected_at: string | null
          role: Database["public"]["Enums"]["org_role"]
          token: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_api_key: { Args: { _id: string }; Returns: undefined }
      run_background_jobs: { Args: never; Returns: Json }
      shares_org_with: { Args: { _other: string }; Returns: boolean }
      team_org: { Args: { _team: string }; Returns: string }
      write_audit_log: {
        Args: {
          _action: string
          _category: string
          _entity_id?: string
          _entity_type?: string
          _metadata?: Json
          _org: string
          _summary: string
        }
        Returns: string
      }
    }
    Enums: {
      org_role: "owner" | "admin" | "member"
      org_status: "active" | "suspended"
      team_role: "owner" | "member"
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
    Enums: {
      org_role: ["owner", "admin", "member"],
      org_status: ["active", "suspended"],
      team_role: ["owner", "member"],
    },
  },
} as const
