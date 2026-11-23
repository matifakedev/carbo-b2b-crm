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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_bootstrap: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      affiliations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          import_batch_id: string | null
          is_current: boolean | null
          notes: string | null
          organization_id: string
          person_id: string
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          start_date: string | null
          tenure_known: boolean
          title: string | null
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          import_batch_id?: string | null
          is_current?: boolean | null
          notes?: string | null
          organization_id: string
          person_id: string
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          start_date?: string | null
          tenure_known?: boolean
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          import_batch_id?: string | null
          is_current?: boolean | null
          notes?: string | null
          organization_id?: string
          person_id?: string
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          start_date?: string | null
          tenure_known?: boolean
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliations_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_actions: {
        Row: {
          after: Json | null
          before: Json | null
          created_at: string
          created_by: string | null
          id: string
          op: string
          operation_id: string | null
          record_id: string
          seq: number
          summary: string
          table_name: string
          thread_id: string | null
          undone_at: string | null
          undone_by: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          op: string
          operation_id?: string | null
          record_id: string
          seq?: number
          summary: string
          table_name: string
          thread_id?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          op?: string
          operation_id?: string | null
          record_id?: string
          seq?: number
          summary?: string
          table_name?: string
          thread_id?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_actions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "brain_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_extractions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          model: string | null
          source_document_id: string
          status: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          model?: string | null
          source_document_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          model?: string | null
          source_document_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_extractions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_extractions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_messages: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          parts: Json
          role: string
          thread_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parts?: Json
          role: string
          thread_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "brain_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_operations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          op_key: string
          result: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          op_key: string
          result: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          op_key?: string
          result?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_proposals: {
        Row: {
          ambiguity: string | null
          created_at: string
          created_by: string | null
          created_record_id: string | null
          created_record_type: string | null
          decided_at: string | null
          decided_by: string | null
          evidence: string | null
          extraction_id: string
          final: Json | null
          id: string
          kind: string
          position: number
          proposed: Json
          status: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          ambiguity?: string | null
          created_at?: string
          created_by?: string | null
          created_record_id?: string | null
          created_record_type?: string | null
          decided_at?: string | null
          decided_by?: string | null
          evidence?: string | null
          extraction_id: string
          final?: Json | null
          id?: string
          kind: string
          position?: number
          proposed: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          ambiguity?: string | null
          created_at?: string
          created_by?: string | null
          created_record_id?: string | null
          created_record_type?: string | null
          decided_at?: string | null
          decided_by?: string | null
          evidence?: string | null
          extraction_id?: string
          final?: Json | null
          id?: string
          kind?: string
          position?: number
          proposed?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_proposals_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "brain_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_queries: {
        Row: {
          answer: Json | null
          cited: Json
          created_at: string
          created_by: string | null
          focus_id: string
          focus_type: string
          id: string
          model: string | null
          question: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          answer?: Json | null
          cited?: Json
          created_at?: string
          created_by?: string | null
          focus_id: string
          focus_type: string
          id?: string
          model?: string | null
          question: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          answer?: Json | null
          cited?: Json
          created_at?: string
          created_by?: string | null
          focus_id?: string
          focus_type?: string
          id?: string
          model?: string | null
          question?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_queries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_requests: {
        Row: {
          created_at: string
          id: string
          request_id: string
          status: string
          thread_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_threads: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          focus_id: string | null
          focus_type: string | null
          id: string
          owner_user_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          focus_id?: string | null
          focus_type?: string | null
          id?: string
          owner_user_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          focus_id?: string | null
          focus_type?: string | null
          id?: string
          owner_user_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      carbo_capabilities: {
        Row: {
          applications: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          communicable: string | null
          created_at: string
          created_by: string | null
          evidence: string | null
          id: string
          is_commercial_sensitive: boolean
          limits: string | null
          references_text: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          applications?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          communicable?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          is_commercial_sensitive?: boolean
          limits?: string | null
          references_text?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          applications?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          communicable?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          is_commercial_sensitive?: boolean
          limits?: string | null
          references_text?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carbo_capabilities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      carbo_context: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          body: string
          created_at: string
          created_by: string | null
          evidence: string | null
          id: string
          is_sensitive: boolean
          kind: string
          source_detail: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          is_sensitive?: boolean
          kind: string
          source_detail?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          id?: string
          is_sensitive?: boolean
          kind?: string
          source_detail?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carbo_context_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_interest: {
        Row: {
          conditions: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          person_id: string
          status: Database["public"]["Enums"]["commission_status"]
          updated_at: string
          updated_by: string | null
          wants_refer: boolean
          wants_sell: boolean
          workspace_id: string
        }
        Insert: {
          conditions?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          person_id: string
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
          updated_by?: string | null
          wants_refer?: boolean
          wants_sell?: boolean
          workspace_id: string
        }
        Update: {
          conditions?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          person_id?: string
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
          updated_by?: string | null
          wants_refer?: boolean
          wants_sell?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_interest_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_interest_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_interest_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_links: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          introduction_id: string | null
          organization_id: string | null
          person_id: string | null
          project_id: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          introduction_id?: string | null
          organization_id?: string | null
          person_id?: string | null
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          introduction_id?: string | null
          organization_id?: string | null
          person_id?: string | null
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_links_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_links_introduction_id_fkey"
            columns: ["introduction_id"]
            isOneToOne: false
            referencedRelation: "introductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_links_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          occurred_at: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          created_by: string | null
          file_hash: string
          file_name: string
          id: string
          revert_summary: Json | null
          reverted_at: string | null
          reverted_by: string | null
          status: string
          summary: Json | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          file_hash: string
          file_name: string
          id?: string
          revert_summary?: Json | null
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          file_hash?: string
          file_name?: string
          id?: string
          revert_summary?: Json | null
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          decision: string
          id: string
          organization_id: string | null
          person_id: string | null
          raw: Json
          row_number: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          decision: string
          id?: string
          organization_id?: string | null
          person_id?: string | null
          raw: Json
          row_number: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          decision?: string
          id?: string
          organization_id?: string | null
          person_id?: string | null
          raw?: Json
          row_number?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      introductions: {
        Row: {
          archived_at: string | null
          context: string | null
          created_at: string
          created_by: string | null
          follow_up_at: string | null
          id: string
          introduced_person_id: string | null
          introducer_person_id: string | null
          kind: Database["public"]["Enums"]["intro_kind"]
          next_action: string | null
          occurred_at: string | null
          owner_user_id: string | null
          purpose: string | null
          requested_at: string | null
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["intro_status"]
          target_description: string | null
          target_org_id: string | null
          target_person_id: string | null
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_at?: string | null
          id?: string
          introduced_person_id?: string | null
          introducer_person_id?: string | null
          kind?: Database["public"]["Enums"]["intro_kind"]
          next_action?: string | null
          occurred_at?: string | null
          owner_user_id?: string | null
          purpose?: string | null
          requested_at?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["intro_status"]
          target_description?: string | null
          target_org_id?: string | null
          target_person_id?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_at?: string | null
          id?: string
          introduced_person_id?: string | null
          introducer_person_id?: string | null
          kind?: Database["public"]["Enums"]["intro_kind"]
          next_action?: string | null
          occurred_at?: string | null
          owner_user_id?: string | null
          purpose?: string | null
          requested_at?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["intro_status"]
          target_description?: string | null
          target_org_id?: string | null
          target_person_id?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "introductions_introduced_person_id_fkey"
            columns: ["introduced_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_introducer_person_id_fkey"
            columns: ["introducer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_target_person_id_fkey"
            columns: ["target_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          meeting_id: string
          person_id: string
          role_note: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          meeting_id: string
          person_id: string
          role_note?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          meeting_id?: string
          person_id?: string
          role_note?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          archived_at: string | null
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          meeting_date: string | null
          notes: string | null
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          meeting_date?: string | null
          notes?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          meeting_date?: string | null
          notes?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      needs: {
        Row: {
          archived_at: string | null
          confirmed: boolean
          conversation_id: string | null
          created_at: string
          created_by: string | null
          description: string
          evidence: string | null
          id: string
          organization_id: string | null
          person_id: string | null
          source_document_id: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          confirmed?: boolean
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          evidence?: string | null
          id?: string
          organization_id?: string | null
          person_id?: string | null
          source_document_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          confirmed?: boolean
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          evidence?: string | null
          id?: string
          organization_id?: string | null
          person_id?: string | null
          source_document_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "needs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          advance_criteria: string | null
          amount: number | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          id: string
          in_pipeline: boolean | null
          kind: Database["public"]["Enums"]["opportunity_kind"]
          known_pending: string | null
          need: string
          owner_user_id: string | null
          project_id: string
          rationale: string
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          stage: Database["public"]["Enums"]["opportunity_stage"]
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          advance_criteria?: string | null
          amount?: number | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          in_pipeline?: boolean | null
          kind?: Database["public"]["Enums"]["opportunity_kind"]
          known_pending?: string | null
          need: string
          owner_user_id?: string | null
          project_id: string
          rationale: string
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          advance_criteria?: string | null
          amount?: number | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          in_pipeline?: boolean | null
          kind?: Database["public"]["Enums"]["opportunity_kind"]
          known_pending?: string | null
          need?: string
          owner_user_id?: string | null
          project_id?: string
          rationale?: string
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_events: {
        Row: {
          created_at: string
          created_by: string | null
          from_stage: Database["public"]["Enums"]["opportunity_stage"] | null
          id: string
          note: string | null
          opportunity_id: string
          to_stage: Database["public"]["Enums"]["opportunity_stage"]
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_stage?: Database["public"]["Enums"]["opportunity_stage"] | null
          id?: string
          note?: string | null
          opportunity_id: string
          to_stage: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_stage?: Database["public"]["Enums"]["opportunity_stage"] | null
          id?: string
          note?: string | null
          opportunity_id?: string
          to_stage?: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          import_batch_id: string | null
          location: string | null
          name: string
          normalized_name: string | null
          org_roles: string[]
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          website: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          import_batch_id?: string | null
          location?: string | null
          name: string
          normalized_name?: string | null
          org_roles?: string[]
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          website?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          import_batch_id?: string | null
          location?: string | null
          name?: string
          normalized_name?: string | null
          org_roles?: string[]
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          import_batch_id: string | null
          location: string | null
          normalized_name: string | null
          notes: string | null
          person_roles: string[]
          relationship_context: string | null
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          import_batch_id?: string | null
          location?: string | null
          normalized_name?: string | null
          notes?: string | null
          person_roles?: string[]
          relationship_context?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          import_batch_id?: string | null
          location?: string | null
          normalized_name?: string | null
          notes?: string | null
          person_roles?: string[]
          relationship_context?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      person_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          kind: Database["public"]["Enums"]["contact_kind"]
          label: string | null
          normalized_value: string | null
          person_id: string
          source_detail: string | null
          updated_at: string
          updated_by: string | null
          value: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          kind: Database["public"]["Enums"]["contact_kind"]
          label?: string | null
          normalized_value?: string | null
          person_id: string
          source_detail?: string | null
          updated_at?: string
          updated_by?: string | null
          value: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          kind?: Database["public"]["Enums"]["contact_kind"]
          label?: string | null
          normalized_value?: string | null
          person_id?: string
          source_detail?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_contacts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      person_links: {
        Row: {
          archived_at: string | null
          context: string | null
          created_at: string
          created_by: string | null
          from_person_id: string
          id: string
          kind: Database["public"]["Enums"]["link_kind"]
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          to_person_id: string
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          from_person_id: string
          id?: string
          kind?: Database["public"]["Enums"]["link_kind"]
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          to_person_id: string
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          from_person_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["link_kind"]
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          to_person_id?: string
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_links_from_person_id_fkey"
            columns: ["from_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_links_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          project_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_organizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_organizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_participants: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string | null
          person_id: string | null
          project_id: string
          role: Database["public"]["Enums"]["participant_role"]
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          unidentified_description: string | null
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          person_id?: string | null
          project_id: string
          role: Database["public"]["Enums"]["participant_role"]
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          unidentified_description?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          person_id?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["participant_role"]
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          unidentified_description?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          blockers: string | null
          created_at: string
          created_by: string | null
          duration_h: number | null
          energy_mwh: number | null
          evidence: string | null
          id: string
          location: string | null
          name: string
          need: string | null
          next_milestone: string | null
          power_mw: number | null
          project_stage: string | null
          source_detail: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          blockers?: string | null
          created_at?: string
          created_by?: string | null
          duration_h?: number | null
          energy_mwh?: number | null
          evidence?: string | null
          id?: string
          location?: string | null
          name: string
          need?: string | null
          next_milestone?: string | null
          power_mw?: number | null
          project_stage?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          blockers?: string | null
          created_at?: string
          created_by?: string | null
          duration_h?: number | null
          energy_mwh?: number | null
          evidence?: string | null
          id?: string
          location?: string | null
          name?: string
          need?: string | null
          next_milestone?: string | null
          power_mw?: number | null
          project_stage?: string | null
          source_detail?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_findings: {
        Row: {
          category: string
          condition: string
          created_at: string
          created_by: string | null
          fetched_at: string
          id: string
          note: string | null
          position: number
          provided_by_user: boolean
          published_at: string | null
          quote: string | null
          run_id: string
          source_title: string | null
          statement: string
          updated_at: string
          updated_by: string | null
          url: string
          workspace_id: string
        }
        Insert: {
          category?: string
          condition: string
          created_at?: string
          created_by?: string | null
          fetched_at: string
          id?: string
          note?: string | null
          position?: number
          provided_by_user?: boolean
          published_at?: string | null
          quote?: string | null
          run_id: string
          source_title?: string | null
          statement: string
          updated_at?: string
          updated_by?: string | null
          url: string
          workspace_id: string
        }
        Update: {
          category?: string
          condition?: string
          created_at?: string
          created_by?: string | null
          fetched_at?: string
          id?: string
          note?: string | null
          position?: number
          provided_by_user?: boolean
          published_at?: string | null
          quote?: string | null
          run_id?: string
          source_title?: string | null
          statement?: string
          updated_at?: string
          updated_by?: string | null
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_runs: {
        Row: {
          created_at: string
          created_by: string | null
          extraction_id: string | null
          fit: Json | null
          focus: string | null
          id: string
          intro_draft: string | null
          model: string | null
          organization_id: string
          query: string | null
          search_error: string | null
          source_document_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          extraction_id?: string | null
          fit?: Json | null
          focus?: string | null
          id?: string
          intro_draft?: string | null
          model?: string | null
          organization_id: string
          query?: string | null
          search_error?: string | null
          source_document_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          extraction_id?: string | null
          fit?: Json | null
          focus?: string | null
          id?: string
          intro_draft?: string | null
          model?: string | null
          organization_id?: string
          query?: string | null
          search_error?: string | null
          source_document_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_runs_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "brain_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      source_documents: {
        Row: {
          archived_at: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          organization_id: string | null
          original_text: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          original_text: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          original_text?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_documents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          completed_at: string | null
          completed_by: string | null
          completion_note: string | null
          confirmed: boolean
          context: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          introduction_id: string | null
          opportunity_id: string | null
          organization_id: string | null
          owner_user_id: string | null
          person_id: string | null
          project_id: string | null
          review_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          updated_by: string | null
          waiting_on_person_id: string | null
          waiting_since: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          confirmed?: boolean
          context?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          introduction_id?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          person_id?: string | null
          project_id?: string | null
          review_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
          waiting_on_person_id?: string | null
          waiting_since?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          confirmed?: boolean
          context?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          introduction_id?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          person_id?: string | null
          project_id?: string | null
          review_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          waiting_on_person_id?: string | null
          waiting_since?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_introduction_id_fkey"
            columns: ["introduction_id"]
            isOneToOne: false
            referencedRelation: "introductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_waiting_on_person_id_fkey"
            columns: ["waiting_on_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          person_id: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          person_id?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          person_id?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_import_batch: {
        Args: { _file: string; _hash: string; _rows: Json; _ws: string }
        Returns: Json
      }
      brain_apply: {
        Args: { _op_key: string; _steps: Json; _thread: string; _ws: string }
        Returns: Json
      }
      brain_undo_action: { Args: { _id: string }; Returns: Json }
      confirm_extraction: {
        Args: { _decisions: Json; _extraction: string }
        Returns: Json
      }
      conv_ws: { Args: { _id: string }; Returns: string }
      find_org_duplicates: {
        Args: { _exclude?: string; _name: string; _ws: string }
        Returns: {
          archived: boolean
          id: string
          name: string
          reason: string
          score: number
        }[]
      }
      find_person_duplicates: {
        Args: {
          _contacts?: string[]
          _exclude?: string
          _name: string
          _ws: string
        }
        Returns: {
          archived: boolean
          full_name: string
          id: string
          reason: string
          score: number
        }[]
      }
      intro_refs_ok: {
        Args: { i: Database["public"]["Tables"]["introductions"]["Row"] }
        Returns: boolean
      }
      intro_ws: { Args: { _id: string }; Returns: string }
      is_workspace_admin: { Args: { _ws: string }; Returns: boolean }
      is_workspace_member: { Args: { _ws: string }; Returns: boolean }
      link_my_person: {
        Args: { _expected: string; _person: string; _ws: string }
        Returns: string
      }
      live_references: {
        Args: { _exclude: string[]; _id: string; _table: string }
        Returns: string
      }
      normalize_text: { Args: { t: string }; Returns: string }
      opp_ws: { Args: { _id: string }; Returns: string }
      org_ws: { Args: { _id: string }; Returns: string }
      owns_brain_thread: { Args: { _id: string }; Returns: boolean }
      person_ws: { Args: { _id: string }; Returns: string }
      project_ws: { Args: { _id: string }; Returns: string }
      redeem_invitation: {
        Args: {
          _display: string
          _email: string
          _token_hash: string
          _user: string
        }
        Returns: Json
      }
      revert_import_batch: { Args: { _batch: string }; Returns: Json }
      set_my_person: {
        Args: { _person: string; _ws: string }
        Returns: undefined
      }
      task_refs_ok: {
        Args: { t: Database["public"]["Tables"]["tasks"]["Row"] }
        Returns: boolean
      }
    }
    Enums: {
      commission_status:
        | "not_discussed"
        | "interested"
        | "talking"
        | "agreed"
        | "discarded"
      contact_kind: "email" | "phone" | "linkedin" | "other"
      intro_kind: "request" | "done" | "hypothetical"
      intro_status:
        | "requested"
        | "in_progress"
        | "done"
        | "declined"
        | "no_response"
      link_kind:
        | "knows"
        | "colleague"
        | "internal_referral"
        | "external_referral"
        | "other"
      opportunity_kind: "commercial" | "institutional"
      opportunity_stage:
        | "discovery"
        | "validation"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      participant_role:
        | "buyer"
        | "end_user"
        | "economic_decider"
        | "technical_evaluator"
        | "internal_champion"
        | "other"
      source_type: "personal" | "ivlp" | "public_research" | "hypothesis"
      task_status: "open" | "waiting" | "done" | "cancelled"
      verification_status: "unverified" | "verified" | "doubtful"
      workspace_role: "admin" | "collaborator"
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
    Enums: {
      commission_status: [
        "not_discussed",
        "interested",
        "talking",
        "agreed",
        "discarded",
      ],
      contact_kind: ["email", "phone", "linkedin", "other"],
      intro_kind: ["request", "done", "hypothetical"],
      intro_status: [
        "requested",
        "in_progress",
        "done",
        "declined",
        "no_response",
      ],
      link_kind: [
        "knows",
        "colleague",
        "internal_referral",
        "external_referral",
        "other",
      ],
      opportunity_kind: ["commercial", "institutional"],
      opportunity_stage: [
        "discovery",
        "validation",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      participant_role: [
        "buyer",
        "end_user",
        "economic_decider",
        "technical_evaluator",
        "internal_champion",
        "other",
      ],
      source_type: ["personal", "ivlp", "public_research", "hypothesis"],
      task_status: ["open", "waiting", "done", "cancelled"],
      verification_status: ["unverified", "verified", "doubtful"],
      workspace_role: ["admin", "collaborator"],
    },
  },
} as const
