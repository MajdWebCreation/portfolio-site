/**
 * Generated from the Supabase schema; do not edit by hand.
 *
 * Regenerate after every migration:
 *   npx supabase gen types typescript --project-id wbrqbuctwzpobnvcsomt \
 *     > src/lib/supabase/database.types.ts
 *
 * Exception, 23 September 2026: the inquiries attribution columns and the
 * analytics_facts / analytics_sync_runs tables were written in by hand in
 * the generator's own format, because their migrations (20260923120000 and
 * 20260923120100) were authored but not yet applied to the remote project.
 * Regenerate once they are, and this note goes.
 */

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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_facts: {
        Row: {
          date: string
          dims: Json
          dims_key: string
          metrics: Json
          provider: string
          report: string
          synced_at: string
        }
        Insert: {
          date: string
          dims?: Json
          dims_key?: never
          metrics: Json
          provider: string
          report: string
          synced_at?: string
        }
        Update: {
          date?: string
          dims?: Json
          dims_key?: never
          metrics?: Json
          provider?: string
          report?: string
          synced_at?: string
        }
        Relationships: []
      }
      analytics_sync_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          provider: string
          report: string
          rows_upserted: number | null
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          provider: string
          report: string
          rows_upserted?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          provider?: string
          report?: string
          rows_upserted?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          author: string | null
          category: string
          content: Json
          created_at: string
          excerpt: string
          featured_image: Json | null
          id: string
          meta_description: string
          published_at: string | null
          search_text: string | null
          seo_title: string
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          category: string
          content?: Json
          created_at?: string
          excerpt?: string
          featured_image?: Json | null
          id?: string
          meta_description?: string
          published_at?: string | null
          search_text?: string | null
          seo_title?: string
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          category?: string
          content?: Json
          created_at?: string
          excerpt?: string
          featured_image?: Json | null
          id?: string
          meta_description?: string
          published_at?: string | null
          search_text?: string | null
          seo_title?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_communications: {
        Row: {
          body_html: string | null
          body_text: string
          category: string
          channel: string
          created_at: string
          customer_id: string
          direction: string
          error: string | null
          id: string
          invoice_id: string | null
          project_id: string | null
          provider_message_id: string | null
          quote_id: string | null
          recipient: string
          recurring_service_id: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body_html?: string | null
          body_text: string
          category: string
          channel?: string
          created_at?: string
          customer_id: string
          direction?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          provider_message_id?: string | null
          quote_id?: string | null
          recipient: string
          recurring_service_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body_html?: string | null
          body_text?: string
          category?: string
          channel?: string
          created_at?: string
          customer_id?: string
          direction?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          provider_message_id?: string | null
          quote_id?: string | null
          recipient?: string
          recurring_service_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_communications_invoice_same_customer"
            columns: ["invoice_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "customer_communications_project_same_customer"
            columns: ["project_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "customer_communications_quote_same_customer"
            columns: ["quote_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "customer_communications_service_same_customer"
            columns: ["recurring_service_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "recurring_services"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      customer_payment_providers: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          provider: string
          provider_customer_id: string
          provider_mandate_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          provider: string
          provider_customer_id: string
          provider_mandate_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          provider?: string
          provider_customer_id?: string
          provider_mandate_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_providers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city: string
          company_name: string
          contact_name: string
          country: string
          created_at: string
          email: string
          id: string
          kvk_number: string | null
          notes: string
          phone: string | null
          postal_code: string
          source_inquiry_id: string | null
          source_lead_id: string | null
          status: string
          street: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          city: string
          company_name: string
          contact_name: string
          country?: string
          created_at?: string
          email: string
          id?: string
          kvk_number?: string | null
          notes?: string
          phone?: string | null
          postal_code: string
          source_inquiry_id?: string | null
          source_lead_id?: string | null
          status?: string
          street: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          city?: string
          company_name?: string
          contact_name?: string
          country?: string
          created_at?: string
          email?: string
          id?: string
          kvk_number?: string | null
          notes?: string
          phone?: string | null
          postal_code?: string
          source_inquiry_id?: string | null
          source_lead_id?: string | null
          status?: string
          street?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_source_inquiry_id_fkey"
            columns: ["source_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_prenotifications: {
        Row: {
          amount_cents: number
          billing_period_end: string
          billing_period_start: string
          claimed_at: string
          created_at: string
          currency: string
          customer_id: string
          error: string | null
          id: string
          invoice_id: string
          provider_message_id: string | null
          recipient_email: string
          recurring_service_id: string
          scheduled_debit_on: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          billing_period_end: string
          billing_period_start: string
          claimed_at?: string
          created_at?: string
          currency?: string
          customer_id: string
          error?: string | null
          id?: string
          invoice_id: string
          provider_message_id?: string | null
          recipient_email: string
          recurring_service_id: string
          scheduled_debit_on: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          billing_period_end?: string
          billing_period_start?: string
          claimed_at?: string
          created_at?: string
          currency?: string
          customer_id?: string
          error?: string | null
          id?: string
          invoice_id?: string
          provider_message_id?: string | null
          recipient_email?: string
          recurring_service_id?: string
          scheduled_debit_on?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debit_prenotifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_prenotifications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_prenotifications_invoice_same_customer"
            columns: ["invoice_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "debit_prenotifications_recurring_service_id_fkey"
            columns: ["recurring_service_id"]
            isOneToOne: false
            referencedRelation: "recurring_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_prenotifications_same_customer"
            columns: ["recurring_service_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "recurring_services"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      document_counters: {
        Row: {
          kind: string
          next_sequence: number
          updated_at: string
          year: number
        }
        Insert: {
          kind: string
          next_sequence?: number
          updated_at?: string
          year: number
        }
        Update: {
          kind?: string
          next_sequence?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          campaign: string | null
          company: string | null
          email: string
          id: string
          internal_note: string | null
          landing_path: string | null
          locale: string
          message: string
          name: string
          origin: string
          phone: string | null
          planner: Json | null
          received_at: string
          status: string
          traffic_class: string | null
          traffic_medium: string | null
          traffic_source: string | null
          updated_at: string
        }
        Insert: {
          campaign?: string | null
          company?: string | null
          email: string
          id?: string
          internal_note?: string | null
          landing_path?: string | null
          locale: string
          message: string
          name: string
          origin: string
          phone?: string | null
          planner?: Json | null
          received_at?: string
          status?: string
          traffic_class?: string | null
          traffic_medium?: string | null
          traffic_source?: string | null
          updated_at?: string
        }
        Update: {
          campaign?: string | null
          company?: string | null
          email?: string
          id?: string
          internal_note?: string | null
          landing_path?: string | null
          locale?: string
          message?: string
          name?: string
          origin?: string
          phone?: string | null
          planner?: Json | null
          received_at?: string
          status?: string
          traffic_class?: string | null
          traffic_medium?: string | null
          traffic_source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_collection_events: {
        Row: {
          claimed_at: string
          communication_id: string | null
          created_at: string
          customer_id: string
          days_overdue: number
          eligible_on: string
          error: string | null
          id: string
          invoice_id: string
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
          stage: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string
          communication_id?: string | null
          created_at?: string
          customer_id: string
          days_overdue: number
          eligible_on: string
          error?: string | null
          id?: string
          invoice_id: string
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
          stage: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string
          communication_id?: string | null
          created_at?: string
          customer_id?: string
          days_overdue?: number
          eligible_on?: string
          error?: string | null
          id?: string
          invoice_id?: string
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
          stage?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_collection_events_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "customer_communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_collection_events_invoice_same_customer"
            columns: ["invoice_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      invoice_collections: {
        Row: {
          created_at: string
          invoice_id: string
          note: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          note?: string
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          note?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_collections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          description: string
          id: string
          invoice_id: string
          position: number
          quantity_hundredths: number
          unit_price_cents: number
          vat_rate: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          position: number
          quantity_hundredths: number
          unit_price_cents: number
          vat_rate: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity_hundredths?: number
          unit_price_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_links: {
        Row: {
          amount_cents: number
          checkout_url: string
          created_at: string
          customer_id: string
          id: string
          invoice_id: string
          provider: string
          provider_payment_link_id: string
          sequence_type: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          checkout_url: string
          created_at?: string
          customer_id: string
          id?: string
          invoice_id: string
          provider?: string
          provider_payment_link_id: string
          sequence_type: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          checkout_url?: string
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string
          provider?: string
          provider_payment_link_id?: string
          sequence_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_links_invoice_same_customer"
            columns: ["invoice_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      invoices: {
        Row: {
          activation_note: Json | null
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          customer_city: string
          customer_company_name: string
          customer_contact_name: string
          customer_country: string
          customer_email: string
          customer_id: string
          customer_kvk_number: string | null
          customer_postal_code: string
          customer_street: string
          customer_vat_number: string | null
          document_bytes: number | null
          document_generated_at: string | null
          document_path: string | null
          document_sha256: string | null
          due_date: string
          finalizing_at: string | null
          id: string
          issue_date: string
          issued_at: string | null
          notes: string
          number_provisional: boolean
          number_value: string
          payment_reference: string
          project_id: string | null
          quote_id: string | null
          recipient_email: string | null
          recurring_service_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activation_note?: Json | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          customer_city: string
          customer_company_name: string
          customer_contact_name: string
          customer_country: string
          customer_email: string
          customer_id: string
          customer_kvk_number?: string | null
          customer_postal_code: string
          customer_street: string
          customer_vat_number?: string | null
          document_bytes?: number | null
          document_generated_at?: string | null
          document_path?: string | null
          document_sha256?: string | null
          due_date: string
          finalizing_at?: string | null
          id?: string
          issue_date: string
          issued_at?: string | null
          notes?: string
          number_provisional?: boolean
          number_value: string
          payment_reference?: string
          project_id?: string | null
          quote_id?: string | null
          recipient_email?: string | null
          recurring_service_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activation_note?: Json | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          customer_city?: string
          customer_company_name?: string
          customer_contact_name?: string
          customer_country?: string
          customer_email?: string
          customer_id?: string
          customer_kvk_number?: string | null
          customer_postal_code?: string
          customer_street?: string
          customer_vat_number?: string | null
          document_bytes?: number | null
          document_generated_at?: string | null
          document_path?: string | null
          document_sha256?: string | null
          due_date?: string
          finalizing_at?: string | null
          id?: string
          issue_date?: string
          issued_at?: string | null
          notes?: string
          number_provisional?: boolean
          number_value?: string
          payment_reference?: string
          project_id?: string | null
          quote_id?: string | null
          recipient_email?: string | null
          recurring_service_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_same_customer"
            columns: ["project_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_same_project"
            columns: ["quote_id", "project_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "invoices_recurring_same_customer"
            columns: ["recurring_service_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "recurring_services"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name: string
          contact_name: string
          created_at: string
          email: string | null
          id: string
          last_contact_at: string | null
          next_follow_up_at: string | null
          notes: string
          phone: string | null
          source: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          company_name: string
          contact_name: string
          created_at?: string
          email?: string | null
          id?: string
          last_contact_at?: string | null
          next_follow_up_at?: string | null
          notes?: string
          phone?: string | null
          source: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string | null
          id?: string
          last_contact_at?: string | null
          next_follow_up_at?: string | null
          notes?: string
          phone?: string | null
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_id: string
          description: string
          id: string
          invoice_id: string
          method: string | null
          paid_at: string | null
          provider_payment_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          customer_id: string
          description?: string
          id?: string
          invoice_id: string
          method?: string | null
          paid_at?: string | null
          provider_payment_id?: string | null
          source: string
          status: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_id?: string
          description?: string
          id?: string
          invoice_id?: string
          method?: string | null
          paid_at?: string | null
          provider_payment_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_same_customer"
            columns: ["invoice_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      pricing_addons: {
        Row: {
          addon_group: string
          addon_id: string
          amount_cents: number
          created_at: string
          is_active: boolean
          label_en: string
          label_nl: string
          mode: string
          package_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          addon_group: string
          addon_id: string
          amount_cents: number
          created_at?: string
          is_active?: boolean
          label_en: string
          label_nl: string
          mode: string
          package_id: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          addon_group?: string
          addon_id?: string
          amount_cents?: number
          created_at?: string
          is_active?: boolean
          label_en?: string
          label_nl?: string
          mode?: string
          package_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_addons_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "pricing_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_packages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          monthly_management_from_cents: number
          name_en: string
          name_nl: string
          scope_driven: boolean
          sort_order: number
          starting_price_cents: number
          tagline_en: string
          tagline_nl: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          monthly_management_from_cents: number
          name_en: string
          name_nl: string
          scope_driven?: boolean
          sort_order: number
          starting_price_cents: number
          tagline_en: string
          tagline_nl: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_management_from_cents?: number
          name_en?: string
          name_nl?: string
          scope_driven?: boolean
          sort_order?: number
          starting_price_cents?: number
          tagline_en?: string
          tagline_nl?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_settings: {
        Row: {
          created_at: string
          development_discount_enabled: boolean
          development_discount_percent: number
          id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          development_discount_enabled?: boolean
          development_discount_percent: number
          id?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          development_discount_enabled?: boolean
          development_discount_percent?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          customer_id: string
          deadline: string | null
          id: string
          name: string
          notes: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          deadline?: string | null
          id?: string
          name: string
          notes?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          deadline?: string | null
          id?: string
          name?: string
          notes?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          description: string
          id: string
          position: number
          quantity_hundredths: number
          quote_id: string
          unit_price_cents: number
          vat_rate: number
        }
        Insert: {
          description: string
          id?: string
          position: number
          quantity_hundredths: number
          quote_id: string
          unit_price_cents: number
          vat_rate: number
        }
        Update: {
          description?: string
          id?: string
          position?: number
          quantity_hundredths?: number
          quote_id?: string
          unit_price_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          customer_city: string
          customer_company_name: string
          customer_contact_name: string
          customer_country: string
          customer_email: string
          customer_id: string
          customer_kvk_number: string | null
          customer_postal_code: string
          customer_street: string
          customer_vat_number: string | null
          id: string
          intro: string
          issue_date: string
          notes: string
          number_provisional: boolean
          number_value: string
          project_id: string | null
          recipient_email: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          customer_city: string
          customer_company_name: string
          customer_contact_name: string
          customer_country: string
          customer_email: string
          customer_id: string
          customer_kvk_number?: string | null
          customer_postal_code: string
          customer_street: string
          customer_vat_number?: string | null
          id?: string
          intro?: string
          issue_date: string
          notes?: string
          number_provisional?: boolean
          number_value: string
          project_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          valid_until: string
        }
        Update: {
          created_at?: string
          customer_city?: string
          customer_company_name?: string
          customer_contact_name?: string
          customer_country?: string
          customer_email?: string
          customer_id?: string
          customer_kvk_number?: string | null
          customer_postal_code?: string
          customer_street?: string
          customer_vat_number?: string | null
          id?: string
          intro?: string
          issue_date?: string
          notes?: string
          number_provisional?: boolean
          number_value?: string
          project_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_same_customer"
            columns: ["project_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      recurring_activations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          mollie_payment_id: string | null
          recurring_service_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          mollie_payment_id?: string | null
          recurring_service_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          mollie_payment_id?: string | null
          recurring_service_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_activations_recurring_service_id_fkey"
            columns: ["recurring_service_id"]
            isOneToOne: false
            referencedRelation: "recurring_services"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_services: {
        Row: {
          activation_invoice_id: string | null
          amount_cents: number
          billing_interval: string
          created_at: string
          currency: string
          customer_id: string
          description: string
          id: string
          mollie_subscription_id: string | null
          name: string
          project_id: string | null
          starts_on: string | null
          status: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          activation_invoice_id?: string | null
          amount_cents: number
          billing_interval?: string
          created_at?: string
          currency?: string
          customer_id: string
          description?: string
          id?: string
          mollie_subscription_id?: string | null
          name: string
          project_id?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          activation_invoice_id?: string | null
          amount_cents?: number
          billing_interval?: string
          created_at?: string
          currency?: string
          customer_id?: string
          description?: string
          id?: string
          mollie_subscription_id?: string | null
          name?: string
          project_id?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_services_activation_same_customer"
            columns: ["activation_invoice_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "recurring_services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_services_project_same_customer"
            columns: ["project_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_quote_number: { Args: { p_quote_id: string }; Returns: string }
      begin_invoice_finalization: {
        Args: { p_activation?: Json; p_invoice_id: string }
        Returns: string
      }
      complete_invoice_finalization: {
        Args: {
          p_bytes: number
          p_invoice_id: string
          p_path: string
          p_sha256: string
        }
        Returns: Json
      }
      save_invoice_lines: {
        Args: { p_invoice_id: string; p_lines: Json }
        Returns: undefined
      }
      save_quote_lines: {
        Args: { p_lines: Json; p_quote_id: string }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
