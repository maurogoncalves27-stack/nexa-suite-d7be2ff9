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
      access_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      accounts_payable: {
        Row: {
          amount: number
          bank_account_id: string | null
          bank_transaction_id: string | null
          barcode: string | null
          beneficiary: string | null
          category_id: string | null
          competence_date: string | null
          created_at: string
          created_by: string
          description: string | null
          digitable_line: string | null
          due_date: string | null
          entry_number: number | null
          id: string
          installment_number: number
          invoice_id: string | null
          paid_at: string | null
          paid_by: string | null
          payment_notes: string | null
          recurrence_group_id: string | null
          status: string
          store_id: string
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          barcode?: string | null
          beneficiary?: string | null
          category_id?: string | null
          competence_date?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          digitable_line?: string | null
          due_date?: string | null
          entry_number?: number | null
          id?: string
          installment_number?: number
          invoice_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_notes?: string | null
          recurrence_group_id?: string | null
          status?: string
          store_id: string
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          barcode?: string | null
          beneficiary?: string | null
          category_id?: string | null
          competence_date?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          digitable_line?: string | null
          due_date?: string | null
          entry_number?: number | null
          id?: string
          installment_number?: number
          invoice_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_notes?: string | null
          recurrence_group_id?: string | null
          status?: string
          store_id?: string
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          bank_account_id: string | null
          bank_transaction_id: string | null
          category_id: string | null
          competence_date: string | null
          created_at: string
          created_by: string
          description: string
          due_date: string | null
          entry_number: number | null
          id: string
          notes: string | null
          payer_name: string | null
          received_at: string | null
          received_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          category_id?: string | null
          competence_date?: string | null
          created_at?: string
          created_by: string
          description: string
          due_date?: string | null
          entry_number?: number | null
          id?: string
          notes?: string | null
          payer_name?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          category_id?: string | null
          competence_date?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          entry_number?: number | null
          id?: string
          notes?: string | null
          payer_name?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders_sent: {
        Row: {
          appointment_id: string
          id: string
          offset_min: number
          sent_at: string
        }
        Insert: {
          appointment_id: string
          id?: string
          offset_min: number
          sent_at?: string
        }
        Update: {
          appointment_id?: string
          id?: string
          offset_min?: number
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_sent_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string | null
          end_at: string | null
          id: string
          location: string | null
          meeting_url: string | null
          reminder_offsets_min: number[]
          scope: string
          start_at: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          reminder_offsets_min?: number[]
          scope?: string
          start_at: string
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          reminder_offsets_min?: number[]
          scope?: string
          start_at?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_inventory: {
        Row: {
          acquired_at: string | null
          category: string
          created_at: string
          created_by: string | null
          depreciation_rate_yearly: number
          id: string
          name: string
          notes: string | null
          quantity: number
          store_id: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          depreciation_rate_yearly?: number
          id?: string
          name: string
          notes?: string | null
          quantity?: number
          store_id: string
          unit_value?: number
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          depreciation_rate_yearly?: number
          id?: string
          name?: string
          notes?: string | null
          quantity?: number
          store_id?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rule_runs: {
        Row: {
          detail: Json | null
          error: string | null
          id: string
          infractions_created: number
          matched: number
          notifications_sent: number
          ran_at: string
          reference_date: string | null
          rule_id: string | null
          scanned: number
          trigger_type: Database["public"]["Enums"]["automation_trigger_type"]
          warnings_created: number
        }
        Insert: {
          detail?: Json | null
          error?: string | null
          id?: string
          infractions_created?: number
          matched?: number
          notifications_sent?: number
          ran_at?: string
          reference_date?: string | null
          rule_id?: string | null
          scanned?: number
          trigger_type: Database["public"]["Enums"]["automation_trigger_type"]
          warnings_created?: number
        }
        Update: {
          detail?: Json | null
          error?: string | null
          id?: string
          infractions_created?: number
          matched?: number
          notifications_sent?: number
          ran_at?: string
          reference_date?: string | null
          rule_id?: string | null
          scanned?: number
          trigger_type?: Database["public"]["Enums"]["automation_trigger_type"]
          warnings_created?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          params: Json
          trigger_type: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          params?: Json
          trigger_type: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at?: string
        }
        Update: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          params?: Json
          trigger_type?: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          agency: string | null
          bank_code: string | null
          bank_name: string | null
          created_at: string
          created_by: string | null
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_statements: {
        Row: {
          bank_account_id: string
          closing_balance: number | null
          created_at: string
          file_name: string | null
          id: string
          imported_at: string
          imported_by: string | null
          ofx_account_id: string | null
          ofx_bank_id: string | null
          opening_balance: number | null
          period_end: string | null
          period_start: string | null
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number | null
          created_at?: string
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          ofx_account_id?: string | null
          ofx_bank_id?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number | null
          created_at?: string
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          ofx_account_id?: string | null
          ofx_bank_id?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          check_number: string | null
          created_at: string
          dre_excluded: boolean
          entry_number: number | null
          fit_id: string | null
          id: string
          memo: string | null
          notes: string | null
          payee: string | null
          posted_at: string
          reconciled_at: string | null
          reconciled_by: string | null
          statement_id: string
          trn_type: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          check_number?: string | null
          created_at?: string
          dre_excluded?: boolean
          entry_number?: number | null
          fit_id?: string | null
          id?: string
          memo?: string | null
          notes?: string | null
          payee?: string | null
          posted_at: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          statement_id: string
          trn_type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          check_number?: string | null
          created_at?: string
          dre_excluded?: boolean
          entry_number?: number | null
          fit_id?: string | null
          id?: string
          memo?: string | null
          notes?: string | null
          payee?: string | null
          posted_at?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          statement_id?: string
          trn_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string | null
          entry_number: number | null
          from_account_id: string
          from_transaction_id: string | null
          id: string
          notes: string | null
          to_account_id: string
          to_transaction_id: string | null
          transferred_at: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          description?: string | null
          entry_number?: number | null
          from_account_id: string
          from_transaction_id?: string | null
          id?: string
          notes?: string | null
          to_account_id: string
          to_transaction_id?: string | null
          transferred_at?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string | null
          entry_number?: number | null
          from_account_id?: string
          from_transaction_id?: string | null
          id?: string
          notes?: string | null
          to_account_id?: string
          to_transaction_id?: string | null
          transferred_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_from_transaction_id_fkey"
            columns: ["from_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_to_transaction_id_fkey"
            columns: ["to_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      c6_payment_batch_lines: {
        Row: {
          amount: number
          batch_id: string
          category_id: string | null
          created_at: string
          created_payable_id: string | null
          description: string | null
          employee_id: string | null
          id: string
          name: string
          pix_key: string | null
          pix_key_type: string | null
          store_id: string | null
        }
        Insert: {
          amount: number
          batch_id: string
          category_id?: string | null
          created_at?: string
          created_payable_id?: string | null
          description?: string | null
          employee_id?: string | null
          id?: string
          name: string
          pix_key?: string | null
          pix_key_type?: string | null
          store_id?: string | null
        }
        Update: {
          amount?: number
          batch_id?: string
          category_id?: string | null
          created_at?: string
          created_payable_id?: string | null
          description?: string | null
          employee_id?: string | null
          id?: string
          name?: string
          pix_key?: string | null
          pix_key_type?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "c6_payment_batch_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "c6_payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c6_payment_batch_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c6_payment_batch_lines_created_payable_id_fkey"
            columns: ["created_payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c6_payment_batch_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c6_payment_batch_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c6_payment_batch_lines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      c6_payment_batches: {
        Row: {
          bank_transaction_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          default_store_id: string | null
          file_name: string | null
          id: string
          line_count: number
          payment_date: string
          reconciled_at: string | null
          reconciled_by: string | null
          source: string
          source_ref: string | null
          total: number
        }
        Insert: {
          bank_transaction_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_store_id?: string | null
          file_name?: string | null
          id?: string
          line_count: number
          payment_date: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          source: string
          source_ref?: string | null
          total: number
        }
        Update: {
          bank_transaction_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_store_id?: string | null
          file_name?: string | null
          id?: string
          line_count?: number
          payment_date?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          source?: string
          source_ref?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "c6_payment_batches_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c6_payment_batches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "c6_payment_batches_default_store_id_fkey"
            columns: ["default_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_document_uploads: {
        Row: {
          candidate_id: string
          doc_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_at: string
        }
        Insert: {
          candidate_id: string
          doc_type: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_at?: string
        }
        Update: {
          candidate_id?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_document_uploads_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_evaluations: {
        Row: {
          answers: Json | null
          behavior_score: number | null
          candidate_id: string
          concerns: string | null
          created_at: string
          culture_fit_score: number | null
          evaluated_by: string | null
          id: string
          overall_score: number | null
          recommendation: string | null
          stage: string
          strengths: string | null
          technical_score: number | null
          updated_at: string
        }
        Insert: {
          answers?: Json | null
          behavior_score?: number | null
          candidate_id: string
          concerns?: string | null
          created_at?: string
          culture_fit_score?: number | null
          evaluated_by?: string | null
          id?: string
          overall_score?: number | null
          recommendation?: string | null
          stage: string
          strengths?: string | null
          technical_score?: number | null
          updated_at?: string
        }
        Update: {
          answers?: Json | null
          behavior_score?: number | null
          candidate_id?: string
          concerns?: string | null
          created_at?: string
          culture_fit_score?: number | null
          evaluated_by?: string | null
          id?: string
          overall_score?: number | null
          recommendation?: string | null
          stage?: string
          strengths?: string | null
          technical_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_evaluations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_message_logs: {
        Row: {
          candidate_id: string
          channel: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          message_body: string | null
          provider_response: Json | null
          status: string
          to_phone: string | null
          triggered_by: string
        }
        Insert: {
          candidate_id: string
          channel?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          message_body?: string | null
          provider_response?: Json | null
          status: string
          to_phone?: string | null
          triggered_by?: string
        }
        Update: {
          candidate_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          message_body?: string | null
          provider_response?: Json | null
          status?: string
          to_phone?: string | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_message_logs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_stage_history: {
        Row: {
          candidate_id: string
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: string
          notes: string | null
          to_stage: string
        }
        Insert: {
          candidate_id: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          to_stage: string
        }
        Update: {
          candidate_id?: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_stage_history_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      cbo_codes: {
        Row: {
          code: string
          created_at: string
          synonyms: string | null
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          synonyms?: string | null
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          synonyms?: string | null
          title?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          client_meta: Json | null
          created_at: string
          feedback_rating: string | null
          feedback_requested_at: string | null
          id: string
          last_message_at: string
          message_count: number
          messages: Json
          session_id: string
          triage: Json | null
          triaged_at: string | null
          updated_at: string
        }
        Insert: {
          client_meta?: Json | null
          created_at?: string
          feedback_rating?: string | null
          feedback_requested_at?: string | null
          id?: string
          last_message_at?: string
          message_count?: number
          messages?: Json
          session_id: string
          triage?: Json | null
          triaged_at?: string | null
          updated_at?: string
        }
        Update: {
          client_meta?: Json | null
          created_at?: string
          feedback_rating?: string | null
          feedback_requested_at?: string | null
          id?: string
          last_message_at?: string
          message_count?: number
          messages?: Json
          session_id?: string
          triage?: Json | null
          triaged_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_test_runs: {
        Row: {
          created_at: string
          evaluator_notes: string | null
          id: string
          issues: Json | null
          passed: boolean | null
          persona: Json | null
          run_id: string
          scenario: string
          score: number | null
          session_id: string
        }
        Insert: {
          created_at?: string
          evaluator_notes?: string | null
          id?: string
          issues?: Json | null
          passed?: boolean | null
          persona?: Json | null
          run_id: string
          scenario: string
          score?: number | null
          session_id: string
        }
        Update: {
          created_at?: string
          evaluator_notes?: string | null
          id?: string
          issues?: Json | null
          passed?: boolean | null
          persona?: Json | null
          run_id?: string
          scenario?: string
          score?: number | null
          session_id?: string
        }
        Relationships: []
      }
      checklist_answers: {
        Row: {
          checked: boolean
          checked_at: string | null
          created_at: string
          id: string
          item_id: string
          observation: string | null
          photo_url: string | null
          photo_urls: string[]
          submission_id: string
          updated_at: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          created_at?: string
          id?: string
          item_id: string
          observation?: string | null
          photo_url?: string | null
          photo_urls?: string[]
          submission_id: string
          updated_at?: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          created_at?: string
          id?: string
          item_id?: string
          observation?: string | null
          photo_url?: string | null
          photo_urls?: string[]
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_answers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_priority: boolean
          label: string
          requires_note_when_unchecked: boolean
          requires_photo: boolean
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_priority?: boolean
          label: string
          requires_note_when_unchecked?: boolean
          requires_photo?: boolean
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_priority?: boolean
          label?: string
          requires_note_when_unchecked?: boolean
          requires_photo?: boolean
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_submissions: {
        Row: {
          completion_percent: number
          created_at: string
          id: string
          notes: string | null
          shift_date: string
          status: string
          submitted_at: string
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completion_percent?: number
          created_at?: string
          id?: string
          notes?: string | null
          shift_date?: string
          status?: string
          submitted_at?: string
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completion_percent?: number
          created_at?: string
          id?: string
          notes?: string | null
          shift_date?: string
          status?: string
          submitted_at?: string
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_access_groups: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          group_id: string
          id: string
          template_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          group_id: string
          id?: string
          template_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          group_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_access_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_access_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          employee_id: string
          id: string
          template_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          employee_id: string
          id?: string
          template_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          employee_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_stores: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          store_id: string
          template_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          store_id: string
          template_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          store_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_stores_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          deadline_time: string | null
          description: string | null
          id: string
          is_active: boolean
          observations: string | null
          observations_legacy: string | null
          priority: string
          sort_order: number
          title: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deadline_time?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          observations?: string | null
          observations_legacy?: string | null
          priority?: string
          sort_order?: number
          title: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deadline_time?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          observations?: string | null
          observations_legacy?: string | null
          priority?: string
          sort_order?: number
          title?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      climate_questions: {
        Row: {
          created_at: string
          dimension: string
          display_order: number
          id: string
          is_active: boolean
          question_type: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dimension: string
          display_order?: number
          id?: string
          is_active?: boolean
          question_type?: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dimension?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question_type?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      climate_response_answers: {
        Row: {
          created_at: string
          id: string
          numeric_value: number | null
          question_id: string
          response_id: string
          text_value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          question_id: string
          response_id: string
          text_value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          question_id?: string
          response_id?: string
          text_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "climate_response_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "climate_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climate_response_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "climate_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      climate_response_tokens: {
        Row: {
          id: string
          submitted_at: string
          survey_id: string
          user_id: string
        }
        Insert: {
          id?: string
          submitted_at?: string
          survey_id: string
          user_id: string
        }
        Update: {
          id?: string
          submitted_at?: string
          survey_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "climate_response_tokens_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "climate_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      climate_responses: {
        Row: {
          id: string
          position: string | null
          store_id: string | null
          submitted_at: string
          survey_id: string
        }
        Insert: {
          id?: string
          position?: string | null
          store_id?: string | null
          submitted_at?: string
          survey_id: string
        }
        Update: {
          id?: string
          position?: string | null
          store_id?: string | null
          submitted_at?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "climate_responses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climate_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "climate_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      climate_surveys: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          notes: string | null
          semester: number
          start_date: string
          status: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          notes?: string | null
          semester: number
          start_date: string
          status?: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          notes?: string | null
          semester?: number
          start_date?: string
          status?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      complement_groups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_required: boolean
          max_choices: number
          min_choices: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_choices?: number
          min_choices?: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_choices?: number
          min_choices?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      complement_options: {
        Row: {
          created_at: string
          extra_price: number
          group_id: string
          id: string
          is_active: boolean
          linked_item_id: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra_price?: number
          group_id: string
          id?: string
          is_active?: boolean
          linked_item_id?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra_price?: number
          group_id?: string
          id?: string
          is_active?: boolean
          linked_item_id?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complement_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "complement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complement_options_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          content: string
          content_hash: string
          created_at: string
          employee_id: string
          id: string
          ip_address: string | null
          signature_url: string | null
          signed_at: string
          superseded_at: string | null
          superseded_by: string | null
          template_id: string | null
          template_name: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          content: string
          content_hash: string
          created_at?: string
          employee_id: string
          id?: string
          ip_address?: string | null
          signature_url?: string | null
          signed_at?: string
          superseded_at?: string | null
          superseded_by?: string | null
          template_id?: string | null
          template_name?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          content?: string
          content_hash?: string
          created_at?: string
          employee_id?: string
          id?: string
          ip_address?: string | null
          signature_url?: string | null
          signed_at?: string
          superseded_at?: string | null
          superseded_by?: string | null
          template_id?: string | null
          template_name?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["contract_type_enum"]
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          type?: Database["public"]["Enums"]["contract_type_enum"]
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["contract_type_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      custom_document_signatures: {
        Row: {
          document_id: string
          employee_id: string | null
          id: string
          ip_address: string | null
          signed_at: string
          user_agent: string | null
          user_id: string
          version_id: string
          version_number: number
        }
        Insert: {
          document_id: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          signed_at?: string
          user_agent?: string | null
          user_id: string
          version_id: string
          version_number: number
        }
        Update: {
          document_id?: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          signed_at?: string
          user_agent?: string | null
          user_id?: string
          version_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "custom_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_document_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_document_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_document_signatures_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "custom_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_document_versions: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          target_positions: string[]
          version_number: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          target_positions?: string[]
          version_number: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          target_positions?: string[]
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "custom_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_documents: {
        Row: {
          created_at: string
          created_by: string | null
          current_version: number
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_reviews: {
        Row: {
          ai_suggestion: string | null
          brand_id: string | null
          comment: string | null
          created_at: string
          customer_contact: string | null
          customer_name: string | null
          external_id: string | null
          external_url: string | null
          id: string
          published_at: string | null
          rating: number | null
          replied_at: string | null
          replied_by: string | null
          reply_text: string | null
          sentiment: string | null
          source: string
          status: string
          store_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_suggestion?: string | null
          brand_id?: string | null
          comment?: string | null
          created_at?: string
          customer_contact?: string | null
          customer_name?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          published_at?: string | null
          rating?: number | null
          replied_at?: string | null
          replied_by?: string | null
          reply_text?: string | null
          sentiment?: string | null
          source: string
          status?: string
          store_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_suggestion?: string | null
          brand_id?: string | null
          comment?: string | null
          created_at?: string
          customer_contact?: string | null
          customer_name?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          published_at?: string | null
          rating?: number | null
          replied_at?: string | null
          replied_by?: string | null
          reply_text?: string | null
          sentiment?: string | null
          source?: string
          status?: string
          store_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reviews_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_revenue: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          gross_revenue: number
          id: string
          notes: string | null
          sale_date: string
          store_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          gross_revenue?: number
          id?: string
          notes?: string | null
          sale_date: string
          store_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          gross_revenue?: number
          id?: string
          notes?: string | null
          sale_date?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_job_events: {
        Row: {
          event_type: string
          id: string
          job_id: string | null
          payload: Json
          provider: string
          received_at: string
        }
        Insert: {
          event_type: string
          id?: string
          job_id?: string | null
          payload: Json
          provider: string
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          job_id?: string | null
          payload?: Json
          provider?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "delivery_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_jobs: {
        Row: {
          cancelled_at: string | null
          created_at: string
          delivered_at: string | null
          driver_name: string | null
          driver_phone: string | null
          dropoff_address: Json | null
          error_message: string | null
          eta_minutes: number | null
          fee_cents: number | null
          id: string
          order_id: string | null
          picked_up_at: string | null
          pickup_address: Json | null
          provider: string
          provider_order_id: string | null
          provider_quote_id: string | null
          quoted_at: string
          raw_order: Json | null
          raw_quote: Json | null
          requested_at: string | null
          status: string
          store_id: string
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          dropoff_address?: Json | null
          error_message?: string | null
          eta_minutes?: number | null
          fee_cents?: number | null
          id?: string
          order_id?: string | null
          picked_up_at?: string | null
          pickup_address?: Json | null
          provider: string
          provider_order_id?: string | null
          provider_quote_id?: string | null
          quoted_at?: string
          raw_order?: Json | null
          raw_quote?: Json | null
          requested_at?: string | null
          status?: string
          store_id: string
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          dropoff_address?: Json | null
          error_message?: string | null
          eta_minutes?: number | null
          fee_cents?: number | null
          id?: string
          order_id?: string | null
          picked_up_at?: string | null
          pickup_address?: Json | null
          provider?: string
          provider_order_id?: string | null
          provider_quote_id?: string | null
          quoted_at?: string
          raw_order?: Json | null
          raw_quote?: Json | null
          requested_at?: string | null
          status?: string
          store_id?: string
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_provider_config: {
        Row: {
          created_at: string
          extra_config: Json
          id: string
          is_active: boolean
          pickup_address: Json | null
          priority: number
          provider: string
          service_type: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra_config?: Json
          id?: string
          is_active?: boolean
          pickup_address?: Json | null
          priority?: number
          provider: string
          service_type?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra_config?: Json
          id?: string
          is_active?: boolean
          pickup_address?: Json | null
          priority?: number
          provider?: string
          service_type?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_provider_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      development_plans: {
        Row: {
          actions: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          employee_id: string
          id: string
          mentor_name: string | null
          notes: string | null
          objective: string
          progress: number
          status: string
          updated_at: string
        }
        Insert: {
          actions?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          employee_id: string
          id?: string
          mentor_name?: string | null
          notes?: string | null
          objective: string
          progress?: number
          status?: string
          updated_at?: string
        }
        Update: {
          actions?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          employee_id?: string
          id?: string
          mentor_name?: string | null
          notes?: string | null
          objective?: string
          progress?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_plans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      dfe_companies: {
        Row: {
          active: boolean
          auto_ciencia: boolean
          cnpj: string
          created_at: string
          environment: string
          id: string
          last_nsu: string
          last_sync_at: string | null
          last_sync_error: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_ciencia?: boolean
          cnpj: string
          created_at?: string
          environment?: string
          id?: string
          last_nsu?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_ciencia?: boolean
          cnpj?: string
          created_at?: string
          environment?: string
          id?: string
          last_nsu?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dfe_companies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      dfe_inbound_items: {
        Row: {
          cfop: string | null
          created_at: string
          description: string
          id: string
          line_number: number
          mapped_product_id: string | null
          ncm: string | null
          note_id: string
          quantity: number
          raw: Json | null
          suggested_confidence: number | null
          suggested_pack_size: number | null
          suggested_pack_unit: string | null
          suggested_product_id: string | null
          total_value: number
          trib_quantity: number | null
          trib_unit: string | null
          trib_unit_value: number | null
          unit: string | null
          unit_value: number
        }
        Insert: {
          cfop?: string | null
          created_at?: string
          description: string
          id?: string
          line_number: number
          mapped_product_id?: string | null
          ncm?: string | null
          note_id: string
          quantity?: number
          raw?: Json | null
          suggested_confidence?: number | null
          suggested_pack_size?: number | null
          suggested_pack_unit?: string | null
          suggested_product_id?: string | null
          total_value?: number
          trib_quantity?: number | null
          trib_unit?: string | null
          trib_unit_value?: number | null
          unit?: string | null
          unit_value?: number
        }
        Update: {
          cfop?: string | null
          created_at?: string
          description?: string
          id?: string
          line_number?: number
          mapped_product_id?: string | null
          ncm?: string | null
          note_id?: string
          quantity?: number
          raw?: Json | null
          suggested_confidence?: number | null
          suggested_pack_size?: number | null
          suggested_pack_unit?: string | null
          suggested_product_id?: string | null
          total_value?: number
          trib_quantity?: number | null
          trib_unit?: string | null
          trib_unit_value?: number | null
          unit?: string | null
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "dfe_inbound_items_mapped_product_id_fkey"
            columns: ["mapped_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dfe_inbound_items_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "dfe_inbound_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dfe_inbound_items_suggested_product_id_fkey"
            columns: ["suggested_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      dfe_inbound_notes: {
        Row: {
          chave_acesso: string | null
          ciencia_at: string | null
          created_at: string
          danfe_url: string | null
          dfe_company_id: string | null
          emission_date: string | null
          id: string
          imported_invoice_id: string | null
          nsu: string | null
          numero: string | null
          origin: string
          raw_payload: Json | null
          received_at: string
          refused_reason: string | null
          serie: string | null
          status: string
          store_id: string | null
          supplier_cnpj: string | null
          supplier_name: string | null
          target_store_id: string | null
          total_amount: number | null
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          chave_acesso?: string | null
          ciencia_at?: string | null
          created_at?: string
          danfe_url?: string | null
          dfe_company_id?: string | null
          emission_date?: string | null
          id?: string
          imported_invoice_id?: string | null
          nsu?: string | null
          numero?: string | null
          origin?: string
          raw_payload?: Json | null
          received_at?: string
          refused_reason?: string | null
          serie?: string | null
          status?: string
          store_id?: string | null
          supplier_cnpj?: string | null
          supplier_name?: string | null
          target_store_id?: string | null
          total_amount?: number | null
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          chave_acesso?: string | null
          ciencia_at?: string | null
          created_at?: string
          danfe_url?: string | null
          dfe_company_id?: string | null
          emission_date?: string | null
          id?: string
          imported_invoice_id?: string | null
          nsu?: string | null
          numero?: string | null
          origin?: string
          raw_payload?: Json | null
          received_at?: string
          refused_reason?: string | null
          serie?: string | null
          status?: string
          store_id?: string | null
          supplier_cnpj?: string | null
          supplier_name?: string | null
          target_store_id?: string | null
          total_amount?: number | null
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dfe_inbound_notes_dfe_company_id_fkey"
            columns: ["dfe_company_id"]
            isOneToOne: false
            referencedRelation: "dfe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dfe_inbound_notes_imported_invoice_id_fkey"
            columns: ["imported_invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dfe_inbound_notes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dfe_inbound_notes_target_store_id_fkey"
            columns: ["target_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      dfe_supplier_product_map: {
        Row: {
          created_at: string
          description_norm: string
          hits: number
          id: string
          last_used_at: string
          product_id: string
          supplier_cnpj: string
        }
        Insert: {
          created_at?: string
          description_norm: string
          hits?: number
          id?: string
          last_used_at?: string
          product_id: string
          supplier_cnpj: string
        }
        Update: {
          created_at?: string
          description_norm?: string
          hits?: number
          id?: string
          last_used_at?: string
          product_id?: string
          supplier_cnpj?: string
        }
        Relationships: [
          {
            foreignKeyName: "dfe_supplier_product_map_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      dfe_supplier_unit_conversion: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          pack_size: number
          package_description: string | null
          product_id: string
          purchase_unit: string | null
          supplier_cnpj: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          pack_size?: number
          package_description?: string | null
          product_id: string
          purchase_unit?: string | null
          supplier_cnpj: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          pack_size?: number
          package_description?: string | null
          product_id?: string
          purchase_unit?: string | null
          supplier_cnpj?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dfe_supplier_unit_conversion_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ecommerce_cart_items: {
        Row: {
          brand_code: string | null
          cart_id: string
          complements: Json
          created_at: string
          id: string
          item_name: string
          menu_item_id: string | null
          notes: string | null
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          brand_code?: string | null
          cart_id: string
          complements?: Json
          created_at?: string
          id?: string
          item_name: string
          menu_item_id?: string | null
          notes?: string | null
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          brand_code?: string | null
          cart_id?: string
          complements?: Json
          created_at?: string
          id?: string
          item_name?: string
          menu_item_id?: string | null
          notes?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "ecommerce_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecommerce_cart_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ecommerce_carts: {
        Row: {
          brand_breakdown: Json
          created_at: string
          customer_document: string | null
          customer_name: string | null
          customer_phone: string | null
          ecommerce_store_id: string | null
          expires_at: string
          id: string
          pickup_eta: string | null
          session_token: string
          status: string
          subtotal: number
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          brand_breakdown?: Json
          created_at?: string
          customer_document?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ecommerce_store_id?: string | null
          expires_at?: string
          id?: string
          pickup_eta?: string | null
          session_token: string
          status?: string
          subtotal?: number
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          brand_breakdown?: Json
          created_at?: string
          customer_document?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ecommerce_store_id?: string | null
          expires_at?: string
          id?: string
          pickup_eta?: string | null
          session_token?: string
          status?: string
          subtotal?: number
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_carts_ecommerce_store_id_fkey"
            columns: ["ecommerce_store_id"]
            isOneToOne: false
            referencedRelation: "ecommerce_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ecommerce_events: {
        Row: {
          brand_code: string | null
          cart_id: string | null
          created_at: string
          ecommerce_store_id: string | null
          event_name: string
          id: string
          menu_item_id: string | null
          metadata: Json
          order_id: string | null
          session_token: string | null
          user_agent: string | null
          value: number | null
        }
        Insert: {
          brand_code?: string | null
          cart_id?: string | null
          created_at?: string
          ecommerce_store_id?: string | null
          event_name: string
          id?: string
          menu_item_id?: string | null
          metadata?: Json
          order_id?: string | null
          session_token?: string | null
          user_agent?: string | null
          value?: number | null
        }
        Update: {
          brand_code?: string | null
          cart_id?: string | null
          created_at?: string
          ecommerce_store_id?: string | null
          event_name?: string
          id?: string
          menu_item_id?: string | null
          metadata?: Json
          order_id?: string | null
          session_token?: string | null
          user_agent?: string | null
          value?: number | null
        }
        Relationships: []
      }
      ecommerce_stores: {
        Row: {
          accepts_delivery: boolean
          accepts_pickup: boolean
          active: boolean
          address: string | null
          created_at: string
          display_name: string
          hours: Json
          id: string
          is_open: boolean
          min_pickup_minutes: number
          phone: string | null
          slug: string
          store_id: string
          updated_at: string
        }
        Insert: {
          accepts_delivery?: boolean
          accepts_pickup?: boolean
          active?: boolean
          address?: string | null
          created_at?: string
          display_name: string
          hours?: Json
          id?: string
          is_open?: boolean
          min_pickup_minutes?: number
          phone?: string | null
          slug: string
          store_id: string
          updated_at?: string
        }
        Update: {
          accepts_delivery?: boolean
          accepts_pickup?: boolean
          active?: boolean
          address?: string | null
          created_at?: string
          display_name?: string
          hours?: Json
          id?: string
          is_open?: boolean
          min_pickup_minutes?: number
          phone?: string | null
          slug?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_contracts: {
        Row: {
          auto_renewed_at: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          employee_id: string
          end_date: string | null
          id: string
          notified_3d_before: boolean
          parent_contract_id: string | null
          signature_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["employee_contract_status"]
          template_id: string | null
          type: Database["public"]["Enums"]["contract_type_enum"]
          updated_at: string
        }
        Insert: {
          auto_renewed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          notified_3d_before?: boolean
          parent_contract_id?: string | null
          signature_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["employee_contract_status"]
          template_id?: string | null
          type: Database["public"]["Enums"]["contract_type_enum"]
          updated_at?: string
        }
        Update: {
          auto_renewed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          notified_3d_before?: boolean
          parent_contract_id?: string | null
          signature_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["employee_contract_status"]
          template_id?: string | null
          type?: Database["public"]["Enums"]["contract_type_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_contracts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "employee_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_parent_contract_id_fkey"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "employee_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "contract_signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_dependents: {
        Row: {
          birth_date: string | null
          cpf: string | null
          created_at: string
          employee_id: string
          full_name: string
          id: string
          relationship: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          employee_id: string
          full_name: string
          id?: string
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          employee_id?: string
          full_name?: string
          id?: string
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_dependents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_dependents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          doc_type: string
          employee_id: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          doc_type: string
          employee_id: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          doc_type?: string
          employee_id?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_face_descriptors: {
        Row: {
          created_at: string
          descriptor: number[]
          employee_id: string
          enrolled_at: string
          enrolled_by: string | null
          id: string
          is_active: boolean
          photo_path: string | null
          sample_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          descriptor: number[]
          employee_id: string
          enrolled_at?: string
          enrolled_by?: string | null
          id?: string
          is_active?: boolean
          photo_path?: string | null
          sample_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          descriptor?: number[]
          employee_id?: string
          enrolled_at?: string
          enrolled_by?: string | null
          id?: string
          is_active?: boolean
          photo_path?: string | null
          sample_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_face_descriptors_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_face_descriptors_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_gratifications: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          reason: string | null
          reference_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          reason?: string | null
          reference_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          reason?: string | null
          reference_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_gratifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_gratifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_infractions: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          applied_weight: number
          created_at: string
          created_by: string | null
          cycle_id: string | null
          employee_id: string
          id: string
          infraction_type_id: string
          notes: string | null
          occurred_on: string
          suspension_days: number
          suspension_end_date: string | null
          suspension_revoke_reason: string | null
          suspension_revoked_at: string | null
          suspension_revoked_by: string | null
          suspension_start_date: string | null
          suspension_weeks: number
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          applied_weight?: number
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          employee_id: string
          id?: string
          infraction_type_id: string
          notes?: string | null
          occurred_on?: string
          suspension_days?: number
          suspension_end_date?: string | null
          suspension_revoke_reason?: string | null
          suspension_revoked_at?: string | null
          suspension_revoked_by?: string | null
          suspension_start_date?: string | null
          suspension_weeks?: number
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          applied_weight?: number
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          employee_id?: string
          id?: string
          infraction_type_id?: string
          notes?: string | null
          occurred_on?: string
          suspension_days?: number
          suspension_end_date?: string | null
          suspension_revoke_reason?: string | null
          suspension_revoked_at?: string | null
          suspension_revoked_by?: string | null
          suspension_start_date?: string | null
          suspension_weeks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_infractions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_infractions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_infractions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_infractions_infraction_type_id_fkey"
            columns: ["infraction_type_id"]
            isOneToOne: false
            referencedRelation: "infraction_types"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leaves: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string
          employee_id: string
          end_date: string
          id: string
          is_paid: boolean
          leave_type: Database["public"]["Enums"]["employee_leave_type"]
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by: string
          employee_id: string
          end_date: string
          id?: string
          is_paid?: boolean
          leave_type: Database["public"]["Enums"]["employee_leave_type"]
          notes?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string
          employee_id?: string
          end_date?: string
          id?: string
          is_paid?: boolean
          leave_type?: Database["public"]["Enums"]["employee_leave_type"]
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leaves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leaves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_requests: {
        Row: {
          created_at: string
          description: string | null
          employee_id: string
          hr_response: string | null
          id: string
          request_type: string
          responded_at: string | null
          responded_by: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          employee_id: string
          hr_response?: string | null
          id?: string
          request_type: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          employee_id?: string
          hr_response?: string | null
          id?: string
          request_type?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_task_completions: {
        Row: {
          completed_at: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          period_start: string
          task_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          period_start: string
          task_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          period_start?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_task_completions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_task_completions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "employee_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_tasks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string | null
          id: string
          is_active: boolean
          is_required: boolean
          periodicity: Database["public"]["Enums"]["task_periodicity"]
          scope: Database["public"]["Enums"]["task_assignment_scope"]
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          periodicity?: Database["public"]["Enums"]["task_periodicity"]
          scope?: Database["public"]["Enums"]["task_assignment_scope"]
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          periodicity?: Database["public"]["Enums"]["task_periodicity"]
          scope?: Database["public"]["Enums"]["task_assignment_scope"]
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tasks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_transport_vouchers: {
        Row: {
          created_at: string
          daily_value: number
          discount_percent: number
          employee_id: string
          id: string
          notes: string | null
          payment_method: string
          updated_at: string
          working_days_per_month: number
        }
        Insert: {
          created_at?: string
          daily_value?: number
          discount_percent?: number
          employee_id: string
          id?: string
          notes?: string | null
          payment_method?: string
          updated_at?: string
          working_days_per_month?: number
        }
        Update: {
          created_at?: string
          daily_value?: number
          discount_percent?: number
          employee_id?: string
          id?: string
          notes?: string | null
          payment_method?: string
          updated_at?: string
          working_days_per_month?: number
        }
        Relationships: []
      }
      employee_warnings: {
        Row: {
          content: string
          content_hash: string | null
          created_at: string
          employee_id: string
          id: string
          issued_at: string
          issued_by: string | null
          refusal_reason: string | null
          refused_at: string | null
          refused_by_user_id: string | null
          signature_ip: string | null
          signature_path: string | null
          signature_user_agent: string | null
          signed_at: string | null
          signed_by_user_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          content_hash?: string | null
          created_at?: string
          employee_id: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          refusal_reason?: string | null
          refused_at?: string | null
          refused_by_user_id?: string | null
          signature_ip?: string | null
          signature_path?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by_user_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_hash?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          refusal_reason?: string | null
          refused_at?: string | null
          refused_by_user_id?: string | null
          signature_ip?: string | null
          signature_path?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by_user_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_warnings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_warnings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          admission_date: string | null
          allocated_store_id: string | null
          avatar_path: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          birth_date: string | null
          birth_state: string | null
          cbo_code: string | null
          cbo_title: string | null
          city: string | null
          cnh_category: string | null
          cnh_expiration: string | null
          cnh_number: string | null
          contract_type: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          ctps_issue_date: string | null
          ctps_number: string | null
          ctps_series: string | null
          ctps_uf: string | null
          department: string | null
          disability_type: string | null
          education_level: string | null
          email: string | null
          esocial_category: string | null
          ethnicity: string | null
          exclude_from_payroll: boolean
          exempt_from_timeclock: boolean
          experience_contract_days: number | null
          experience_extension_days: number | null
          experience_initial_days: number | null
          father_name: string | null
          first_job: boolean | null
          foreigner_arrival_date: string | null
          foreigner_rnm: string | null
          foreigner_visa_type: string | null
          full_name: string
          gender: string | null
          gender_identity: string | null
          hazard_pay_percent: number | null
          hazard_pay_type: string | null
          health_plan_copay: number
          hire_date: string | null
          id: string
          is_apprentice: boolean | null
          journey_type: string | null
          marital_status: string | null
          monthly_hours: number | null
          mother_name: string | null
          nationality: string | null
          night_shift_eligible: boolean
          nis_number: string | null
          notes: string | null
          passport_number: string | null
          phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          position: string | null
          position_id: string | null
          registration_number: string | null
          reservist_number: string | null
          rg: string | null
          rg_issue_date: string | null
          rg_issuer: string | null
          rg_uf: string | null
          salary: number | null
          salary_type: string | null
          social_name: string | null
          spouse_name: string | null
          state: string | null
          status: string
          store_id: string
          termination_date: string | null
          termination_reason:
            | Database["public"]["Enums"]["termination_reason"]
            | null
          time_clock_payroll: boolean | null
          time_clock_required: boolean | null
          training_end_date: string | null
          training_start_date: string | null
          training_status: string
          union_member: boolean | null
          updated_at: string
          user_id: string | null
          voter_id: string | null
          voter_section: string | null
          voter_zone: string | null
          weekly_hours: number | null
          whatsapp_opt_out: boolean
          work_regime: string | null
          work_schedule: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          admission_date?: string | null
          allocated_store_id?: string | null
          avatar_path?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          birth_date?: string | null
          birth_state?: string | null
          cbo_code?: string | null
          cbo_title?: string | null
          city?: string | null
          cnh_category?: string | null
          cnh_expiration?: string | null
          cnh_number?: string | null
          contract_type?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          ctps_issue_date?: string | null
          ctps_number?: string | null
          ctps_series?: string | null
          ctps_uf?: string | null
          department?: string | null
          disability_type?: string | null
          education_level?: string | null
          email?: string | null
          esocial_category?: string | null
          ethnicity?: string | null
          exclude_from_payroll?: boolean
          exempt_from_timeclock?: boolean
          experience_contract_days?: number | null
          experience_extension_days?: number | null
          experience_initial_days?: number | null
          father_name?: string | null
          first_job?: boolean | null
          foreigner_arrival_date?: string | null
          foreigner_rnm?: string | null
          foreigner_visa_type?: string | null
          full_name: string
          gender?: string | null
          gender_identity?: string | null
          hazard_pay_percent?: number | null
          hazard_pay_type?: string | null
          health_plan_copay?: number
          hire_date?: string | null
          id?: string
          is_apprentice?: boolean | null
          journey_type?: string | null
          marital_status?: string | null
          monthly_hours?: number | null
          mother_name?: string | null
          nationality?: string | null
          night_shift_eligible?: boolean
          nis_number?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          position?: string | null
          position_id?: string | null
          registration_number?: string | null
          reservist_number?: string | null
          rg?: string | null
          rg_issue_date?: string | null
          rg_issuer?: string | null
          rg_uf?: string | null
          salary?: number | null
          salary_type?: string | null
          social_name?: string | null
          spouse_name?: string | null
          state?: string | null
          status?: string
          store_id: string
          termination_date?: string | null
          termination_reason?:
            | Database["public"]["Enums"]["termination_reason"]
            | null
          time_clock_payroll?: boolean | null
          time_clock_required?: boolean | null
          training_end_date?: string | null
          training_start_date?: string | null
          training_status?: string
          union_member?: boolean | null
          updated_at?: string
          user_id?: string | null
          voter_id?: string | null
          voter_section?: string | null
          voter_zone?: string | null
          weekly_hours?: number | null
          whatsapp_opt_out?: boolean
          work_regime?: string | null
          work_schedule?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          admission_date?: string | null
          allocated_store_id?: string | null
          avatar_path?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          birth_date?: string | null
          birth_state?: string | null
          cbo_code?: string | null
          cbo_title?: string | null
          city?: string | null
          cnh_category?: string | null
          cnh_expiration?: string | null
          cnh_number?: string | null
          contract_type?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          ctps_issue_date?: string | null
          ctps_number?: string | null
          ctps_series?: string | null
          ctps_uf?: string | null
          department?: string | null
          disability_type?: string | null
          education_level?: string | null
          email?: string | null
          esocial_category?: string | null
          ethnicity?: string | null
          exclude_from_payroll?: boolean
          exempt_from_timeclock?: boolean
          experience_contract_days?: number | null
          experience_extension_days?: number | null
          experience_initial_days?: number | null
          father_name?: string | null
          first_job?: boolean | null
          foreigner_arrival_date?: string | null
          foreigner_rnm?: string | null
          foreigner_visa_type?: string | null
          full_name?: string
          gender?: string | null
          gender_identity?: string | null
          hazard_pay_percent?: number | null
          hazard_pay_type?: string | null
          health_plan_copay?: number
          hire_date?: string | null
          id?: string
          is_apprentice?: boolean | null
          journey_type?: string | null
          marital_status?: string | null
          monthly_hours?: number | null
          mother_name?: string | null
          nationality?: string | null
          night_shift_eligible?: boolean
          nis_number?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          position?: string | null
          position_id?: string | null
          registration_number?: string | null
          reservist_number?: string | null
          rg?: string | null
          rg_issue_date?: string | null
          rg_issuer?: string | null
          rg_uf?: string | null
          salary?: number | null
          salary_type?: string | null
          social_name?: string | null
          spouse_name?: string | null
          state?: string | null
          status?: string
          store_id?: string
          termination_date?: string | null
          termination_reason?:
            | Database["public"]["Enums"]["termination_reason"]
            | null
          time_clock_payroll?: boolean | null
          time_clock_required?: boolean | null
          training_end_date?: string | null
          training_start_date?: string | null
          training_status?: string
          union_member?: boolean | null
          updated_at?: string
          user_id?: string | null
          voter_id?: string | null
          voter_section?: string | null
          voter_zone?: string | null
          weekly_hours?: number | null
          whatsapp_opt_out?: boolean
          work_regime?: string | null
          work_schedule?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_allocated_store_id_fkey"
            columns: ["allocated_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ems_sensor_readings: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          measurement: number
          sensor_code: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at: string
          measurement: number
          sensor_code: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          measurement?: number
          sensor_code?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ems_sensor_readings_sensor_code_fkey"
            columns: ["sensor_code"]
            isOneToOne: false
            referencedRelation: "ems_sensors"
            referencedColumns: ["unique_code"]
          },
          {
            foreignKeyName: "ems_sensor_readings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ems_sensors: {
        Row: {
          active: boolean
          created_at: string
          label: string
          max_value: number | null
          min_value: number | null
          sensor_type: string
          store_id: string | null
          unique_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          label: string
          max_value?: number | null
          min_value?: number | null
          sensor_type?: string
          store_id?: string | null
          unique_code: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          sensor_type?: string
          store_id?: string | null
          unique_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ems_sensors_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_warranties: {
        Row: {
          asset_tag: string | null
          created_at: string
          created_by: string
          equipment_name: string
          id: string
          installation_location: string | null
          invoice_id: string | null
          invoice_item_id: string | null
          invoice_number: string | null
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          serial_number: string | null
          store_id: string
          supplier_name: string | null
          updated_at: string
          warranty_expires_at: string | null
          warranty_months: number
        }
        Insert: {
          asset_tag?: string | null
          created_at?: string
          created_by: string
          equipment_name: string
          id?: string
          installation_location?: string | null
          invoice_id?: string | null
          invoice_item_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          store_id: string
          supplier_name?: string | null
          updated_at?: string
          warranty_expires_at?: string | null
          warranty_months?: number
        }
        Update: {
          asset_tag?: string | null
          created_at?: string
          created_by?: string
          equipment_name?: string
          id?: string
          installation_location?: string | null
          invoice_id?: string | null
          invoice_item_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          store_id?: string
          supplier_name?: string | null
          updated_at?: string
          warranty_expires_at?: string | null
          warranty_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipment_warranties_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_warranties_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_warranties_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criteria: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_auto: boolean
          name: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_auto?: boolean
          name: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_auto?: boolean
          name?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      evaluation_cycles: {
        Row: {
          bonus_value_per_point: number
          created_at: string
          end_date: string
          id: string
          name: string
          notes: string | null
          periodicity: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          bonus_value_per_point?: number
          created_at?: string
          end_date: string
          id?: string
          name: string
          notes?: string | null
          periodicity?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          bonus_value_per_point?: number
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          notes?: string | null
          periodicity?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      evaluation_scores: {
        Row: {
          created_at: string
          criterion_id: string
          evaluation_id: string
          id: string
          score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criterion_id: string
          evaluation_id: string
          id?: string
          score: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criterion_id?: string
          evaluation_id?: string
          id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_scores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          bonus_amount: number | null
          bonus_notes: string | null
          created_at: string
          created_by: string | null
          cycle_id: string
          employee_id: string
          final_score: number | null
          general_notes: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          bonus_amount?: number | null
          bonus_notes?: string | null
          created_at?: string
          created_by?: string | null
          cycle_id: string
          employee_id: string
          final_score?: number | null
          general_notes?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          bonus_amount?: number | null
          bonus_notes?: string | null
          created_at?: string
          created_by?: string | null
          cycle_id?: string
          employee_id?: string
          final_score?: number | null
          general_notes?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      external_partner_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          module: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          module: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          module?: string
          user_id?: string
        }
        Relationships: []
      }
      factory_request_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity_approved: number | null
          quantity_delivered: number | null
          quantity_requested: number
          request_id: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity_approved?: number | null
          quantity_delivered?: number | null
          quantity_requested: number
          request_id: string
          sort_order?: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity_approved?: number | null
          quantity_delivered?: number | null
          quantity_requested?: number
          request_id?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "factory_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          notes: string | null
          received_at: string | null
          received_by: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          shipped_at: string | null
          shipped_by: string | null
          status: Database["public"]["Enums"]["factory_request_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          shipped_at?: string | null
          shipped_by?: string | null
          status?: Database["public"]["Enums"]["factory_request_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          shipped_at?: string | null
          shipped_by?: string | null
          status?: Database["public"]["Enums"]["factory_request_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          percent: number | null
          source_id: string
          source_kind: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          percent?: number | null
          source_id: string
          source_kind: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          percent?: number | null
          source_id?: string
          source_kind?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_allocations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          color: string | null
          created_at: string
          dre_group: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          sort_order: number
          subgroup: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          dre_group?: string | null
          id?: string
          is_active?: boolean
          kind: string
          name: string
          sort_order?: number
          subgroup?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          dre_group?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          sort_order?: number
          subgroup?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      freelancer_daily_payments: {
        Row: {
          amount: number
          check_in_at: string | null
          check_in_distance_m: number | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_within_geofence: boolean | null
          check_out_at: string | null
          check_out_distance_m: number | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_within_geofence: boolean | null
          created_at: string
          created_by: string | null
          freelancer_id: string
          id: string
          late_alert_sent_at: string | null
          notes: string | null
          paid_at: string | null
          status: string
          store_id: string | null
          updated_at: string
          work_date: string
        }
        Insert: {
          amount: number
          check_in_at?: string | null
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_within_geofence?: boolean | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_within_geofence?: boolean | null
          created_at?: string
          created_by?: string | null
          freelancer_id: string
          id?: string
          late_alert_sent_at?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          work_date: string
        }
        Update: {
          amount?: number
          check_in_at?: string | null
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_within_geofence?: boolean | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_within_geofence?: boolean | null
          created_at?: string
          created_by?: string | null
          freelancer_id?: string
          id?: string
          late_alert_sent_at?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_daily_payments_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "freelancers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_daily_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_job_applications: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          freelancer_id: string
          id: string
          job_id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          freelancer_id: string
          id?: string
          job_id: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          freelancer_id?: string
          id?: string
          job_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_job_applications_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "freelancers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "freelancer_job_openings"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_job_openings: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          filled_at: string | null
          filled_freelancer_id: string | null
          id: string
          payment_id: string | null
          start_time: string | null
          status: string
          store_id: string | null
          title: string
          updated_at: string
          work_date: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          filled_at?: string | null
          filled_freelancer_id?: string | null
          id?: string
          payment_id?: string | null
          start_time?: string | null
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
          work_date: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          filled_at?: string | null
          filled_freelancer_id?: string | null
          id?: string
          payment_id?: string | null
          start_time?: string | null
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_job_openings_filled_freelancer_id_fkey"
            columns: ["filled_freelancer_id"]
            isOneToOne: false
            referencedRelation: "freelancers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_job_openings_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "freelancer_daily_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_job_openings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancers: {
        Row: {
          address: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          pix_key: string | null
          pix_key_type: string | null
          status: string
          store_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freelancers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gas_voucher_purchases: {
        Row: {
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          purchased_at: string
          quantity: number
          remaining: number
          total_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchased_at?: string
          quantity: number
          remaining: number
          total_amount: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchased_at?: string
          quantity?: number
          remaining?: number
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gas_voucher_purchases_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gas_voucher_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          purchase_id: string | null
          received_at: string | null
          received_by: string | null
          requested_at: string
          requested_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_id?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_id?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gas_voucher_requests_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "gas_voucher_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gas_voucher_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gas_voucher_settings: {
        Row: {
          created_at: string
          id: string
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      gas_voucher_store_state: {
        Row: {
          created_at: string
          empty_qty: number
          has_reserve: boolean
          in_use_qty: number
          last_received_at: string | null
          reserve_activated_at: string | null
          reserve_qty: number
          store_id: string
          total_qty: number
          updated_at: string
          vouchers_balance: number
        }
        Insert: {
          created_at?: string
          empty_qty?: number
          has_reserve?: boolean
          in_use_qty?: number
          last_received_at?: string | null
          reserve_activated_at?: string | null
          reserve_qty?: number
          store_id: string
          total_qty?: number
          updated_at?: string
          vouchers_balance?: number
        }
        Update: {
          created_at?: string
          empty_qty?: number
          has_reserve?: boolean
          in_use_qty?: number
          last_received_at?: string | null
          reserve_activated_at?: string | null
          reserve_qty?: number
          store_id?: string
          total_qty?: number
          updated_at?: string
          vouchers_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "gas_voucher_store_state_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      giana_feedback: {
        Row: {
          answered_at: string | null
          asked_at: string
          brand_id: string | null
          comment: string | null
          conversation_id: string | null
          conversation_source: string
          created_at: string
          id: string
          phone: string | null
          rating: string | null
          raw_response: string | null
          sentiment: string | null
          store_id: string | null
        }
        Insert: {
          answered_at?: string | null
          asked_at?: string
          brand_id?: string | null
          comment?: string | null
          conversation_id?: string | null
          conversation_source?: string
          created_at?: string
          id?: string
          phone?: string | null
          rating?: string | null
          raw_response?: string | null
          sentiment?: string | null
          store_id?: string | null
        }
        Update: {
          answered_at?: string | null
          asked_at?: string
          brand_id?: string | null
          comment?: string | null
          conversation_id?: string | null
          conversation_source?: string
          created_at?: string
          id?: string
          phone?: string | null
          rating?: string | null
          raw_response?: string | null
          sentiment?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "giana_feedback_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giana_feedback_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      giana_weekly_reports: {
        Row: {
          analysis: Json
          conversations_analyzed: number | null
          conversations_total: number | null
          created_at: string
          error: string | null
          id: string
          metrics: Json
          status: string
          triggered_by: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          analysis?: Json
          conversations_analyzed?: number | null
          conversations_total?: number | null
          created_at?: string
          error?: string | null
          id?: string
          metrics?: Json
          status?: string
          triggered_by?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          analysis?: Json
          conversations_analyzed?: number | null
          conversations_total?: number | null
          created_at?: string
          error?: string | null
          id?: string
          metrics?: Json
          status?: string
          triggered_by?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      google_reviews: {
        Row: {
          author_name: string
          author_photo_url: string | null
          fetched_at: string
          id: string
          language: string | null
          place_id: string
          published_at: string | null
          rating: number
          relative_time: string | null
          text: string
          unit_label: string
        }
        Insert: {
          author_name: string
          author_photo_url?: string | null
          fetched_at?: string
          id?: string
          language?: string | null
          place_id: string
          published_at?: string | null
          rating: number
          relative_time?: string | null
          text: string
          unit_label: string
        }
        Update: {
          author_name?: string
          author_photo_url?: string | null
          fetched_at?: string
          id?: string
          language?: string | null
          place_id?: string
          published_at?: string | null
          rating?: number
          relative_time?: string | null
          text?: string
          unit_label?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          name: string
          notes: string | null
          scope: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          holiday_date: string
          id?: string
          name: string
          notes?: string | null
          scope?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          notes?: string | null
          scope?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      hour_bank_entries: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          entry_type: Database["public"]["Enums"]["hour_bank_entry_type"]
          expires_at: string | null
          id: string
          minutes: number
          minutes_remaining: number
          notes: string | null
          reference_date: string
          source_id: string | null
          source_kind: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          entry_type: Database["public"]["Enums"]["hour_bank_entry_type"]
          expires_at?: string | null
          id?: string
          minutes: number
          minutes_remaining?: number
          notes?: string | null
          reference_date: string
          source_id?: string | null
          source_kind?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          entry_type?: Database["public"]["Enums"]["hour_bank_entry_type"]
          expires_at?: string | null
          id?: string
          minutes?: number
          minutes_remaining?: number
          notes?: string | null
          reference_date?: string
          source_id?: string | null
          source_kind?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hour_bank_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hour_bank_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "hr_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_announcements: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string | null
          id: string
          is_active: boolean
          message: string
          priority: string
          recurrence: string
          recurrence_day: number | null
          schedule_end_date: string | null
          schedule_start_date: string | null
          scope: string
          send_push: boolean
          send_whatsapp: boolean
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          message: string
          priority?: string
          recurrence?: string
          recurrence_day?: number | null
          schedule_end_date?: string | null
          schedule_start_date?: string | null
          scope?: string
          send_push?: boolean
          send_whatsapp?: boolean
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          message?: string
          priority?: string
          recurrence?: string
          recurrence_day?: number | null
          schedule_end_date?: string | null
          schedule_start_date?: string | null
          scope?: string
          send_push?: boolean
          send_whatsapp?: boolean
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_announcements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_announcements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_announcements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ifood_sim_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          latency_ms: number | null
          message: string | null
          request: Json | null
          response: Json | null
          scenario: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          request?: Json | null
          response?: Json | null
          scenario: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          request?: Json | null
          response?: Json | null
          scenario?: string
          status?: string
        }
        Relationships: []
      }
      infraction_types: {
        Row: {
          created_at: string
          default_suspension_weeks: number
          default_weight: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          severity: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_suspension_weeks?: number
          default_weight?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          severity?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_suspension_weeks?: number
          default_weight?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_regulation_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          employee_id: string | null
          id: string
          ip_address: string | null
          regulation_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          regulation_version?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          regulation_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_regulation_acceptances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_regulation_acceptances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_activities: {
        Row: {
          created_at: string
          description: string
          due_date: string | null
          id: string
          internship_id: string
          notes: string | null
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          internship_id: string
          notes?: string | null
          stage: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          internship_id?: string
          notes?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internship_activities_internship_id_fkey"
            columns: ["internship_id"]
            isOneToOne: false
            referencedRelation: "internships"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_candidates: {
        Row: {
          course: string | null
          created_at: string
          email: string | null
          evaluated_at: string | null
          evaluated_by: string | null
          evaluation_decision: string | null
          evaluation_notes: string | null
          evaluation_score: number | null
          full_name: string
          hired_employee_id: string | null
          id: string
          institution: string | null
          internship_opening_id: string | null
          interview_date: string | null
          interview_notes: string | null
          job_application_id: string | null
          notes: string | null
          phone: string | null
          stage: string
          trial_end_date: string | null
          trial_notes: string | null
          trial_start_date: string | null
          updated_at: string
        }
        Insert: {
          course?: string | null
          created_at?: string
          email?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          evaluation_decision?: string | null
          evaluation_notes?: string | null
          evaluation_score?: number | null
          full_name: string
          hired_employee_id?: string | null
          id?: string
          institution?: string | null
          internship_opening_id?: string | null
          interview_date?: string | null
          interview_notes?: string | null
          job_application_id?: string | null
          notes?: string | null
          phone?: string | null
          stage?: string
          trial_end_date?: string | null
          trial_notes?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Update: {
          course?: string | null
          created_at?: string
          email?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          evaluation_decision?: string | null
          evaluation_notes?: string | null
          evaluation_score?: number | null
          full_name?: string
          hired_employee_id?: string | null
          id?: string
          institution?: string | null
          internship_opening_id?: string | null
          interview_date?: string | null
          interview_notes?: string | null
          job_application_id?: string | null
          notes?: string | null
          phone?: string | null
          stage?: string
          trial_end_date?: string | null
          trial_notes?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internship_candidates_hired_employee_id_fkey"
            columns: ["hired_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_candidates_hired_employee_id_fkey"
            columns: ["hired_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_candidates_internship_opening_id_fkey"
            columns: ["internship_opening_id"]
            isOneToOne: false
            referencedRelation: "internship_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_candidates_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_contracts: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          institution: string | null
          internship_id: string | null
          mime_type: string | null
          notes: string | null
          start_date: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          institution?: string | null
          internship_id?: string | null
          mime_type?: string | null
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          institution?: string | null
          internship_id?: string | null
          mime_type?: string | null
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internship_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_contracts_internship_id_fkey"
            columns: ["internship_id"]
            isOneToOne: false
            referencedRelation: "internships"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_evaluations: {
        Row: {
          created_at: string
          created_by: string | null
          evaluation_date: string
          feedback: string | null
          id: string
          internship_id: string
          score: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          evaluation_date?: string
          feedback?: string | null
          id?: string
          internship_id: string
          score: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          evaluation_date?: string
          feedback?: string | null
          id?: string
          internship_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "internship_evaluations_internship_id_fkey"
            columns: ["internship_id"]
            isOneToOne: false
            referencedRelation: "internships"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_openings: {
        Row: {
          created_at: string
          id: string
          job_opening_id: string | null
          notes: string | null
          positions_count: number
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_opening_id?: string | null
          notes?: string | null
          positions_count?: number
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_opening_id?: string | null
          notes?: string | null
          positions_count?: number
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internship_openings_job_opening_id_fkey"
            columns: ["job_opening_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_openings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      internship_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          exported_at: string | null
          id: string
          internship_id: string
          notes: string | null
          payment_date: string | null
          reference_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          exported_at?: string | null
          id?: string
          internship_id: string
          notes?: string | null
          payment_date?: string | null
          reference_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          exported_at?: string | null
          id?: string
          internship_id?: string
          notes?: string | null
          payment_date?: string | null
          reference_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internship_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internship_payments_internship_id_fkey"
            columns: ["internship_id"]
            isOneToOne: false
            referencedRelation: "internships"
            referencedColumns: ["id"]
          },
        ]
      }
      internships: {
        Row: {
          contract_external: boolean
          course: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string
          id: string
          institution: string | null
          internship_opening_id: string | null
          notes: string | null
          outsourced_company_id: string | null
          start_date: string
          status: string
          stipend_amount: number
          store_id: string | null
          supervisor_name: string | null
          updated_at: string
        }
        Insert: {
          contract_external?: boolean
          course?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date: string
          id?: string
          institution?: string | null
          internship_opening_id?: string | null
          notes?: string | null
          outsourced_company_id?: string | null
          start_date: string
          status?: string
          stipend_amount?: number
          store_id?: string | null
          supervisor_name?: string | null
          updated_at?: string
        }
        Update: {
          contract_external?: boolean
          course?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          institution?: string | null
          internship_opening_id?: string | null
          notes?: string | null
          outsourced_company_id?: string | null
          start_date?: string
          status?: string
          stipend_amount?: number
          store_id?: string | null
          supervisor_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internships_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_internship_opening_id_fkey"
            columns: ["internship_opening_id"]
            isOneToOne: false
            referencedRelation: "internship_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_outsourced_company_id_fkey"
            columns: ["outsourced_company_id"]
            isOneToOne: false
            referencedRelation: "outsourced_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_reschedule_log: {
        Row: {
          application_id: string
          created_at: string
          id: string
          new_slot_id: string | null
          previous_slot_id: string | null
          reason: string | null
          rescheduled_by: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          new_slot_id?: string | null
          previous_slot_id?: string | null
          reason?: string | null
          rescheduled_by?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          new_slot_id?: string | null
          previous_slot_id?: string | null
          reason?: string | null
          rescheduled_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_reschedule_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_reschedule_log_new_slot_id_fkey"
            columns: ["new_slot_id"]
            isOneToOne: false
            referencedRelation: "interview_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_reschedule_log_previous_slot_id_fkey"
            columns: ["previous_slot_id"]
            isOneToOne: false
            referencedRelation: "interview_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_slots: {
        Row: {
          booked_at: string | null
          booked_by_candidate_id: string | null
          created_at: string
          created_by: string | null
          duration_min: number
          id: string
          is_available: boolean
          location: string | null
          notes: string | null
          start_at: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          booked_at?: string | null
          booked_by_candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_min?: number
          id?: string
          is_available?: boolean
          location?: string | null
          notes?: string | null
          start_at: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          booked_at?: string | null
          booked_by_candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_min?: number
          id?: string
          is_available?: boolean
          location?: string | null
          notes?: string | null
          start_at?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_slots_booked_by_candidate_id_fkey"
            columns: ["booked_by_candidate_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_slots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          count_id: string
          counted_at: string | null
          counted_by: string | null
          counted_quantity: number | null
          created_at: string
          difference: number | null
          difference_value: number | null
          id: string
          notes: string | null
          product_id: string
          system_quantity: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          count_id: string
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          difference_value?: number | null
          id?: string
          notes?: string | null
          product_id: string
          system_quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          count_id?: string
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          difference_value?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          system_quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category_filter: string | null
          created_at: string
          divergent_items: number
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          reference_date: string
          status: string
          store_id: string
          submitted_at: string | null
          submitted_by: string | null
          total_difference_value: number
          total_items: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category_filter?: string | null
          created_at?: string
          divergent_items?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          reference_date?: string
          status?: string
          store_id: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_difference_value?: number
          total_items?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category_filter?: string | null
          created_at?: string
          divergent_items?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          reference_date?: string
          status?: string
          store_id?: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_difference_value?: number
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_invoice_files: {
        Row: {
          file_name: string
          file_path: string
          id: string
          invoice_id: string
          kind: string
          mime_type: string | null
          page_number: number | null
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          file_name: string
          file_path: string
          id?: string
          invoice_id: string
          kind?: string
          mime_type?: string | null
          page_number?: number | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          file_name?: string
          file_path?: string
          id?: string
          invoice_id?: string
          kind?: string
          mime_type?: string | null
          page_number?: number | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_invoice_files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_invoice_items: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          invoice_id: string
          line_number: number | null
          lot_number: string | null
          manufacture_date: string | null
          notes: string | null
          original_barcode: string | null
          original_code: string | null
          original_description: string
          original_ncm: string | null
          product_id: string | null
          quantity: number
          received: boolean
          received_at: string | null
          received_by: string | null
          total_value: number
          unit: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          invoice_id: string
          line_number?: number | null
          lot_number?: string | null
          manufacture_date?: string | null
          notes?: string | null
          original_barcode?: string | null
          original_code?: string | null
          original_description: string
          original_ncm?: string | null
          product_id?: string | null
          quantity?: number
          received?: boolean
          received_at?: string | null
          received_by?: string | null
          total_value?: number
          unit?: string
          unit_value?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          invoice_id?: string
          line_number?: number | null
          lot_number?: string | null
          manufacture_date?: string | null
          notes?: string | null
          original_barcode?: string | null
          original_code?: string | null
          original_description?: string
          original_ncm?: string | null
          product_id?: string | null
          quantity?: number
          received?: boolean
          received_at?: string | null
          received_by?: string | null
          total_value?: number
          unit?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_invoices: {
        Row: {
          created_at: string
          created_by: string
          extraction_error: string | null
          extraction_status: string
          id: string
          invoice_key: string | null
          invoice_kind: string
          invoice_number: string | null
          invoice_series: string | null
          issue_date: string | null
          no_invoice: boolean
          notes: string | null
          payable_group_id: string | null
          raw_extraction: Json | null
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          store_id: string
          supplier_cnpj: string | null
          supplier_name: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          extraction_error?: string | null
          extraction_status?: string
          id?: string
          invoice_key?: string | null
          invoice_kind?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issue_date?: string | null
          no_invoice?: boolean
          notes?: string | null
          payable_group_id?: string | null
          raw_extraction?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          store_id: string
          supplier_cnpj?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          extraction_error?: string | null
          extraction_status?: string
          id?: string
          invoice_key?: string | null
          invoice_kind?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issue_date?: string | null
          no_invoice?: boolean
          notes?: string | null
          payable_group_id?: string | null
          raw_extraction?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          store_id?: string
          supplier_cnpj?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_losses: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lot_id: string | null
          movement_id: string | null
          notes: string | null
          occurred_on: string
          product_id: string
          quantity: number
          reason: string
          store_id: string
          total_cost: number | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_id?: string | null
          movement_id?: string | null
          notes?: string | null
          occurred_on?: string
          product_id: string
          quantity: number
          reason?: string
          store_id: string
          total_cost?: number | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_id?: string | null
          movement_id?: string | null
          notes?: string | null
          occurred_on?: string
          product_id?: string
          quantity?: number
          reason?: string
          store_id?: string
          total_cost?: number | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_losses_lot_fk"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot_alerts"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_losses_lot_fk"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_losses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_losses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          created_at: string
          created_by: string | null
          expiry_date: string
          id: string
          initial_quantity: number
          invoice_id: string | null
          lot_number: string | null
          manufacture_date: string | null
          notes: string | null
          origin_transfer_id: string | null
          parent_lot_id: string | null
          product_id: string
          quantity: number
          status: string
          store_id: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expiry_date: string
          id?: string
          initial_quantity?: number
          invoice_id?: string | null
          lot_number?: string | null
          manufacture_date?: string | null
          notes?: string | null
          origin_transfer_id?: string | null
          parent_lot_id?: string | null
          product_id: string
          quantity?: number
          status?: string
          store_id: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expiry_date?: string
          id?: string
          initial_quantity?: number
          invoice_id?: string | null
          lot_number?: string | null
          manufacture_date?: string | null
          notes?: string | null
          origin_transfer_id?: string | null
          parent_lot_id?: string | null
          product_id?: string
          quantity?: number
          status?: string
          store_id?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_origin_transfer_id_fkey"
            columns: ["origin_transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_parent_lot_id_fkey"
            columns: ["parent_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot_alerts"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_lots_parent_lot_id_fkey"
            columns: ["parent_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          art_file_url: string | null
          average_cost: number
          barcode: string | null
          category: string | null
          cest: string | null
          cfop_transferencia: string | null
          cfop_venda: string | null
          created_at: string
          created_by: string | null
          cst_csosn: string | null
          custom_notes: string | null
          default_shelf_life_days: number | null
          factory_only: boolean
          fixed_supplier_id: string | null
          id: string
          infinite_stock: boolean
          internal_code: string | null
          is_active: boolean
          is_custom: boolean
          is_internal: boolean
          last_cost: number | null
          last_purchase_at: string | null
          lead_time_days: number | null
          name: string
          ncm: string | null
          notes: string | null
          origem_mercadoria: string | null
          photo_path: string | null
          print_run: number | null
          product_type: string
          production_flow: string
          reference_unit_cost: number | null
          requires_expiry: boolean
          stock_scope: string
          unidade_tributavel: string | null
          unit: string
          unit_value: number | null
          updated_at: string
          usage_roles: string[]
        }
        Insert: {
          art_file_url?: string | null
          average_cost?: number
          barcode?: string | null
          category?: string | null
          cest?: string | null
          cfop_transferencia?: string | null
          cfop_venda?: string | null
          created_at?: string
          created_by?: string | null
          cst_csosn?: string | null
          custom_notes?: string | null
          default_shelf_life_days?: number | null
          factory_only?: boolean
          fixed_supplier_id?: string | null
          id?: string
          infinite_stock?: boolean
          internal_code?: string | null
          is_active?: boolean
          is_custom?: boolean
          is_internal?: boolean
          last_cost?: number | null
          last_purchase_at?: string | null
          lead_time_days?: number | null
          name: string
          ncm?: string | null
          notes?: string | null
          origem_mercadoria?: string | null
          photo_path?: string | null
          print_run?: number | null
          product_type?: string
          production_flow?: string
          reference_unit_cost?: number | null
          requires_expiry?: boolean
          stock_scope?: string
          unidade_tributavel?: string | null
          unit?: string
          unit_value?: number | null
          updated_at?: string
          usage_roles?: string[]
        }
        Update: {
          art_file_url?: string | null
          average_cost?: number
          barcode?: string | null
          category?: string | null
          cest?: string | null
          cfop_transferencia?: string | null
          cfop_venda?: string | null
          created_at?: string
          created_by?: string | null
          cst_csosn?: string | null
          custom_notes?: string | null
          default_shelf_life_days?: number | null
          factory_only?: boolean
          fixed_supplier_id?: string | null
          id?: string
          infinite_stock?: boolean
          internal_code?: string | null
          is_active?: boolean
          is_custom?: boolean
          is_internal?: boolean
          last_cost?: number | null
          last_purchase_at?: string | null
          lead_time_days?: number | null
          name?: string
          ncm?: string | null
          notes?: string | null
          origem_mercadoria?: string | null
          photo_path?: string | null
          print_run?: number | null
          product_type?: string
          production_flow?: string
          reference_unit_cost?: number | null
          requires_expiry?: boolean
          stock_scope?: string
          unidade_tributavel?: string | null
          unit?: string
          unit_value?: number | null
          updated_at?: string
          usage_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_products_fixed_supplier_id_fkey"
            columns: ["fixed_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_receiving_positions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          position: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          position: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          position?: string
        }
        Relationships: []
      }
      inventory_stock: {
        Row: {
          id: string
          max_qty: number
          min_qty: number
          product_id: string
          quantity: number
          store_id: string
          target_qty: number
          updated_at: string
        }
        Insert: {
          id?: string
          max_qty?: number
          min_qty?: number
          product_id: string
          quantity?: number
          store_id: string
          target_qty?: number
          updated_at?: string
        }
        Update: {
          id?: string
          max_qty?: number
          min_qty?: number
          product_id?: string
          quantity?: number
          store_id?: string
          target_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          invoice_item_id: string | null
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          reason: string | null
          store_id: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          movement_type: string
          notes?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          store_id: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          store_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_movements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_supplier_aliases: {
        Row: {
          barcode: string | null
          confirmations: number
          created_at: string
          created_by: string | null
          description_normalized: string | null
          id: string
          last_used_at: string
          pack_description: string | null
          pack_size: number | null
          product_id: string
          purchase_unit: string | null
          supplier_cnpj: string
          supplier_code: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          confirmations?: number
          created_at?: string
          created_by?: string | null
          description_normalized?: string | null
          id?: string
          last_used_at?: string
          pack_description?: string | null
          pack_size?: number | null
          product_id: string
          purchase_unit?: string | null
          supplier_cnpj: string
          supplier_code?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          confirmations?: number
          created_at?: string
          created_by?: string | null
          description_normalized?: string | null
          id?: string
          last_used_at?: string
          pack_description?: string | null
          pack_size?: number | null
          product_id?: string
          purchase_unit?: string | null
          supplier_cnpj?: string
          supplier_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_supplier_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          created_at: string
          destination_lot_id: string | null
          id: string
          lot_id: string | null
          product_id: string
          quantity: number
          transfer_id: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          destination_lot_id?: string | null
          id?: string
          lot_id?: string | null
          product_id: string
          quantity: number
          transfer_id: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          destination_lot_id?: string | null
          id?: string
          lot_id?: string | null
          product_id?: string
          quantity?: number
          transfer_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_destination_lot_id_fkey"
            columns: ["destination_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot_alerts"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_destination_lot_id_fkey"
            columns: ["destination_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot_alerts"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          destination_store_id: string
          id: string
          notes: string | null
          origin_store_id: string
          received_at: string | null
          received_by: string | null
          receiver_name: string | null
          sender_name: string | null
          sent_at: string
          sent_by: string
          status: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          destination_store_id: string
          id?: string
          notes?: string | null
          origin_store_id: string
          received_at?: string | null
          received_by?: string | null
          receiver_name?: string | null
          sender_name?: string | null
          sent_at?: string
          sent_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          destination_store_id?: string
          id?: string
          notes?: string | null
          origin_store_id?: string
          received_at?: string | null
          received_by?: string | null
          receiver_name?: string | null
          sender_name?: string | null
          sent_at?: string
          sent_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_destination_store_id_fkey"
            columns: ["destination_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_origin_store_id_fkey"
            columns: ["origin_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          availability: string[]
          behavioral_answers: Json
          birth_date: string | null
          candidate_id: string | null
          city: string | null
          created_at: string
          email: string | null
          experience_years: number | null
          full_name: string
          has_transport: boolean | null
          id: string
          interview_notes: string | null
          interview_status: string
          job_opening_id: string
          last_job: string | null
          last_job_company: string | null
          manager_notes: string | null
          neighborhood: string | null
          phone: string
          resume_name: string | null
          resume_path: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screening_recommendation: string | null
          screening_score: number | null
          screening_summary: string | null
          selected_slot_id: string | null
          updated_at: string
        }
        Insert: {
          availability?: string[]
          behavioral_answers?: Json
          birth_date?: string | null
          candidate_id?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          experience_years?: number | null
          full_name: string
          has_transport?: boolean | null
          id?: string
          interview_notes?: string | null
          interview_status?: string
          job_opening_id: string
          last_job?: string | null
          last_job_company?: string | null
          manager_notes?: string | null
          neighborhood?: string | null
          phone: string
          resume_name?: string | null
          resume_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screening_recommendation?: string | null
          screening_score?: number | null
          screening_summary?: string | null
          selected_slot_id?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string[]
          behavioral_answers?: Json
          birth_date?: string | null
          candidate_id?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          experience_years?: number | null
          full_name?: string
          has_transport?: boolean | null
          id?: string
          interview_notes?: string | null
          interview_status?: string
          job_opening_id?: string
          last_job?: string | null
          last_job_company?: string | null
          manager_notes?: string | null
          neighborhood?: string | null
          phone?: string
          resume_name?: string | null
          resume_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screening_recommendation?: string | null
          screening_score?: number | null
          screening_summary?: string | null
          selected_slot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_opening_id_fkey"
            columns: ["job_opening_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_selected_slot_id_fkey"
            columns: ["selected_slot_id"]
            isOneToOne: false
            referencedRelation: "interview_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      job_candidates: {
        Row: {
          ai_concerns: string | null
          ai_recommendation: string | null
          ai_score: number | null
          ai_screened_at: string | null
          ai_summary: string | null
          applied_at: string
          availability: string | null
          city: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          created_employee_id: string | null
          current_stage: string
          document_upload_token: string | null
          document_upload_token_created_at: string | null
          documents_requested_at: string | null
          documents_requested_notes: string | null
          email: string | null
          expected_salary: number | null
          full_name: string
          has_experience: boolean | null
          id: string
          interview_scheduled_at: string | null
          interview_slot_id: string | null
          job_opening_id: string
          notes: string | null
          phone: string | null
          requested_documents: Json
          resume_name: string | null
          resume_path: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          ai_concerns?: string | null
          ai_recommendation?: string | null
          ai_score?: number | null
          ai_screened_at?: string | null
          ai_summary?: string | null
          applied_at?: string
          availability?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          created_employee_id?: string | null
          current_stage?: string
          document_upload_token?: string | null
          document_upload_token_created_at?: string | null
          documents_requested_at?: string | null
          documents_requested_notes?: string | null
          email?: string | null
          expected_salary?: number | null
          full_name: string
          has_experience?: boolean | null
          id?: string
          interview_scheduled_at?: string | null
          interview_slot_id?: string | null
          job_opening_id: string
          notes?: string | null
          phone?: string | null
          requested_documents?: Json
          resume_name?: string | null
          resume_path?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          ai_concerns?: string | null
          ai_recommendation?: string | null
          ai_score?: number | null
          ai_screened_at?: string | null
          ai_summary?: string | null
          applied_at?: string
          availability?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          created_employee_id?: string | null
          current_stage?: string
          document_upload_token?: string | null
          document_upload_token_created_at?: string | null
          documents_requested_at?: string | null
          documents_requested_notes?: string | null
          email?: string | null
          expected_salary?: number | null
          full_name?: string
          has_experience?: boolean | null
          id?: string
          interview_scheduled_at?: string | null
          interview_slot_id?: string | null
          job_opening_id?: string
          notes?: string | null
          phone?: string | null
          requested_documents?: Json
          resume_name?: string | null
          resume_path?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_candidates_created_employee_id_fkey"
            columns: ["created_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_candidates_created_employee_id_fkey"
            columns: ["created_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_candidates_job_opening_id_fkey"
            columns: ["job_opening_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_interview_slots: {
        Row: {
          created_at: string
          created_by: string | null
          duration_min: number
          id: string
          is_available: boolean
          job_opening_id: string
          location: string | null
          start_at: string
          taken_by_application_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_min?: number
          id?: string
          is_available?: boolean
          job_opening_id: string
          location?: string | null
          start_at: string
          taken_by_application_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_min?: number
          id?: string
          is_available?: boolean
          job_opening_id?: string
          location?: string | null
          start_at?: string
          taken_by_application_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_interview_slots_job_opening_id_fkey"
            columns: ["job_opening_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_interview_slots_taken_fk"
            columns: ["taken_by_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_openings: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean
          notes: string | null
          opened_at: string
          position: string
          positions_count: number
          public_benefits: string | null
          public_image_url: string | null
          public_slug: string | null
          public_summary: string | null
          requirements: string | null
          responsibilities: string | null
          salary_max: number | null
          salary_min: number | null
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          notes?: string | null
          opened_at?: string
          position: string
          positions_count?: number
          public_benefits?: string | null
          public_image_url?: string | null
          public_slug?: string | null
          public_summary?: string | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          notes?: string | null
          opened_at?: string
          position?: string
          positions_count?: number
          public_benefits?: string | null
          public_image_url?: string | null
          public_slug?: string | null
          public_summary?: string | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_openings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      late_punch_alerts_sent: {
        Row: {
          employee_id: string
          id: string
          notified_count: number
          schedule_date: string
          sent_at: string
          shift_start_time: string | null
          store_id: string | null
        }
        Insert: {
          employee_id: string
          id?: string
          notified_count?: number
          schedule_date: string
          sent_at?: string
          shift_start_time?: string | null
          store_id?: string | null
        }
        Update: {
          employee_id?: string
          id?: string
          notified_count?: number
          schedule_date?: string
          sent_at?: string
          shift_start_time?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "late_punch_alerts_sent_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_punch_alerts_sent_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_punch_alerts_sent_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      lgpd_consents: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      medical_certificates: {
        Row: {
          certificate_date: string
          cid_code: string | null
          cid_description: string | null
          created_at: string
          created_by: string | null
          days_off: number
          doctor_crm: string | null
          doctor_name: string | null
          document_type: string
          employee_id: string
          file_name: string | null
          file_path: string | null
          id: string
          infraction_id: string | null
          inss_benefit_number: string | null
          inss_benefit_type: string | null
          inss_referral: boolean
          is_pcmso: boolean
          leave_applied: boolean
          leave_end_date: string | null
          leave_start_date: string | null
          mime_type: string | null
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          status: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          certificate_date: string
          cid_code?: string | null
          cid_description?: string | null
          created_at?: string
          created_by?: string | null
          days_off?: number
          doctor_crm?: string | null
          doctor_name?: string | null
          document_type?: string
          employee_id: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          infraction_id?: string | null
          inss_benefit_number?: string | null
          inss_benefit_type?: string | null
          inss_referral?: boolean
          is_pcmso?: boolean
          leave_applied?: boolean
          leave_end_date?: string | null
          leave_start_date?: string | null
          mime_type?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          certificate_date?: string
          cid_code?: string | null
          cid_description?: string | null
          created_at?: string
          created_by?: string | null
          days_off?: number
          doctor_crm?: string | null
          doctor_name?: string | null
          document_type?: string
          employee_id?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          infraction_id?: string | null
          inss_benefit_number?: string | null
          inss_benefit_type?: string | null
          inss_referral?: boolean
          is_pcmso?: boolean
          leave_applied?: boolean
          leave_end_date?: string | null
          leave_start_date?: string | null
          mime_type?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_certificates_infraction_id_fkey"
            columns: ["infraction_id"]
            isOneToOne: false
            referencedRelation: "employee_infractions"
            referencedColumns: ["id"]
          },
        ]
      }
      mental_health_alerts: {
        Row: {
          assigned_to: string | null
          created_at: string
          employee_id: string
          id: string
          resolution_notes: string | null
          resolved_at: string | null
          rule: string
          status: string
          triggered_at: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          employee_id: string
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          rule: string
          status?: string
          triggered_at?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          rule?: string
          status?: string
          triggered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mental_health_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      mental_health_followups: {
        Row: {
          alert_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          followup_date: string
          id: string
          notes: string | null
          pcmso_document_id: string | null
          type: string
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          followup_date?: string
          id?: string
          notes?: string | null
          pcmso_document_id?: string | null
          type: string
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          followup_date?: string
          id?: string
          notes?: string | null
          pcmso_document_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mental_health_followups_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "mental_health_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_followups_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_followups_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_followups_pcmso_document_id_fkey"
            columns: ["pcmso_document_id"]
            isOneToOne: false
            referencedRelation: "medical_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_category_brands: {
        Row: {
          brand_id: string
          category_id: string
          created_at: string
        }
        Insert: {
          brand_id: string
          category_id: string
          created_at?: string
        }
        Update: {
          brand_id?: string
          category_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_category_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_category_brands_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_brands: {
        Row: {
          brand_id: string
          created_at: string
          menu_item_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          menu_item_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          menu_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_brands_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_complement_groups: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          max_choices: number
          menu_item_id: string
          min_choices: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_choices?: number
          menu_item_id: string
          min_choices?: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_choices?: number
          menu_item_id?: string
          min_choices?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_complement_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_complement_links: {
        Row: {
          created_at: string
          group_id: string
          menu_item_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_id: string
          menu_item_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_id?: string
          menu_item_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_complement_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "complement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_complement_links_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_complement_options: {
        Row: {
          created_at: string
          extra_price: number
          group_id: string
          id: string
          is_active: boolean
          linked_item_id: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          extra_price?: number
          group_id: string
          id?: string
          is_active?: boolean
          linked_item_id?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          extra_price?: number
          group_id?: string
          id?: string
          is_active?: boolean
          linked_item_id?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_complement_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "menu_item_complement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_complement_options_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_components: {
        Row: {
          child_item_id: string
          created_at: string
          id: string
          parent_item_id: string
          quantity: number
          sort_order: number
        }
        Insert: {
          child_item_id: string
          created_at?: string
          id?: string
          parent_item_id: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          child_item_id?: string
          created_at?: string
          id?: string
          parent_item_id?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_components_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_components_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_stores: {
        Row: {
          created_at: string
          is_available: boolean
          menu_item_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          is_available?: boolean
          menu_item_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          is_available?: boolean
          menu_item_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_stores_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_combo: boolean
          name: string
          photo_path: string | null
          price: number
          recipe_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_combo?: boolean
          name: string
          photo_path?: string | null
          price?: number
          recipe_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_combo?: boolean
          name?: string
          photo_path?: string | null
          price?: number
          recipe_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_revenue: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          day: number | null
          gross_revenue: number
          id: string
          is_consolidated: boolean
          month: number
          notes: string | null
          store_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          day?: number | null
          gross_revenue?: number
          id?: string
          is_consolidated?: boolean
          month: number
          notes?: string | null
          store_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          day?: number | null
          gross_revenue?: number
          id?: string
          is_consolidated?: boolean
          month?: number
          notes?: string | null
          store_id?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_revenue_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_revenue_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_checkins: {
        Row: {
          comment: string | null
          created_at: string
          employee_id: string
          id: string
          mood_score: number | null
          needs_support: boolean
          skipped: boolean
          user_id: string
          week_start: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          employee_id: string
          id?: string
          mood_score?: number | null
          needs_support?: boolean
          skipped?: boolean
          user_id: string
          week_start: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          mood_score?: number | null
          needs_support?: boolean
          skipped?: boolean
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_checkins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mood_checkins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      network_alert_recipients: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_alert_recipients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      network_devices: {
        Row: {
          created_at: string
          current_status: string
          flap_debounce_seconds: number
          heartbeat_interval_seconds: number
          heartbeat_tolerance_seconds: number
          id: string
          is_active: boolean
          last_event_at: string | null
          last_heartbeat_at: string | null
          last_public_ip: string | null
          name: string
          notes: string | null
          store_id: string
          updated_at: string
          wan_primary_label: string
          wan_secondary_label: string
          webhook_token: string
        }
        Insert: {
          created_at?: string
          current_status?: string
          flap_debounce_seconds?: number
          heartbeat_interval_seconds?: number
          heartbeat_tolerance_seconds?: number
          id?: string
          is_active?: boolean
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_public_ip?: string | null
          name: string
          notes?: string | null
          store_id: string
          updated_at?: string
          wan_primary_label?: string
          wan_secondary_label?: string
          webhook_token?: string
        }
        Update: {
          created_at?: string
          current_status?: string
          flap_debounce_seconds?: number
          heartbeat_interval_seconds?: number
          heartbeat_tolerance_seconds?: number
          id?: string
          is_active?: boolean
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_public_ip?: string | null
          name?: string
          notes?: string | null
          store_id?: string
          updated_at?: string
          wan_primary_label?: string
          wan_secondary_label?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_devices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      network_wan_events: {
        Row: {
          created_at: string
          device_id: string
          duration_seconds: number | null
          event_type: string
          id: string
          payload: Json | null
          public_ip: string | null
          store_id: string
          suppress_reason: string | null
          suppressed: boolean
          wan_active: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          duration_seconds?: number | null
          event_type: string
          id?: string
          payload?: Json | null
          public_ip?: string | null
          store_id: string
          suppress_reason?: string | null
          suppressed?: boolean
          wan_active?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          duration_seconds?: number | null
          event_type?: string
          id?: string
          payload?: Json | null
          public_ip?: string | null
          store_id?: string
          suppress_reason?: string | null
          suppressed?: boolean
          wan_active?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_wan_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "network_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_wan_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nfe_inbox: {
        Row: {
          chave_acesso: string
          cnpj_destinatario: string
          created_at: string
          data_emissao: string | null
          fornecedor_cnpj: string | null
          fornecedor_nome: string | null
          id: string
          inventory_invoice_id: string | null
          manifest_protocol: string | null
          manifest_status: string | null
          manifested_at: string | null
          nfeio_event_id: string | null
          notes: string | null
          numero: string | null
          processed_at: string | null
          processed_by: string | null
          raw_payload: Json | null
          received_at: string
          serie: string | null
          source: string
          status: string
          store_id: string | null
          updated_at: string
          valor_total: number | null
          xml_content: string | null
        }
        Insert: {
          chave_acesso: string
          cnpj_destinatario: string
          created_at?: string
          data_emissao?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          inventory_invoice_id?: string | null
          manifest_protocol?: string | null
          manifest_status?: string | null
          manifested_at?: string | null
          nfeio_event_id?: string | null
          notes?: string | null
          numero?: string | null
          processed_at?: string | null
          processed_by?: string | null
          raw_payload?: Json | null
          received_at?: string
          serie?: string | null
          source?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          valor_total?: number | null
          xml_content?: string | null
        }
        Update: {
          chave_acesso?: string
          cnpj_destinatario?: string
          created_at?: string
          data_emissao?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          inventory_invoice_id?: string | null
          manifest_protocol?: string | null
          manifest_status?: string | null
          manifested_at?: string | null
          nfeio_event_id?: string | null
          notes?: string | null
          numero?: string | null
          processed_at?: string | null
          processed_by?: string | null
          raw_payload?: Json | null
          received_at?: string
          serie?: string | null
          source?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          valor_total?: number | null
          xml_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfe_inbox_inventory_invoice_id_fkey"
            columns: ["inventory_invoice_id"]
            isOneToOne: false
            referencedRelation: "inventory_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfe_inbox_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_day_records: {
        Row: {
          date: string
          id: string
          item_id: string
          note: string
          sim_nao: boolean
          store_id: string
          user_id: string
        }
        Insert: {
          date: string
          id?: string
          item_id: string
          note?: string
          sim_nao?: boolean
          store_id: string
          user_id: string
        }
        Update: {
          date?: string
          id?: string
          item_id?: string
          note?: string
          sim_nao?: boolean
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_day_records_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "nutri_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutri_day_records_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_equipment: {
        Row: {
          alert_delay_minutes: number
          created_at: string
          created_by: string
          ems_sensor_code: string | null
          equipment_type: string
          id: string
          last_humidity_pct: number | null
          last_online: boolean
          last_reading_at: string | null
          last_temp_c: number | null
          max_humidity_pct: number | null
          max_temp_c: number | null
          min_temp_c: number | null
          name: string
          out_of_range_since: string | null
          store_id: string | null
          tuya_active: boolean
          tuya_device_id: string | null
          tuya_sensor_type: string | null
        }
        Insert: {
          alert_delay_minutes?: number
          created_at?: string
          created_by: string
          ems_sensor_code?: string | null
          equipment_type?: string
          id?: string
          last_humidity_pct?: number | null
          last_online?: boolean
          last_reading_at?: string | null
          last_temp_c?: number | null
          max_humidity_pct?: number | null
          max_temp_c?: number | null
          min_temp_c?: number | null
          name: string
          out_of_range_since?: string | null
          store_id?: string | null
          tuya_active?: boolean
          tuya_device_id?: string | null
          tuya_sensor_type?: string | null
        }
        Update: {
          alert_delay_minutes?: number
          created_at?: string
          created_by?: string
          ems_sensor_code?: string | null
          equipment_type?: string
          id?: string
          last_humidity_pct?: number | null
          last_online?: boolean
          last_reading_at?: string | null
          last_temp_c?: number | null
          max_humidity_pct?: number | null
          max_temp_c?: number | null
          min_temp_c?: number | null
          name?: string
          out_of_range_since?: string | null
          store_id?: string | null
          tuya_active?: boolean
          tuya_device_id?: string | null
          tuya_sensor_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutri_equipment_ems_sensor_code_fkey"
            columns: ["ems_sensor_code"]
            isOneToOne: false
            referencedRelation: "ems_sensors"
            referencedColumns: ["unique_code"]
          },
          {
            foreignKeyName: "nutri_equipment_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_items: {
        Row: {
          category: number
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          category?: number
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          category?: number
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      nutri_maintenance_records: {
        Row: {
          created_at: string
          date: string
          equipment_type: string
          id: string
          maintenance_type: string
          note: string
          recorded_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          equipment_type: string
          id?: string
          maintenance_type: string
          note?: string
          recorded_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          equipment_type?: string
          id?: string
          maintenance_type?: string
          note?: string
          recorded_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_maintenance_records_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_maintenance_requests: {
        Row: {
          approval_instructions: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_professional_id: string | null
          created_at: string
          description: string
          equipment_type: string
          id: string
          maintenance_record_id: string | null
          photo_path: string | null
          rejection_reason: string | null
          requested_at: string
          status: string
          store_id: string
          updated_at: string
          urgency: string
          user_id: string
        }
        Insert: {
          approval_instructions?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_company_id?: string | null
          assigned_professional_id?: string | null
          created_at?: string
          description: string
          equipment_type: string
          id?: string
          maintenance_record_id?: string | null
          photo_path?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          store_id: string
          updated_at?: string
          urgency?: string
          user_id: string
        }
        Update: {
          approval_instructions?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_company_id?: string | null
          assigned_professional_id?: string | null
          created_at?: string
          description?: string
          equipment_type?: string
          id?: string
          maintenance_record_id?: string | null
          photo_path?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          store_id?: string
          updated_at?: string
          urgency?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_maintenance_requests_assigned_company_id_fkey"
            columns: ["assigned_company_id"]
            isOneToOne: false
            referencedRelation: "outsourced_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutri_maintenance_requests_assigned_professional_id_fkey"
            columns: ["assigned_professional_id"]
            isOneToOne: false
            referencedRelation: "outsourced_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutri_maintenance_requests_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "nutri_maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutri_maintenance_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_merchandise_receipts: {
        Row: {
          batch: string
          created_at: string
          date: string
          has_irregularity: boolean
          id: string
          is_return: boolean
          note: string
          product_name: string
          received_at: string
          storage_type: string
          store_id: string
          supplier: string
          temperature: number
          user_id: string
        }
        Insert: {
          batch: string
          created_at?: string
          date?: string
          has_irregularity?: boolean
          id?: string
          is_return?: boolean
          note?: string
          product_name: string
          received_at?: string
          storage_type: string
          store_id: string
          supplier: string
          temperature: number
          user_id: string
        }
        Update: {
          batch?: string
          created_at?: string
          date?: string
          has_irregularity?: boolean
          id?: string
          is_return?: boolean
          note?: string
          product_name?: string
          received_at?: string
          storage_type?: string
          store_id?: string
          supplier?: string
          temperature?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_merchandise_receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_oil_disposal_records: {
        Row: {
          amount_received: number
          collector_name: string | null
          created_at: string
          id: string
          liters: number | null
          notes: string | null
          pickup_date: string
          receipt_path: string | null
          recorded_at: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_received?: number
          collector_name?: string | null
          created_at?: string
          id?: string
          liters?: number | null
          notes?: string | null
          pickup_date?: string
          receipt_path?: string | null
          recorded_at?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_received?: number
          collector_name?: string | null
          created_at?: string
          id?: string
          liters?: number | null
          notes?: string | null
          pickup_date?: string
          receipt_path?: string | null
          recorded_at?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_oil_disposal_records_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_oil_quality_records: {
        Row: {
          changed: boolean
          created_at: string
          date: string
          id: string
          note: string
          quality: string
          recorded_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          changed?: boolean
          created_at?: string
          date?: string
          id?: string
          note?: string
          quality: string
          recorded_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          changed?: boolean
          created_at?: string
          date?: string
          id?: string
          note?: string
          quality?: string
          recorded_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_oil_quality_records_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_pest_control_records: {
        Row: {
          certificate_url: string | null
          company_name: string
          created_at: string
          id: string
          note: string
          service_date: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          certificate_url?: string | null
          company_name: string
          created_at?: string
          id?: string
          note?: string
          service_date: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          certificate_url?: string | null
          company_name?: string
          created_at?: string
          id?: string
          note?: string
          service_date?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_pest_control_records_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_pest_occurrences: {
        Row: {
          created_at: string
          date: string
          id: string
          location: string
          note: string
          pest_type: string
          recorded_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          location?: string
          note?: string
          pest_type: string
          recorded_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          location?: string
          note?: string
          pest_type?: string
          recorded_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_pest_occurrences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_temperature_alert_recipients: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          phone: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          phone: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          phone?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_temperature_alert_recipients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_temperature_alerts: {
        Row: {
          id: string
          kind: string
          last_temperature: number | null
          max_value: number | null
          measured_at: string | null
          min_value: number | null
          notes: string | null
          notified_phones: Json
          resolved_at: string | null
          sensor_code: string
          store_id: string | null
          triggered_at: string
        }
        Insert: {
          id?: string
          kind: string
          last_temperature?: number | null
          max_value?: number | null
          measured_at?: string | null
          min_value?: number | null
          notes?: string | null
          notified_phones?: Json
          resolved_at?: string | null
          sensor_code: string
          store_id?: string | null
          triggered_at?: string
        }
        Update: {
          id?: string
          kind?: string
          last_temperature?: number | null
          max_value?: number | null
          measured_at?: string | null
          min_value?: number | null
          notes?: string | null
          notified_phones?: Json
          resolved_at?: string | null
          sensor_code?: string
          store_id?: string | null
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_temperature_alerts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_temperature_readings: {
        Row: {
          created_at: string
          date: string
          equipment_id: string
          humidity: number | null
          id: string
          note: string
          recorded_at: string
          source: string
          store_id: string
          temperature: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date?: string
          equipment_id: string
          humidity?: number | null
          id?: string
          note?: string
          recorded_at?: string
          source?: string
          store_id: string
          temperature: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          equipment_id?: string
          humidity?: number | null
          id?: string
          note?: string
          recorded_at?: string
          source?: string
          store_id?: string
          temperature?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutri_temperature_readings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "nutri_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutri_temperature_readings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_visit_checklist_items: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          section: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          section?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          section?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      nutri_visit_checklist_responses: {
        Row: {
          checklist_item_id: string
          created_at: string
          id: string
          is_conform: boolean
          observation: string
          visit_report_id: string
        }
        Insert: {
          checklist_item_id: string
          created_at?: string
          id?: string
          is_conform?: boolean
          observation?: string
          visit_report_id: string
        }
        Update: {
          checklist_item_id?: string
          created_at?: string
          id?: string
          is_conform?: boolean
          observation?: string
          visit_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_visit_checklist_responses_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "nutri_visit_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutri_visit_checklist_responses_visit_report_id_fkey"
            columns: ["visit_report_id"]
            isOneToOne: false
            referencedRelation: "nutri_visit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_visit_reports: {
        Row: {
          created_at: string
          general_notes: string
          id: string
          nutritionist_rating: number | null
          signature_url: string | null
          store_id: string
          store_responsible_name: string
          user_id: string
          visit_date: string
          visitor_name: string
        }
        Insert: {
          created_at?: string
          general_notes?: string
          id?: string
          nutritionist_rating?: number | null
          signature_url?: string | null
          store_id: string
          store_responsible_name?: string
          user_id: string
          visit_date?: string
          visitor_name: string
        }
        Update: {
          created_at?: string
          general_notes?: string
          id?: string
          nutritionist_rating?: number | null
          signature_url?: string | null
          store_id?: string
          store_responsible_name?: string
          user_id?: string
          visit_date?: string
          visitor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_visit_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      nutri_water_tank_cleanings: {
        Row: {
          cleaning_date: string
          created_at: string
          id: string
          note: string
          report_url: string | null
          responsible: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cleaning_date: string
          created_at?: string
          id?: string
          note?: string
          report_url?: string | null
          responsible?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cleaning_date?: string
          created_at?: string
          id?: string
          note?: string
          report_url?: string | null
          responsible?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutri_water_tank_cleanings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_alerts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string | null
          occurrence_id: string
          order_number: string | null
          order_value: number | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          store_id: string | null
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          occurrence_id: string
          order_number?: string | null
          order_value?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          store_id?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          occurrence_id?: string
          order_number?: string | null
          order_value?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          store_id?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_alerts_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_alerts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrences: {
        Row: {
          action: string | null
          category: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          legacy_category: string | null
          message: string | null
          occurrence: string
          order_correct: boolean
          platform: string
          prevention_1: string | null
          prevention_2: string | null
          requires_subcategory: boolean
          sort_order: number
          subcategory_options: string[] | null
          updated_at: string
        }
        Insert: {
          action?: string | null
          category?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          legacy_category?: string | null
          message?: string | null
          occurrence: string
          order_correct?: boolean
          platform?: string
          prevention_1?: string | null
          prevention_2?: string | null
          requires_subcategory?: boolean
          sort_order?: number
          subcategory_options?: string[] | null
          updated_at?: string
        }
        Update: {
          action?: string | null
          category?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          legacy_category?: string | null
          message?: string | null
          occurrence?: string
          order_correct?: boolean
          platform?: string
          prevention_1?: string | null
          prevention_2?: string | null
          requires_subcategory?: boolean
          sort_order?: number
          subcategory_options?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      outsourced_companies: {
        Row: {
          address: string | null
          cnpj: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          legal_name: string | null
          monthly_value: number | null
          notes: string | null
          phone: string | null
          service_area: string | null
          status: string
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          monthly_value?: number | null
          notes?: string | null
          phone?: string | null
          service_area?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          monthly_value?: number | null
          notes?: string | null
          phone?: string | null
          service_area?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outsourced_documents: {
        Row: {
          company_id: string | null
          doc_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          professional_id: string | null
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id?: string | null
          doc_type?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          professional_id?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string | null
          doc_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          professional_id?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outsourced_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "outsourced_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourced_documents_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "outsourced_professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      outsourced_professional_stores: {
        Row: {
          assigned_at: string
          id: string
          professional_id: string
          store_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          professional_id: string
          store_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          professional_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outsourced_professional_stores_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "outsourced_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourced_professional_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      outsourced_professionals: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string
          is_nutritionist: boolean
          notes: string | null
          phone: string | null
          professional_license: string | null
          rejection_reason: string | null
          rg: string | null
          role_title: string | null
          specialty: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_nutritionist?: boolean
          notes?: string | null
          phone?: string | null
          professional_license?: string | null
          rejection_reason?: string | null
          rg?: string | null
          role_title?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_nutritionist?: boolean
          notes?: string | null
          phone?: string | null
          professional_license?: string | null
          rejection_reason?: string | null
          rg?: string | null
          role_title?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outsourced_professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "outsourced_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_kit_items: {
        Row: {
          created_at: string
          id: string
          kit_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          kit_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          kit_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "packaging_kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "packaging_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_kit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_kits: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kit_type: Database["public"]["Enums"]["packaging_kit_type"]
          name: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kit_type: Database["public"]["Enums"]["packaging_kit_type"]
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kit_type?: Database["public"]["Enums"]["packaging_kit_type"]
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_kits_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      parme_site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      payroll_advance_installments: {
        Row: {
          advance_id: string
          amount: number
          applied_at: string | null
          created_at: string
          employee_id: string
          id: string
          installment_number: number
          payroll_calculated_id: string | null
          reference_month: number
          reference_year: number
          status: Database["public"]["Enums"]["payroll_installment_status"]
          updated_at: string
        }
        Insert: {
          advance_id: string
          amount: number
          applied_at?: string | null
          created_at?: string
          employee_id: string
          id?: string
          installment_number: number
          payroll_calculated_id?: string | null
          reference_month: number
          reference_year: number
          status?: Database["public"]["Enums"]["payroll_installment_status"]
          updated_at?: string
        }
        Update: {
          advance_id?: string
          amount?: number
          applied_at?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          installment_number?: number
          payroll_calculated_id?: string | null
          reference_month?: number
          reference_year?: number
          status?: Database["public"]["Enums"]["payroll_installment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_advance_installments_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "payroll_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advance_installments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advance_installments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advance_installments_payroll_calculated_id_fkey"
            columns: ["payroll_calculated_id"]
            isOneToOne: false
            referencedRelation: "payroll_calculated"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_advances: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          installments_count: number
          start_month: number
          start_year: number
          status: Database["public"]["Enums"]["payroll_advance_status"]
          store_id: string | null
          total_amount: number
          type: Database["public"]["Enums"]["payroll_advance_type"]
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          installments_count?: number
          start_month: number
          start_year: number
          status?: Database["public"]["Enums"]["payroll_advance_status"]
          store_id?: string | null
          total_amount: number
          type: Database["public"]["Enums"]["payroll_advance_type"]
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          installments_count?: number
          start_month?: number
          start_year?: number
          status?: Database["public"]["Enums"]["payroll_advance_status"]
          store_id?: string | null
          total_amount?: number
          type?: Database["public"]["Enums"]["payroll_advance_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advances_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_advances_review: {
        Row: {
          approved_at: string
          approved_by: string | null
          id: string
          reference_month: number
          reference_year: number
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month: number
          reference_year: number
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month?: number
          reference_year?: number
        }
        Relationships: []
      }
      payroll_calculated: {
        Row: {
          absence_discount: number
          absent_days: number
          advance: number
          base_salary: number
          calculated_at: string
          calculated_by: string | null
          calculation_details: Json | null
          created_at: string
          dsr_loss_discount: number
          employee_id: string
          family_allowance: number
          fgts: number
          food_voucher: number
          health_plan: number
          id: string
          infraction_discount: number
          inss: number
          inss_leave_days: number
          inss_leave_pay: number
          inss_suspension_days: number
          irrf: number
          net_pay: number
          other_discounts: number
          other_earnings: number
          overtime_amount: number
          overtime_hours: number
          productivity: number
          proportional_salary: number
          reference_month: number
          reference_year: number
          source: string
          total_discounts: number
          total_earnings: number
          transport_discount: number
          transport_voucher: number
          updated_at: string
          worked_days: number
        }
        Insert: {
          absence_discount?: number
          absent_days?: number
          advance?: number
          base_salary?: number
          calculated_at?: string
          calculated_by?: string | null
          calculation_details?: Json | null
          created_at?: string
          dsr_loss_discount?: number
          employee_id: string
          family_allowance?: number
          fgts?: number
          food_voucher?: number
          health_plan?: number
          id?: string
          infraction_discount?: number
          inss?: number
          inss_leave_days?: number
          inss_leave_pay?: number
          inss_suspension_days?: number
          irrf?: number
          net_pay?: number
          other_discounts?: number
          other_earnings?: number
          overtime_amount?: number
          overtime_hours?: number
          productivity?: number
          proportional_salary?: number
          reference_month: number
          reference_year: number
          source?: string
          total_discounts?: number
          total_earnings?: number
          transport_discount?: number
          transport_voucher?: number
          updated_at?: string
          worked_days?: number
        }
        Update: {
          absence_discount?: number
          absent_days?: number
          advance?: number
          base_salary?: number
          calculated_at?: string
          calculated_by?: string | null
          calculation_details?: Json | null
          created_at?: string
          dsr_loss_discount?: number
          employee_id?: string
          family_allowance?: number
          fgts?: number
          food_voucher?: number
          health_plan?: number
          id?: string
          infraction_discount?: number
          inss?: number
          inss_leave_days?: number
          inss_leave_pay?: number
          inss_suspension_days?: number
          irrf?: number
          net_pay?: number
          other_discounts?: number
          other_earnings?: number
          overtime_amount?: number
          overtime_hours?: number
          productivity?: number
          proportional_salary?: number
          reference_month?: number
          reference_year?: number
          source?: string
          total_discounts?: number
          total_earnings?: number
          transport_discount?: number
          transport_voucher?: number
          updated_at?: string
          worked_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_calculated_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculated_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_change_requests: {
        Row: {
          applied_at: string | null
          change_kind: string
          employee_name: string | null
          field_label: string
          id: string
          import_id: string
          justification: string | null
          new_value: Json | null
          old_value: Json | null
          ref_month: number
          ref_year: number
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          row_id: string | null
          status: string
        }
        Insert: {
          applied_at?: string | null
          change_kind: string
          employee_name?: string | null
          field_label: string
          id?: string
          import_id: string
          justification?: string | null
          new_value?: Json | null
          old_value?: Json | null
          ref_month: number
          ref_year: number
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_id?: string | null
          status?: string
        }
        Update: {
          applied_at?: string | null
          change_kind?: string
          employee_name?: string | null
          field_label?: string
          id?: string
          import_id?: string
          justification?: string | null
          new_value?: Json | null
          old_value?: Json | null
          ref_month?: number
          ref_year?: number
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_change_requests_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "payroll_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_change_requests_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "payroll_import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_edit_locks: {
        Row: {
          acquired_at: string
          id: string
          last_heartbeat: string
          reference_month: number
          reference_year: number
          user_id: string
          user_name: string | null
        }
        Insert: {
          acquired_at?: string
          id?: string
          last_heartbeat?: string
          reference_month: number
          reference_year: number
          user_id: string
          user_name?: string | null
        }
        Update: {
          acquired_at?: string
          id?: string
          last_heartbeat?: string
          reference_month?: number
          reference_year?: number
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      payroll_holiday_worked: {
        Row: {
          compensated: boolean
          created_at: string
          created_by: string | null
          employee_id: string
          holiday_id: string
          id: string
          reference_month: number
          reference_year: number
        }
        Insert: {
          compensated?: boolean
          created_at?: string
          created_by?: string | null
          employee_id: string
          holiday_id: string
          id?: string
          reference_month: number
          reference_year: number
        }
        Update: {
          compensated?: boolean
          created_at?: string
          created_by?: string | null
          employee_id?: string
          holiday_id?: string
          id?: string
          reference_month?: number
          reference_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_holiday_worked_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_holiday_worked_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_holiday_worked_holiday_id_fkey"
            columns: ["holiday_id"]
            isOneToOne: false
            referencedRelation: "holidays"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_holiday_worked_review: {
        Row: {
          approved_at: string
          approved_by: string | null
          id: string
          reference_month: number
          reference_year: number
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month: number
          reference_year: number
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month?: number
          reference_year?: number
        }
        Relationships: []
      }
      payroll_import_rows: {
        Row: {
          accountant_notes: string | null
          admission_date: string | null
          advance_discount: number
          competence: string | null
          cpf: string | null
          created_at: string
          employee_id: string | null
          entry_status: string
          fgts_base: number
          fgts_value: number
          food_voucher_discount: number
          full_name: string | null
          health_plan_discount: number
          id: string
          import_id: string
          infraction_discount: number
          inss_discount: number
          irrf_discount: number
          month_bonus: number
          net_amount: number
          other_discounts: number
          payable_id: string | null
          position: string | null
          registration_number: string | null
          salary: number
          store_name: string | null
          total_discounts: number
          total_earnings: number
          vt_discount: number
        }
        Insert: {
          accountant_notes?: string | null
          admission_date?: string | null
          advance_discount?: number
          competence?: string | null
          cpf?: string | null
          created_at?: string
          employee_id?: string | null
          entry_status?: string
          fgts_base?: number
          fgts_value?: number
          food_voucher_discount?: number
          full_name?: string | null
          health_plan_discount?: number
          id?: string
          import_id: string
          infraction_discount?: number
          inss_discount?: number
          irrf_discount?: number
          month_bonus?: number
          net_amount?: number
          other_discounts?: number
          payable_id?: string | null
          position?: string | null
          registration_number?: string | null
          salary?: number
          store_name?: string | null
          total_discounts?: number
          total_earnings?: number
          vt_discount?: number
        }
        Update: {
          accountant_notes?: string | null
          admission_date?: string | null
          advance_discount?: number
          competence?: string | null
          cpf?: string | null
          created_at?: string
          employee_id?: string | null
          entry_status?: string
          fgts_base?: number
          fgts_value?: number
          food_voucher_discount?: number
          full_name?: string | null
          health_plan_discount?: number
          id?: string
          import_id?: string
          infraction_discount?: number
          inss_discount?: number
          irrf_discount?: number
          month_bonus?: number
          net_amount?: number
          other_discounts?: number
          payable_id?: string | null
          position?: string | null
          registration_number?: string | null
          salary?: number
          store_name?: string | null
          total_discounts?: number
          total_earnings?: number
          vt_discount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_import_rows_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_import_rows_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "payroll_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_import_rows_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_import_rubrics: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          position: number
          reference: string | null
          row_id: string
          value: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          position?: number
          reference?: string | null
          row_id: string
          value?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          position?: number
          reference?: string | null
          row_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_import_rubrics_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "payroll_import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_imports: {
        Row: {
          accounting_notes: string | null
          accounting_ok_at: string | null
          accounting_ok_by: string | null
          accounts_payable_done_at: string | null
          c6_export_done_at: string | null
          competence: string | null
          consolidated_at: string | null
          consolidated_by: string | null
          created_at: string
          exported_at: string | null
          exported_by: string | null
          file_name: string
          id: string
          ref_month: number
          ref_year: number
          sent_to_accounting_at: string | null
          sent_to_accounting_by: string | null
          signatures_sent_at: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          workflow_status: Database["public"]["Enums"]["payroll_workflow_status"]
        }
        Insert: {
          accounting_notes?: string | null
          accounting_ok_at?: string | null
          accounting_ok_by?: string | null
          accounts_payable_done_at?: string | null
          c6_export_done_at?: string | null
          competence?: string | null
          consolidated_at?: string | null
          consolidated_by?: string | null
          created_at?: string
          exported_at?: string | null
          exported_by?: string | null
          file_name: string
          id?: string
          ref_month: number
          ref_year: number
          sent_to_accounting_at?: string | null
          sent_to_accounting_by?: string | null
          signatures_sent_at?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          workflow_status?: Database["public"]["Enums"]["payroll_workflow_status"]
        }
        Update: {
          accounting_notes?: string | null
          accounting_ok_at?: string | null
          accounting_ok_by?: string | null
          accounts_payable_done_at?: string | null
          c6_export_done_at?: string | null
          competence?: string | null
          consolidated_at?: string | null
          consolidated_by?: string | null
          created_at?: string
          exported_at?: string | null
          exported_by?: string | null
          file_name?: string
          id?: string
          ref_month?: number
          ref_year?: number
          sent_to_accounting_at?: string | null
          sent_to_accounting_by?: string | null
          signatures_sent_at?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          workflow_status?: Database["public"]["Enums"]["payroll_workflow_status"]
        }
        Relationships: []
      }
      payroll_night_addition: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          reference_month: number
          reference_year: number
          source: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          reference_month: number
          reference_year: number
          source?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          reference_month?: number
          reference_year?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_night_addition_review: {
        Row: {
          approved_at: string
          approved_by: string | null
          id: string
          reference_month: number
          reference_year: number
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month: number
          reference_year: number
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month?: number
          reference_year?: number
        }
        Relationships: []
      }
      payroll_receipts: {
        Row: {
          company_stamp_at: string
          company_stamp_hash: string
          created_at: string
          employee_id: string
          id: string
          net_pay: number
          payroll_calculated_id: string | null
          reference_month: number
          reference_year: number
          sent_at: string
          sent_by: string | null
          signed_at: string | null
          signed_by_user_id: string | null
          signed_file_path: string | null
          signed_ip: string | null
          signed_user_agent: string | null
          status: string
          unsigned_file_path: string
          updated_at: string
        }
        Insert: {
          company_stamp_at?: string
          company_stamp_hash: string
          created_at?: string
          employee_id: string
          id?: string
          net_pay?: number
          payroll_calculated_id?: string | null
          reference_month: number
          reference_year: number
          sent_at?: string
          sent_by?: string | null
          signed_at?: string | null
          signed_by_user_id?: string | null
          signed_file_path?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          status?: string
          unsigned_file_path: string
          updated_at?: string
        }
        Update: {
          company_stamp_at?: string
          company_stamp_hash?: string
          created_at?: string
          employee_id?: string
          id?: string
          net_pay?: number
          payroll_calculated_id?: string | null
          reference_month?: number
          reference_year?: number
          sent_at?: string
          sent_by?: string | null
          signed_at?: string | null
          signed_by_user_id?: string | null
          signed_file_path?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          status?: string
          unsigned_file_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_receipts_payroll_calculated_id_fkey"
            columns: ["payroll_calculated_id"]
            isOneToOne: false
            referencedRelation: "payroll_calculated"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rubrics: {
        Row: {
          category: string
          cod_rubr: string
          created_at: string
          description: string
          id: string
          ide_tab_rubr: string | null
          is_active: boolean
          nat_rubr: string | null
          notes: string | null
          tp_rubr: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          cod_rubr: string
          created_at?: string
          description: string
          id?: string
          ide_tab_rubr?: string | null
          is_active?: boolean
          nat_rubr?: string | null
          notes?: string | null
          tp_rubr?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          cod_rubr?: string
          created_at?: string
          description?: string
          id?: string
          ide_tab_rubr?: string | null
          is_active?: boolean
          nat_rubr?: string | null
          notes?: string | null
          tp_rubr?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll_vt_review: {
        Row: {
          approved_at: string
          approved_by: string | null
          id: string
          reference_month: number
          reference_year: number
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month: number
          reference_year: number
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          id?: string
          reference_month?: number
          reference_year?: number
        }
        Relationships: []
      }
      payroll_xml_history: {
        Row: {
          created_at: string
          file_name: string
          id: string
          import_id: string | null
          kind: string
          notes: string | null
          ref_month: number
          ref_year: number
          uploaded_by: string | null
          uploaded_by_role: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          import_id?: string | null
          kind: string
          notes?: string | null
          ref_month: number
          ref_year: number
          uploaded_by?: string | null
          uploaded_by_role: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          import_id?: string | null
          kind?: string
          notes?: string | null
          ref_month?: number
          ref_year?: number
          uploaded_by?: string | null
          uploaded_by_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_xml_history_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "payroll_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          created_at: string
          difference: number | null
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_amount?: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_channels: {
        Row: {
          code: string
          created_at: string
          external_config: Json | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          external_config?: Json | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          external_config?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_channels_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_fiscal_invoices: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          chave_acesso: string | null
          closure_id: string | null
          contingency_attempts: number
          contingency_reason: string | null
          created_at: string
          danfe_url: string | null
          emitted_at: string | null
          environment: string
          focus_ref: string | null
          id: string
          last_contingency_at: string | null
          numero: number | null
          order_id: string
          protocolo: string | null
          provider: string
          rejection_code: string | null
          rejection_reason: string | null
          request_payload: Json | null
          response_payload: Json | null
          serie: number | null
          status: string
          store_id: string | null
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          chave_acesso?: string | null
          closure_id?: string | null
          contingency_attempts?: number
          contingency_reason?: string | null
          created_at?: string
          danfe_url?: string | null
          emitted_at?: string | null
          environment?: string
          focus_ref?: string | null
          id?: string
          last_contingency_at?: string | null
          numero?: number | null
          order_id: string
          protocolo?: string | null
          provider?: string
          rejection_code?: string | null
          rejection_reason?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          serie?: number | null
          status?: string
          store_id?: string | null
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          chave_acesso?: string | null
          closure_id?: string | null
          contingency_attempts?: number
          contingency_reason?: string | null
          created_at?: string
          danfe_url?: string | null
          emitted_at?: string | null
          environment?: string
          focus_ref?: string | null
          id?: string
          last_contingency_at?: string | null
          numero?: number | null
          order_id?: string
          protocolo?: string | null
          provider?: string
          rejection_code?: string | null
          rejection_reason?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          serie?: number | null
          status?: string
          store_id?: string | null
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_fiscal_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_fiscal_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_ifood_cancellation_log: {
        Row: {
          attempt: number
          created_at: string
          error: string | null
          external_order_id: string
          http_status: number | null
          id: string
          latency_ms: number | null
          ok: boolean
          order_id: string | null
          response_body: string | null
          source: string
          store_id: string | null
          trigger_event_code: string | null
          trigger_event_full_code: string | null
          trigger_event_id: string | null
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: string | null
          external_order_id: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          order_id?: string | null
          response_body?: string | null
          source: string
          store_id?: string | null
          trigger_event_code?: string | null
          trigger_event_full_code?: string | null
          trigger_event_id?: string | null
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: string | null
          external_order_id?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          order_id?: string | null
          response_body?: string | null
          source?: string
          store_id?: string | null
          trigger_event_code?: string | null
          trigger_event_full_code?: string | null
          trigger_event_id?: string | null
        }
        Relationships: []
      }
      pdv_ifood_failed_events: {
        Row: {
          acknowledged: boolean
          attempts: number
          created_at: string
          error: string | null
          event_code: string | null
          external_event_id: string
          id: string
          merchant_id: string | null
          order_id_external: string | null
          payload: Json
          resolved_at: string | null
          source: string
          updated_at: string
        }
        Insert: {
          acknowledged?: boolean
          attempts?: number
          created_at?: string
          error?: string | null
          event_code?: string | null
          external_event_id: string
          id?: string
          merchant_id?: string | null
          order_id_external?: string | null
          payload: Json
          resolved_at?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          acknowledged?: boolean
          attempts?: number
          created_at?: string
          error?: string | null
          event_code?: string | null
          external_event_id?: string
          id?: string
          merchant_id?: string | null
          order_id_external?: string | null
          payload?: Json
          resolved_at?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      pdv_ifood_tokens: {
        Row: {
          access_token: string
          created_at: string
          environment: string
          expires_at: string
          id: string
          refreshed_at: string
          token_type: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          environment: string
          expires_at: string
          id?: string
          refreshed_at?: string
          token_type?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          environment?: string
          expires_at?: string
          id?: string
          refreshed_at?: string
          token_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      pdv_ifood_webhook_log: {
        Row: {
          error: string | null
          event_count: number | null
          id: string
          payload: Json | null
          processed_count: number | null
          received_at: string
          signature_valid: boolean | null
        }
        Insert: {
          error?: string | null
          event_count?: number | null
          id?: string
          payload?: Json | null
          processed_count?: number | null
          received_at?: string
          signature_valid?: boolean | null
        }
        Update: {
          error?: string | null
          event_count?: number | null
          id?: string
          payload?: Json | null
          processed_count?: number | null
          received_at?: string
          signature_valid?: boolean | null
        }
        Relationships: []
      }
      pdv_ifood_widgets: {
        Row: {
          brand: string
          merchant_id: string
          store_id: string
          updated_at: string
          updated_by: string | null
          widget_id: string
        }
        Insert: {
          brand: string
          merchant_id: string
          store_id: string
          updated_at?: string
          updated_by?: string | null
          widget_id: string
        }
        Update: {
          brand?: string
          merchant_id?: string
          store_id?: string
          updated_at?: string
          updated_by?: string | null
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_ifood_widgets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_order_events: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          created_at: string
          event_code: string
          external_event_id: string | null
          id: string
          new_status: string | null
          order_id: string
          payload: Json
          previous_status: string | null
          source: string
          store_id: string
          triggered_by: string | null
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          event_code: string
          external_event_id?: string | null
          id?: string
          new_status?: string | null
          order_id: string
          payload?: Json
          previous_status?: string | null
          source?: string
          store_id: string
          triggered_by?: string | null
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          event_code?: string
          external_event_id?: string | null
          id?: string
          new_status?: string | null
          order_id?: string
          payload?: Json
          previous_status?: string | null
          source?: string
          store_id?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_order_items: {
        Row: {
          complements: Json | null
          created_at: string
          discount: number
          id: string
          menu_item_id: string | null
          name: string
          notes: string | null
          order_id: string
          quantity: number
          round_id: string | null
          total: number
          unit_price: number
        }
        Insert: {
          complements?: Json | null
          created_at?: string
          discount?: number
          id?: string
          menu_item_id?: string | null
          name: string
          notes?: string | null
          order_id: string
          quantity?: number
          round_id?: string | null
          total?: number
          unit_price?: number
        }
        Update: {
          complements?: Json | null
          created_at?: string
          discount?: number
          id?: string
          menu_item_id?: string | null
          name?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          round_id?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_order_items_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "pdv_table_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_orders: {
        Row: {
          brand_breakdown: Json | null
          cancellation_reason_code: string | null
          cancellation_reason_text: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cash_session_id: string | null
          channel_id: string
          closed_at: string | null
          closure_channel: string | null
          closure_error: string | null
          closure_id: string | null
          closure_status: string | null
          concluded_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_document: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: Json | null
          delivery_by: string | null
          delivery_code: string | null
          delivery_fee: number
          delivery_job_id: string | null
          delivery_provider: string | null
          delivery_tracking_url: string | null
          discount: number
          dispatched_at: string | null
          dre_excluded: boolean
          expected_delivery_at: string | null
          external_display_id: string | null
          external_order_id: string | null
          has_unread_chat: boolean
          id: string
          last_synced_at: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          notes: string | null
          opened_at: string
          order_number: string | null
          order_type: string
          packed_at: string | null
          pickup_code: string | null
          pickup_eta: string | null
          preparation_started_at: string | null
          ready_at: string | null
          source: string | null
          source_payload: Json | null
          status: string
          stock_consumed_at: string | null
          stock_consumed_by: string | null
          store_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          brand_breakdown?: Json | null
          cancellation_reason_code?: string | null
          cancellation_reason_text?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_session_id?: string | null
          channel_id: string
          closed_at?: string | null
          closure_channel?: string | null
          closure_error?: string | null
          closure_id?: string | null
          closure_status?: string | null
          concluded_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_document?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_by?: string | null
          delivery_code?: string | null
          delivery_fee?: number
          delivery_job_id?: string | null
          delivery_provider?: string | null
          delivery_tracking_url?: string | null
          discount?: number
          dispatched_at?: string | null
          dre_excluded?: boolean
          expected_delivery_at?: string | null
          external_display_id?: string | null
          external_order_id?: string | null
          has_unread_chat?: boolean
          id?: string
          last_synced_at?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          opened_at?: string
          order_number?: string | null
          order_type?: string
          packed_at?: string | null
          pickup_code?: string | null
          pickup_eta?: string | null
          preparation_started_at?: string | null
          ready_at?: string | null
          source?: string | null
          source_payload?: Json | null
          status?: string
          stock_consumed_at?: string | null
          stock_consumed_by?: string | null
          store_id: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          brand_breakdown?: Json | null
          cancellation_reason_code?: string | null
          cancellation_reason_text?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_session_id?: string | null
          channel_id?: string
          closed_at?: string | null
          closure_channel?: string | null
          closure_error?: string | null
          closure_id?: string | null
          closure_status?: string | null
          concluded_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_document?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_by?: string | null
          delivery_code?: string | null
          delivery_fee?: number
          delivery_job_id?: string | null
          delivery_provider?: string | null
          delivery_tracking_url?: string | null
          discount?: number
          dispatched_at?: string | null
          dre_excluded?: boolean
          expected_delivery_at?: string | null
          external_display_id?: string | null
          external_order_id?: string | null
          has_unread_chat?: boolean
          id?: string
          last_synced_at?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          opened_at?: string
          order_number?: string | null
          order_type?: string
          packed_at?: string | null
          pickup_code?: string | null
          pickup_eta?: string | null
          preparation_started_at?: string | null
          ready_at?: string | null
          source?: string | null
          source_payload?: Json | null
          status?: string
          stock_consumed_at?: string | null
          stock_consumed_by?: string | null
          store_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_orders_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "pdv_cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "pdv_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_delivery_job_id_fkey"
            columns: ["delivery_job_id"]
            isOneToOne: false
            referencedRelation: "delivery_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_payments: {
        Row: {
          amount: number
          authorization_code: string | null
          change_amount: number
          closure_id: string | null
          created_at: string
          external_payment_id: string | null
          id: string
          method: string
          order_id: string
          paid_at: string
        }
        Insert: {
          amount: number
          authorization_code?: string | null
          change_amount?: number
          closure_id?: string | null
          created_at?: string
          external_payment_id?: string | null
          id?: string
          method: string
          order_id: string
          paid_at?: string
        }
        Update: {
          amount?: number
          authorization_code?: string | null
          change_amount?: number
          closure_id?: string | null
          created_at?: string
          external_payment_id?: string | null
          id?: string
          method?: string
          order_id?: string
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_printers: {
        Row: {
          connection_type: string
          created_at: string
          host: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          port: number | null
          print_role: string
          printer_model: string
          store_id: string
          updated_at: string
          usb_device_name: string | null
        }
        Insert: {
          connection_type: string
          created_at?: string
          host?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          port?: number | null
          print_role?: string
          printer_model?: string
          store_id: string
          updated_at?: string
          usb_device_name?: string | null
        }
        Update: {
          connection_type?: string
          created_at?: string
          host?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          port?: number | null
          print_role?: string
          printer_model?: string
          store_id?: string
          updated_at?: string
          usb_device_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_printers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_receipt_templates: {
        Row: {
          created_at: string
          cut_feed_mm: number
          cut_paper: boolean
          font_size: string
          footer_html: string
          header_html: string
          id: string
          is_active: boolean
          item_template: string
          paper_width_mm: number
          price_col_pct: number
          qty_col_pct: number
          show_address: boolean
          show_logo: boolean
          show_qr: boolean
          store_id: string
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cut_feed_mm?: number
          cut_paper?: boolean
          font_size?: string
          footer_html?: string
          header_html?: string
          id?: string
          is_active?: boolean
          item_template?: string
          paper_width_mm?: number
          price_col_pct?: number
          qty_col_pct?: number
          show_address?: boolean
          show_logo?: boolean
          show_qr?: boolean
          store_id: string
          template_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cut_feed_mm?: number
          cut_paper?: boolean
          font_size?: string
          footer_html?: string
          header_html?: string
          id?: string
          is_active?: boolean
          item_template?: string
          paper_width_mm?: number
          price_col_pct?: number
          qty_col_pct?: number
          show_address?: boolean
          show_logo?: boolean
          show_qr?: boolean
          store_id?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_receipt_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_stock_consumption_log: {
        Row: {
          created_at: string
          id: string
          item_name: string | null
          message: string | null
          order_id: string | null
          order_item_id: string | null
          quantity: number | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name?: string | null
          message?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity?: number | null
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string | null
          message?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_stock_consumption_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_table_rounds: {
        Row: {
          delivered_at: string | null
          id: string
          notes: string | null
          ready_at: string | null
          round_number: number
          sent_at: string
          session_id: string
          status: string
        }
        Insert: {
          delivered_at?: string | null
          id?: string
          notes?: string | null
          ready_at?: string | null
          round_number: number
          sent_at?: string
          session_id: string
          status?: string
        }
        Update: {
          delivered_at?: string | null
          id?: string
          notes?: string | null
          ready_at?: string | null
          round_number?: number
          sent_at?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_table_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pdv_table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_table_sessions: {
        Row: {
          closed_at: string | null
          created_at: string
          guests: number
          id: string
          notes: string | null
          opened_at: string
          order_id: string | null
          status: string
          store_id: string
          table_id: string
          updated_at: string
          waiter_id: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          guests?: number
          id?: string
          notes?: string | null
          opened_at?: string
          order_id?: string | null
          status?: string
          store_id: string
          table_id: string
          updated_at?: string
          waiter_id?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          guests?: number
          id?: string
          notes?: string | null
          opened_at?: string
          order_id?: string | null
          status?: string
          store_id?: string
          table_id?: string
          updated_at?: string
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_table_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_table_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "pdv_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_tables: {
        Row: {
          area: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          number: number
          seats: number
          store_id: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          number: number
          seats?: number
          store_id: string
        }
        Update: {
          area?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          number?: number
          seats?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_tables_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_tef_config: {
        Row: {
          acquirer: string | null
          agent_url: string
          created_at: string
          environment: string
          id: string
          is_active: boolean
          merchant_code: string | null
          notes: string | null
          provider: string
          store_id: string
          terminal_code: string | null
          updated_at: string
        }
        Insert: {
          acquirer?: string | null
          agent_url?: string
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          merchant_code?: string | null
          notes?: string | null
          provider?: string
          store_id: string
          terminal_code?: string | null
          updated_at?: string
        }
        Update: {
          acquirer?: string | null
          agent_url?: string
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          merchant_code?: string | null
          notes?: string | null
          provider?: string
          store_id?: string
          terminal_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_tef_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_tef_homologation_runs: {
        Row: {
          acquirer: string | null
          created_at: string
          finished_at: string | null
          host_url: string | null
          id: string
          integration_type: string
          lib_version: string | null
          notes: string | null
          operator_id: string | null
          pdc_code: string | null
          started_at: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          acquirer?: string | null
          created_at?: string
          finished_at?: string | null
          host_url?: string | null
          id?: string
          integration_type?: string
          lib_version?: string | null
          notes?: string | null
          operator_id?: string | null
          pdc_code?: string | null
          started_at?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          acquirer?: string | null
          created_at?: string
          finished_at?: string | null
          host_url?: string | null
          id?: string
          integration_type?: string
          lib_version?: string | null
          notes?: string | null
          operator_id?: string | null
          pdc_code?: string | null
          started_at?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_tef_homologation_runs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_tef_homologation_steps: {
        Row: {
          amount: number | null
          authorization_code: string | null
          card_brand: string | null
          created_at: string
          executed_at: string | null
          id: string
          mandatory: boolean
          nsu: string | null
          observations: string | null
          raw_response: Json | null
          requnum: string | null
          run_id: string
          status: string
          step_name: string
          step_number: number
          updated_at: string
        }
        Insert: {
          amount?: number | null
          authorization_code?: string | null
          card_brand?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          mandatory?: boolean
          nsu?: string | null
          observations?: string | null
          raw_response?: Json | null
          requnum?: string | null
          run_id: string
          status?: string
          step_name: string
          step_number: number
          updated_at?: string
        }
        Update: {
          amount?: number | null
          authorization_code?: string | null
          card_brand?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          mandatory?: boolean
          nsu?: string | null
          observations?: string | null
          raw_response?: Json | null
          requnum?: string | null
          run_id?: string
          status?: string
          step_name?: string
          step_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_tef_homologation_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pdv_tef_homologation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_tef_transactions: {
        Row: {
          acquirer: string | null
          amount: number
          authorization_code: string | null
          cancelled_at: string | null
          card_brand: string | null
          card_last4: string | null
          closure_id: string | null
          confirmed_at: string | null
          created_at: string
          customer_receipt: string | null
          error_code: string | null
          events: Json
          finished_at: string | null
          id: string
          installments: number | null
          merchant_receipt: string | null
          message: string | null
          nsu: string | null
          order_id: string | null
          paygo_reqnum: string | null
          payment_method: string | null
          provider: string
          raw_response: Json | null
          sale_id: string | null
          started_at: string
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          acquirer?: string | null
          amount: number
          authorization_code?: string | null
          cancelled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          closure_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_receipt?: string | null
          error_code?: string | null
          events?: Json
          finished_at?: string | null
          id?: string
          installments?: number | null
          merchant_receipt?: string | null
          message?: string | null
          nsu?: string | null
          order_id?: string | null
          paygo_reqnum?: string | null
          payment_method?: string | null
          provider: string
          raw_response?: Json | null
          sale_id?: string | null
          started_at?: string
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          acquirer?: string | null
          amount?: number
          authorization_code?: string | null
          cancelled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          closure_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_receipt?: string | null
          error_code?: string | null
          events?: Json
          finished_at?: string | null
          id?: string
          installments?: number | null
          merchant_receipt?: string | null
          message?: string | null
          nsu?: string | null
          order_id?: string | null
          paygo_reqnum?: string | null
          payment_method?: string | null
          provider?: string
          raw_response?: Json | null
          sale_id?: string | null
          started_at?: string
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_tef_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_tef_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_whatsapp_carts: {
        Row: {
          created_at: string
          customer_name: string | null
          delivery_address: Json | null
          expires_at: string
          id: string
          items: Json
          payment_method: string | null
          pdv_order_id: string | null
          phone: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          delivery_address?: Json | null
          expires_at?: string
          id?: string
          items?: Json
          payment_method?: string | null
          pdv_order_id?: string | null
          phone: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          delivery_address?: Json | null
          expires_at?: string
          id?: string
          items?: Json
          payment_method?: string | null
          pdv_order_id?: string | null
          phone?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_whatsapp_carts_pdv_order_id_fkey"
            columns: ["pdv_order_id"]
            isOneToOne: false
            referencedRelation: "pdv_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_whatsapp_carts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_accounts: {
        Row: {
          balance: number
          created_at: string
          id: string
          is_active: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          is_active?: boolean
          store_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          is_active?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_movements: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          movement_type: string
          occurred_at: string
          receipt_number: string | null
          receipt_url: string | null
          source: string | null
          store_id: string
          supplier_name: string | null
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          movement_type: string
          occurred_at?: string
          receipt_number?: string | null
          receipt_url?: string | null
          source?: string | null
          store_id: string
          supplier_name?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          movement_type?: string
          occurred_at?: string
          receipt_number?: string | null
          receipt_url?: string | null
          source?: string | null
          store_id?: string
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "petty_cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      position_bonuses: {
        Row: {
          bonus_amount: number
          created_at: string
          id: string
          notes: string | null
          position: string
          position_id: string
          updated_at: string
        }
        Insert: {
          bonus_amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          position: string
          position_id: string
          updated_at?: string
        }
        Update: {
          bonus_amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          position?: string
          position_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_bonuses_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_responsibilities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          position: string
          responsibility: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          position: string
          responsibility: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          position?: string
          responsibility?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      position_term_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          employee_id: string | null
          id: string
          ip_address: string | null
          term_key: string
          term_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          term_key: string
          term_version?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          term_key?: string
          term_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_term_acceptances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_term_acceptances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          cbo_code: string | null
          cbo_title: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          pcmso_periodicity_months: number
          pcmso_requires_psychosocial: boolean
          sort_order: number
          time_clock_payroll: boolean
          time_clock_required: boolean
          updated_at: string
        }
        Insert: {
          cbo_code?: string | null
          cbo_title?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pcmso_periodicity_months?: number
          pcmso_requires_psychosocial?: boolean
          sort_order?: number
          time_clock_payroll?: boolean
          time_clock_required?: boolean
          updated_at?: string
        }
        Update: {
          cbo_code?: string | null
          cbo_title?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pcmso_periodicity_months?: number
          pcmso_requires_psychosocial?: boolean
          sort_order?: number
          time_clock_payroll?: boolean
          time_clock_required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_cbo_code_fkey"
            columns: ["cbo_code"]
            isOneToOne: false
            referencedRelation: "cbo_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      product_conversions: {
        Row: {
          conversion_type: string
          created_at: string
          from_qty: number
          from_unit: string
          id: string
          is_default: boolean
          notes: string | null
          product_id: string
          to_qty: number
          to_unit: string
          updated_at: string
        }
        Insert: {
          conversion_type: string
          created_at?: string
          from_qty: number
          from_unit: string
          id?: string
          is_default?: boolean
          notes?: string | null
          product_id: string
          to_qty: number
          to_unit: string
          updated_at?: string
        }
        Update: {
          conversion_type?: string
          created_at?: string
          from_qty?: number
          from_unit?: string
          id?: string
          is_default?: boolean
          notes?: string | null
          product_id?: string
          to_qty?: number
          to_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_store_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_store_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_store_links_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      production_runs: {
        Row: {
          divergence_reason: string | null
          id: string
          multiplier: number
          notes: string | null
          portion_id: string | null
          produced_at: string
          produced_by: string | null
          produced_quantity: number
          recipe_id: string
          requested_quantity: number | null
          store_id: string
          total_cost: number
          unit_cost: number
        }
        Insert: {
          divergence_reason?: string | null
          id?: string
          multiplier?: number
          notes?: string | null
          portion_id?: string | null
          produced_at?: string
          produced_by?: string | null
          produced_quantity: number
          recipe_id: string
          requested_quantity?: number | null
          store_id: string
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          divergence_reason?: string | null
          id?: string
          multiplier?: number
          notes?: string | null
          portion_id?: string | null
          produced_at?: string
          produced_by?: string | null
          produced_quantity?: number
          recipe_id?: string
          requested_quantity?: number | null
          store_id?: string
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_runs_portion_id_fkey"
            columns: ["portion_id"]
            isOneToOne: false
            referencedRelation: "recipe_portions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          cut_reason: string | null
          description: string
          fulfilled_quantity: number | null
          id: string
          ordered_quantity: number
          pack_description: string | null
          purchase_order_id: string
          quotation_item_id: string | null
          status: string
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cut_reason?: string | null
          description: string
          fulfilled_quantity?: number | null
          id?: string
          ordered_quantity: number
          pack_description?: string | null
          purchase_order_id: string
          quotation_item_id?: string | null
          status?: string
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cut_reason?: string | null
          description?: string
          fulfilled_quantity?: number | null
          id?: string
          ordered_quantity?: number
          pack_description?: string | null
          purchase_order_id?: string
          quotation_item_id?: string | null
          status?: string
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          quotation_id: string | null
          sent_at: string | null
          status: string
          store_id: string | null
          supplier_id: string
          supplier_notes: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quotation_id?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string | null
          supplier_id: string
          supplier_notes?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quotation_id?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string | null
          supplier_id?: string
          supplier_notes?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quotation_awards: {
        Row: {
          bid_item_id: string | null
          created_at: string
          final_quantity: number | null
          id: string
          is_vetoed: boolean
          notes: string | null
          quotation_id: string
          quotation_item_id: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          bid_item_id?: string | null
          created_at?: string
          final_quantity?: number | null
          id?: string
          is_vetoed?: boolean
          notes?: string | null
          quotation_id: string
          quotation_item_id: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          bid_item_id?: string | null
          created_at?: string
          final_quantity?: number | null
          id?: string
          is_vetoed?: boolean
          notes?: string | null
          quotation_id?: string
          quotation_item_id?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_awards_bid_item_id_fkey"
            columns: ["bid_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_bid_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_awards_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_awards_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: true
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_awards_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_bid_items: {
        Row: {
          available_quantity: number | null
          bid_id: string
          created_at: string
          expiry_date: string | null
          id: string
          is_fifo: boolean
          min_order_packs: number | null
          notes: string | null
          offered_brand: string | null
          pack_content_qty: number | null
          pack_content_unit: string | null
          pack_description: string | null
          pack_price: number | null
          price_per_base_unit: number | null
          quotation_item_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          available_quantity?: number | null
          bid_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_fifo?: boolean
          min_order_packs?: number | null
          notes?: string | null
          offered_brand?: string | null
          pack_content_qty?: number | null
          pack_content_unit?: string | null
          pack_description?: string | null
          pack_price?: number | null
          price_per_base_unit?: number | null
          quotation_item_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          available_quantity?: number | null
          bid_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_fifo?: boolean
          min_order_packs?: number | null
          notes?: string | null
          offered_brand?: string | null
          pack_content_qty?: number | null
          pack_content_unit?: string | null
          pack_description?: string | null
          pack_price?: number | null
          price_per_base_unit?: number | null
          quotation_item_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_bid_items_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "quotation_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_bid_items_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_bids: {
        Row: {
          created_at: string
          delivery_days: number | null
          id: string
          notes: string | null
          payment_terms: string | null
          quotation_id: string
          status: string
          submitted_at: string
          supplier_id: string
          total_amount: number | null
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          created_at?: string
          delivery_days?: number | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          quotation_id: string
          status?: string
          submitted_at?: string
          supplier_id: string
          total_amount?: number | null
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          created_at?: string
          delivery_days?: number | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          quotation_id?: string
          status?: string
          submitted_at?: string
          supplier_id?: string
          total_amount?: number | null
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_bids_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_bids_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_item_approved_brands: {
        Row: {
          brand_name: string
          created_at: string
          id: string
          is_preferred: boolean
          notes: string | null
          quotation_item_id: string
        }
        Insert: {
          brand_name: string
          created_at?: string
          id?: string
          is_preferred?: boolean
          notes?: string | null
          quotation_item_id: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          id?: string
          is_preferred?: boolean
          notes?: string | null
          quotation_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_item_approved_brands_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          base_unit: string | null
          created_at: string
          description: string
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          quotation_id: string
          sort_order: number
          unit: string
        }
        Insert: {
          base_unit?: string | null
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity: number
          quotation_id: string
          sort_order?: number
          unit?: string
        }
        Update: {
          base_unit?: string | null
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quotation_id?: string
          sort_order?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          awarded_supplier_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          deadline: string
          description: string | null
          id: string
          notes: string | null
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          awarded_supplier_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline: string
          description?: string | null
          id?: string
          notes?: string | null
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          awarded_supplier_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string
          description?: string | null
          id?: string
          notes?: string | null
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_awarded_supplier_id_fkey"
            columns: ["awarded_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_books: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          ingredients: string | null
          photo_path: string | null
          prep_time_minutes: number | null
          preparation_method: string | null
          scope: string
          source_recipe_name: string | null
          title: string
          updated_at: string
          yield_text: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ingredients?: string | null
          photo_path?: string | null
          prep_time_minutes?: number | null
          preparation_method?: string | null
          scope?: string
          source_recipe_name?: string | null
          title: string
          updated_at?: string
          yield_text?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ingredients?: string | null
          photo_path?: string | null
          prep_time_minutes?: number | null
          preparation_method?: string | null
          scope?: string
          source_recipe_name?: string | null
          title?: string
          updated_at?: string
          yield_text?: string | null
        }
        Relationships: []
      }
      recipe_brands: {
        Row: {
          brand_id: string
          created_at: string
          recipe_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          recipe_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_brands_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_complement_groups: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          name: string
          recipe_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          name: string
          recipe_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          name?: string
          recipe_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_complement_groups_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_complements: {
        Row: {
          created_at: string
          group_id: string
          id: string
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_complements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "recipe_complement_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_state: string | null
          is_packaging: boolean
          notes: string | null
          product_id: string
          quantity: number
          recipe_id: string
          sort_order: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_state?: string | null
          is_packaging?: boolean
          notes?: string | null
          product_id: string
          quantity: number
          recipe_id: string
          sort_order?: number
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_state?: string | null
          is_packaging?: boolean
          notes?: string | null
          product_id?: string
          quantity?: number
          recipe_id?: string
          sort_order?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_portion_overrides: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          portion_id: string
          quantity: number
          recipe_ingredient_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          portion_id: string
          quantity: number
          recipe_ingredient_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          portion_id?: string
          quantity?: number
          recipe_ingredient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_portion_overrides_portion_id_fkey"
            columns: ["portion_id"]
            isOneToOne: false
            referencedRelation: "recipe_portions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_portion_overrides_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_portions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          multiplier: number
          name: string
          output_product_id: string | null
          packaging_kit_id: string | null
          recipe_id: string
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          multiplier?: number
          name: string
          output_product_id?: string | null
          packaging_kit_id?: string | null
          recipe_id: string
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          multiplier?: number
          name?: string
          output_product_id?: string | null
          packaging_kit_id?: string | null
          recipe_id?: string
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_portions_output_product_id_fkey"
            columns: ["output_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_portions_packaging_kit_id_fkey"
            columns: ["packaging_kit_id"]
            isOneToOne: false
            referencedRelation: "packaging_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_portions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          allergens: string[]
          book_ingredients: Json | null
          category: string | null
          cest: string | null
          cfop: string | null
          created_at: string
          created_by: string | null
          csosn: string | null
          cst: string | null
          description: string | null
          ean: string | null
          has_portions: boolean
          icms_aliquota: number | null
          id: string
          is_active: boolean
          name: string
          ncm: string | null
          notes: string | null
          nutrition_info: Json | null
          origem_mercadoria: number | null
          output_product_id: string | null
          photo_path: string | null
          prep_time_minutes: number | null
          scope: string
          shelf_life_days: number | null
          shelf_life_hours: number | null
          unidade_comercial: string | null
          updated_at: string
          yield_quantity: number
          yield_unit: string
        }
        Insert: {
          allergens?: string[]
          book_ingredients?: Json | null
          category?: string | null
          cest?: string | null
          cfop?: string | null
          created_at?: string
          created_by?: string | null
          csosn?: string | null
          cst?: string | null
          description?: string | null
          ean?: string | null
          has_portions?: boolean
          icms_aliquota?: number | null
          id?: string
          is_active?: boolean
          name: string
          ncm?: string | null
          notes?: string | null
          nutrition_info?: Json | null
          origem_mercadoria?: number | null
          output_product_id?: string | null
          photo_path?: string | null
          prep_time_minutes?: number | null
          scope?: string
          shelf_life_days?: number | null
          shelf_life_hours?: number | null
          unidade_comercial?: string | null
          updated_at?: string
          yield_quantity?: number
          yield_unit?: string
        }
        Update: {
          allergens?: string[]
          book_ingredients?: Json | null
          category?: string | null
          cest?: string | null
          cfop?: string | null
          created_at?: string
          created_by?: string | null
          csosn?: string | null
          cst?: string | null
          description?: string | null
          ean?: string | null
          has_portions?: boolean
          icms_aliquota?: number | null
          id?: string
          is_active?: boolean
          name?: string
          ncm?: string | null
          notes?: string | null
          nutrition_info?: Json | null
          origem_mercadoria?: number | null
          output_product_id?: string | null
          photo_path?: string | null
          prep_time_minutes?: number | null
          scope?: string
          shelf_life_days?: number | null
          shelf_life_hours?: number | null
          unidade_comercial?: string | null
          updated_at?: string
          yield_quantity?: number
          yield_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_output_product_id_fkey"
            columns: ["output_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      remote_access_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          machine_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          machine_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          machine_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remote_access_audit_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "remote_access_machines"
            referencedColumns: ["id"]
          },
        ]
      }
      remote_access_machines: {
        Row: {
          created_at: string
          created_by: string | null
          hostname: string | null
          id: string
          label: string
          last_seen_at: string | null
          machine_type: string
          notes: string | null
          password: string | null
          remote_id: string
          store_id: string | null
          tool: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hostname?: string | null
          id?: string
          label: string
          last_seen_at?: string | null
          machine_type?: string
          notes?: string | null
          password?: string | null
          remote_id: string
          store_id?: string | null
          tool?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hostname?: string | null
          id?: string
          label?: string
          last_seen_at?: string | null
          machine_type?: string
          notes?: string | null
          password?: string | null
          remote_id?: string
          store_id?: string | null
          tool?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remote_access_machines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          party_size: number
          phone: string
          reservation_date: string
          reservation_time: string
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          party_size: number
          phone: string
          reservation_date: string
          reservation_time: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          party_size?: number
          phone?: string
          reservation_date?: string
          reservation_time?: string
          status?: string
        }
        Relationships: []
      }
      shift_swap_requests: {
        Row: {
          created_at: string
          id: string
          manager_decided_at: string | null
          manager_decided_by: string | null
          partner_date: string | null
          partner_employee_id: string
          partner_responded_at: string | null
          partner_response_note: string | null
          partner_user_id: string | null
          reason: string | null
          rejection_reason: string | null
          requester_date: string
          requester_employee_id: string
          requester_user_id: string
          status: Database["public"]["Enums"]["shift_swap_status"]
          store_id: string
          swap_type: Database["public"]["Enums"]["shift_swap_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          partner_date?: string | null
          partner_employee_id: string
          partner_responded_at?: string | null
          partner_response_note?: string | null
          partner_user_id?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requester_date: string
          requester_employee_id: string
          requester_user_id: string
          status?: Database["public"]["Enums"]["shift_swap_status"]
          store_id: string
          swap_type?: Database["public"]["Enums"]["shift_swap_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          partner_date?: string | null
          partner_employee_id?: string
          partner_responded_at?: string | null
          partner_response_note?: string | null
          partner_user_id?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requester_date?: string
          requester_employee_id?: string
          requester_user_id?: string
          status?: Database["public"]["Enums"]["shift_swap_status"]
          store_id?: string
          swap_type?: Database["public"]["Enums"]["shift_swap_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_partner_employee_id_fkey"
            columns: ["partner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_partner_employee_id_fkey"
            columns: ["partner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_requester_employee_id_fkey"
            columns: ["requester_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_requester_employee_id_fkey"
            columns: ["requester_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          app_name: string
          background_color: string
          card_color: string
          id: string
          logo_url: string | null
          primary_color: string
          secondary_color: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          app_name?: string
          background_color?: string
          card_color?: string
          id?: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          app_name?: string
          background_color?: string
          card_color?: string
          id?: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      storage_group_rules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          keyword: string
          priority: number
          storage_group: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          keyword: string
          priority?: number
          storage_group: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          keyword?: string
          priority?: number
          storage_group?: string
        }
        Relationships: []
      }
      store_brand_google: {
        Row: {
          avg_rating: number | null
          brand_id: string
          created_at: string
          id: string
          place_id: string | null
          store_id: string
          synced_at: string | null
          total_ratings: number | null
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          brand_id: string
          created_at?: string
          id?: string
          place_id?: string | null
          store_id: string
          synced_at?: string | null
          total_ratings?: number | null
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          brand_id?: string
          created_at?: string
          id?: string
          place_id?: string | null
          store_id?: string
          synced_at?: string | null
          total_ratings?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_brand_google_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_brand_google_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_fiscal_credentials: {
        Row: {
          created_at: string
          nfce_csc_id_homolog: string | null
          nfce_csc_id_prod: string | null
          nfce_csc_token_homolog: string | null
          nfce_csc_token_prod: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          nfce_csc_id_homolog?: string | null
          nfce_csc_id_prod?: string | null
          nfce_csc_token_homolog?: string | null
          nfce_csc_token_prod?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          nfce_csc_id_homolog?: string | null
          nfce_csc_id_prod?: string | null
          nfce_csc_token_homolog?: string | null
          nfce_csc_token_prod?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_fiscal_credentials_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_terminal_users: {
        Row: {
          created_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_terminal_users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          brand: string | null
          brand_id: string | null
          city: string | null
          cnpj: string | null
          code: string | null
          created_at: string
          geofence_radius_m: number
          google_place_id: string | null
          id: string
          ifood_auto_accept: boolean
          ifood_environment: string
          ifood_merchant_id: string | null
          ifood_merchant_uuid: string | null
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          is_active: boolean
          is_virtual: boolean
          latitude: number | null
          legal_name: string | null
          longitude: number | null
          manager_name: string | null
          name: string
          neighborhood: string | null
          nfce_environment: string | null
          nfce_next_number: number | null
          nfce_serie: number | null
          number: string | null
          parent_store_id: string | null
          pdv_print_layout: Json
          pdv_sla_minutes: number
          phone: string | null
          regime_tributario: number | null
          state: string | null
          store_type: Database["public"]["Enums"]["store_type"]
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          brand?: string | null
          brand_id?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          created_at?: string
          geofence_radius_m?: number
          google_place_id?: string | null
          id?: string
          ifood_auto_accept?: boolean
          ifood_environment?: string
          ifood_merchant_id?: string | null
          ifood_merchant_uuid?: string | null
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          is_active?: boolean
          is_virtual?: boolean
          latitude?: number | null
          legal_name?: string | null
          longitude?: number | null
          manager_name?: string | null
          name: string
          neighborhood?: string | null
          nfce_environment?: string | null
          nfce_next_number?: number | null
          nfce_serie?: number | null
          number?: string | null
          parent_store_id?: string | null
          pdv_print_layout?: Json
          pdv_sla_minutes?: number
          phone?: string | null
          regime_tributario?: number | null
          state?: string | null
          store_type?: Database["public"]["Enums"]["store_type"]
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          brand?: string | null
          brand_id?: string | null
          city?: string | null
          cnpj?: string | null
          code?: string | null
          created_at?: string
          geofence_radius_m?: number
          google_place_id?: string | null
          id?: string
          ifood_auto_accept?: boolean
          ifood_environment?: string
          ifood_merchant_id?: string | null
          ifood_merchant_uuid?: string | null
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          is_active?: boolean
          is_virtual?: boolean
          latitude?: number | null
          legal_name?: string | null
          longitude?: number | null
          manager_name?: string | null
          name?: string
          neighborhood?: string | null
          nfce_environment?: string | null
          nfce_next_number?: number | null
          nfce_serie?: number | null
          number?: string | null
          parent_store_id?: string | null
          pdv_print_layout?: Json
          pdv_sla_minutes?: number
          phone?: string | null
          regime_tributario?: number | null
          state?: string | null
          store_type?: Database["public"]["Enums"]["store_type"]
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_parent_store_id_fkey"
            columns: ["parent_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_approved_categories: {
        Row: {
          approved_at: string
          approved_by: string | null
          category_id: string
          id: string
          supplier_id: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          category_id: string
          id?: string
          supplier_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          category_id?: string
          id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_approved_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_approved_categories_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      supplier_offers: {
        Row: {
          available_quantity: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          offer_type: Database["public"]["Enums"]["supplier_offer_type"]
          price: number | null
          supplier_id: string
          title: string
          unit: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          available_quantity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          offer_type?: Database["public"]["Enums"]["supplier_offer_type"]
          price?: number | null
          supplier_id: string
          title: string
          unit?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          available_quantity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          offer_type?: Database["public"]["Enums"]["supplier_offer_type"]
          price?: number | null
          supplier_id?: string
          title?: string
          unit?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_offers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cnpj: string
          contact_name: string | null
          created_at: string
          email: string
          id: string
          legal_name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          rejection_reason: string | null
          status: string
          trade_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cnpj: string
          contact_name?: string | null
          created_at?: string
          email: string
          id?: string
          legal_name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rejection_reason?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cnpj?: string
          contact_name?: string | null
          created_at?: string
          email?: string
          id?: string
          legal_name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rejection_reason?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          contact: string
          created_at: string
          description: string
          id: string
          order_number: string | null
          status: string
          title: string | null
        }
        Insert: {
          contact: string
          created_at?: string
          description: string
          id?: string
          order_number?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          contact?: string
          created_at?: string
          description?: string
          id?: string
          order_number?: string | null
          status?: string
          title?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      template_access_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          template_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_access_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_access_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_settings: {
        Row: {
          accent_hsl: string | null
          background_hsl: string | null
          font_family: string | null
          font_scale: number | null
          id: string
          logo_url: string | null
          mode: string | null
          primary_hsl: string | null
          radius: string | null
          scope: string
          sidebar_bg_hsl: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_hsl?: string | null
          background_hsl?: string | null
          font_family?: string | null
          font_scale?: number | null
          id?: string
          logo_url?: string | null
          mode?: string | null
          primary_hsl?: string | null
          radius?: string | null
          scope?: string
          sidebar_bg_hsl?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_hsl?: string | null
          background_hsl?: string | null
          font_family?: string | null
          font_scale?: number | null
          id?: string
          logo_url?: string | null
          mode?: string | null
          primary_hsl?: string | null
          radius?: string | null
          scope?: string
          sidebar_bg_hsl?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      time_clock_entries: {
        Row: {
          accuracy_m: number | null
          created_at: string
          created_by: string | null
          distance_from_store_m: number | null
          employee_id: string
          entry_at: string
          entry_type: Database["public"]["Enums"]["time_clock_entry_type"]
          id: string
          is_manual: boolean
          is_outside_geofence: boolean
          latitude: number | null
          longitude: number | null
          match_score: number | null
          notes: string | null
          photo_path: string | null
          reference_date: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          created_by?: string | null
          distance_from_store_m?: number | null
          employee_id: string
          entry_at?: string
          entry_type: Database["public"]["Enums"]["time_clock_entry_type"]
          id?: string
          is_manual?: boolean
          is_outside_geofence?: boolean
          latitude?: number | null
          longitude?: number | null
          match_score?: number | null
          notes?: string | null
          photo_path?: string | null
          reference_date?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          created_by?: string | null
          distance_from_store_m?: number | null
          employee_id?: string
          entry_at?: string
          entry_type?: Database["public"]["Enums"]["time_clock_entry_type"]
          id?: string
          is_manual?: boolean
          is_outside_geofence?: boolean
          latitude?: number | null
          longitude?: number | null
          match_score?: number | null
          notes?: string | null
          photo_path?: string | null
          reference_date?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_justifications: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string
          employee_id: string
          id: string
          justification_type: Database["public"]["Enums"]["time_clock_justification_type"]
          notes: string | null
          reference_date: string
          related_entry_id: string | null
          requested_by_employee: boolean
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          justification_type: Database["public"]["Enums"]["time_clock_justification_type"]
          notes?: string | null
          reference_date: string
          related_entry_id?: string | null
          requested_by_employee?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          justification_type?: Database["public"]["Enums"]["time_clock_justification_type"]
          notes?: string | null
          reference_date?: string
          related_entry_id?: string | null
          requested_by_employee?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_justifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_justifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_justifications_related_entry_id_fkey"
            columns: ["related_entry_id"]
            isOneToOne: false
            referencedRelation: "time_clock_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_closures: {
        Row: {
          accepted_at: string | null
          accepted_ip: string | null
          accepted_user_agent: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          reference_month: number
          reference_year: number
          sent_to_accounting_at: string | null
          sent_to_accounting_by: string | null
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_ip?: string | null
          accepted_user_agent?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          reference_month: number
          reference_year: number
          sent_to_accounting_at?: string | null
          sent_to_accounting_by?: string | null
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_ip?: string | null
          accepted_user_agent?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          reference_month?: number
          reference_year?: number
          sent_to_accounting_at?: string | null
          sent_to_accounting_by?: string | null
          status?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_closures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_closures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      totem_assets: {
        Row: {
          brand_slug: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string
          is_active: boolean
          kind: string
          sort_order: number
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          brand_slug?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          kind: string
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          brand_slug?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          kind?: string
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_criteria: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      training_evaluations: {
        Row: {
          created_at: string
          created_by: string | null
          criterion_id: string
          day_number: number
          employee_id: string
          evaluation_date: string
          id: string
          notes: string | null
          score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criterion_id: string
          day_number: number
          employee_id: string
          evaluation_date?: string
          id?: string
          notes?: string | null
          score: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criterion_id?: string
          day_number?: number
          employee_id?: string
          evaluation_date?: string
          id?: string
          notes?: string | null
          score?: number
          updated_at?: string
        }
        Relationships: []
      }
      training_receipts: {
        Row: {
          c6_exported_at: string | null
          created_at: string
          created_by: string | null
          daily_rate: number
          due_date: string
          employee_id: string
          id: string
          monthly_salary: number
          payable_id: string | null
          payable_posted_at: string | null
          signature_required_at: string | null
          signed_at: string | null
          signed_ip: string | null
          signed_user_agent: string | null
          total_amount: number
          training_end: string
          training_start: string
          updated_at: string
          worked_days: number
        }
        Insert: {
          c6_exported_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate: number
          due_date: string
          employee_id: string
          id?: string
          monthly_salary: number
          payable_id?: string | null
          payable_posted_at?: string | null
          signature_required_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          total_amount: number
          training_end: string
          training_start: string
          updated_at?: string
          worked_days: number
        }
        Update: {
          c6_exported_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate?: number
          due_date?: string
          employee_id?: string
          id?: string
          monthly_salary?: number
          payable_id?: string | null
          payable_posted_at?: string | null
          signature_required_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          total_amount?: number
          training_end?: string
          training_start?: string
          updated_at?: string
          worked_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      training_schedule_days: {
        Row: {
          break_end: string | null
          break_start: string | null
          created_at: string
          day_date: string
          end_time: string | null
          id: string
          is_day_off: boolean
          notes: string | null
          schedule_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_date: string
          end_time?: string | null
          id?: string
          is_day_off?: boolean
          notes?: string | null
          schedule_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_date?: string
          end_time?: string | null
          id?: string
          is_day_off?: boolean
          notes?: string | null
          schedule_id?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_schedule_days_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "training_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_schedules: {
        Row: {
          admission_exam_document_id: string | null
          admission_exam_requested_at: string | null
          admission_exam_requested_by: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          location: string | null
          notes: string | null
          responsible_employee_id: string | null
          responsible_name: string
          start_date: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          admission_exam_document_id?: string | null
          admission_exam_requested_at?: string | null
          admission_exam_requested_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          location?: string | null
          notes?: string | null
          responsible_employee_id?: string | null
          responsible_name: string
          start_date: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          admission_exam_document_id?: string | null
          admission_exam_requested_at?: string | null
          admission_exam_requested_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          location?: string | null
          notes?: string | null
          responsible_employee_id?: string | null
          responsible_name?: string
          start_date?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_schedules_admission_exam_document_id_fkey"
            columns: ["admission_exam_document_id"]
            isOneToOne: false
            referencedRelation: "employee_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_schedules_responsible_employee_id_fkey"
            columns: ["responsible_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_schedules_responsible_employee_id_fkey"
            columns: ["responsible_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_schedules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_voucher_monthly_payments: {
        Row: {
          amount_paid: number
          created_at: string
          days_paid: number | null
          employee_id: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          reference_month: number
          reference_year: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          days_paid?: number | null
          employee_id: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          reference_month: number
          reference_year: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          days_paid?: number | null
          employee_id?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          reference_month?: number
          reference_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_voucher_monthly_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_voucher_monthly_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_voucher_settings: {
        Row: {
          id: boolean
          payment_frequency: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          payment_frequency?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          payment_frequency?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      uniform_deliveries: {
        Row: {
          charge_reason: string | null
          charge_to_employee: number
          created_at: string
          created_by: string | null
          delivered_on: string
          delivery_type: string
          employee_id: string
          id: string
          notes: string | null
          store_id: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          charge_reason?: string | null
          charge_to_employee?: number
          created_at?: string
          created_by?: string | null
          delivered_on?: string
          delivery_type?: string
          employee_id: string
          id?: string
          notes?: string | null
          store_id: string
          total_cost?: number
          updated_at?: string
        }
        Update: {
          charge_reason?: string | null
          charge_to_employee?: number
          created_at?: string
          created_by?: string | null
          delivered_on?: string
          delivery_type?: string
          employee_id?: string
          id?: string
          notes?: string | null
          store_id?: string
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_deliveries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_deliveries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_deliveries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_delivery_items: {
        Row: {
          created_at: string
          delivery_id: string
          expected_return: boolean
          id: string
          quantity: number
          returned_quantity: number
          size: string
          uniform_item_id: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          delivery_id: string
          expected_return?: boolean
          id?: string
          quantity?: number
          returned_quantity?: number
          size: string
          uniform_item_id: string
          unit_cost?: number
        }
        Update: {
          created_at?: string
          delivery_id?: string
          expected_return?: boolean
          id?: string
          quantity?: number
          returned_quantity?: number
          size?: string
          uniform_item_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "uniform_delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "uniform_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_delivery_items_uniform_item_id_fkey"
            columns: ["uniform_item_id"]
            isOneToOne: false
            referencedRelation: "uniform_items"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_durable: boolean
          name: string
          replacement_months: number
          size_type: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_durable?: boolean
          name: string
          replacement_months?: number
          size_type?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_durable?: boolean
          name?: string
          replacement_months?: number
          size_type?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      uniform_kit_items: {
        Row: {
          created_at: string
          id: string
          position: string
          quantity: number
          uniform_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: string
          quantity?: number
          uniform_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: string
          quantity?: number
          uniform_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_kit_items_uniform_item_id_fkey"
            columns: ["uniform_item_id"]
            isOneToOne: false
            referencedRelation: "uniform_items"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_return_items: {
        Row: {
          back_to_stock: boolean
          condition: string
          created_at: string
          delivery_item_id: string | null
          id: string
          quantity: number
          return_id: string
          size: string
          uniform_item_id: string
        }
        Insert: {
          back_to_stock?: boolean
          condition?: string
          created_at?: string
          delivery_item_id?: string | null
          id?: string
          quantity?: number
          return_id: string
          size: string
          uniform_item_id: string
        }
        Update: {
          back_to_stock?: boolean
          condition?: string
          created_at?: string
          delivery_item_id?: string | null
          id?: string
          quantity?: number
          return_id?: string
          size?: string
          uniform_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_return_items_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "uniform_delivery_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "uniform_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_return_items_uniform_item_id_fkey"
            columns: ["uniform_item_id"]
            isOneToOne: false
            referencedRelation: "uniform_items"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_returns: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          return_reason: string
          returned_on: string
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          return_reason?: string
          returned_on?: string
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          return_reason?: string
          returned_on?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_returns_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_returns_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_stock: {
        Row: {
          created_at: string
          id: string
          min_alert: number
          quantity: number
          size: string
          store_id: string
          uniform_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_alert?: number
          quantity?: number
          size: string
          store_id: string
          uniform_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_alert?: number
          quantity?: number
          size?: string
          store_id?: string
          uniform_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_stock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_stock_uniform_item_id_fkey"
            columns: ["uniform_item_id"]
            isOneToOne: false
            referencedRelation: "uniform_items"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          quantity: number
          reason: string | null
          related_delivery_id: string | null
          size: string
          store_id: string
          uniform_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          quantity: number
          reason?: string | null
          related_delivery_id?: string | null
          size: string
          store_id: string
          uniform_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          quantity?: number
          reason?: string | null
          related_delivery_id?: string | null
          size?: string
          store_id?: string
          uniform_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_stock_movements_uniform_item_id_fkey"
            columns: ["uniform_item_id"]
            isOneToOne: false
            referencedRelation: "uniform_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_overrides: {
        Row: {
          bypass_geofence: boolean
          can_receive_invoices: boolean
          created_at: string
          extra_store_ids: string[]
          notes: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          bypass_geofence?: boolean
          can_receive_invoices?: boolean
          created_at?: string
          extra_store_ids?: string[]
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          bypass_geofence?: boolean
          can_receive_invoices?: boolean
          created_at?: string
          extra_store_ids?: string[]
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_face_descriptors: {
        Row: {
          descriptor: number[]
          enrolled_at: string
          id: string
          is_active: boolean
          photo_path: string | null
          sample_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          descriptor: number[]
          enrolled_at?: string
          id?: string
          is_active?: boolean
          photo_path?: string | null
          sample_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          descriptor?: number[]
          enrolled_at?: string
          id?: string
          is_active?: boolean
          photo_path?: string | null
          sample_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          category: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          tag: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          read_at?: string | null
          tag?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          tag?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_name: string
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[]
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[]
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_signatures: {
        Row: {
          consent_accepted_at: string
          consent_ip: string | null
          consent_text: string
          consent_user_agent: string | null
          created_at: string
          id: string
          signature_path: string
          user_id: string
        }
        Insert: {
          consent_accepted_at?: string
          consent_ip?: string | null
          consent_text: string
          consent_user_agent?: string | null
          created_at?: string
          id?: string
          signature_path: string
          user_id: string
        }
        Update: {
          consent_accepted_at?: string
          consent_ip?: string | null
          consent_text?: string
          consent_user_agent?: string | null
          created_at?: string
          id?: string
          signature_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_tour_progress: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          tour_key: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          tour_key: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          tour_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_useful_links: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_shared: boolean
          sort_order: number
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_shared?: boolean
          sort_order?: number
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_shared?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      vacation_schedules: {
        Row: {
          acquisition_end: string
          acquisition_start: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          days_count: number | null
          employee_id: string
          end_date: string
          id: string
          installment_number: number
          notes: string | null
          sell_days: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          acquisition_end: string
          acquisition_start: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          days_count?: number | null
          employee_id: string
          end_date: string
          id?: string
          installment_number?: number
          notes?: string | null
          sell_days?: number
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          acquisition_end?: string
          acquisition_start?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          days_count?: number | null
          employee_id?: string
          end_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          sell_days?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      vault_categories: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          kind: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          kind: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      vault_contacts: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role_or_company: string | null
          store_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role_or_company?: string | null
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role_or_company?: string | null
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_contacts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vault_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_contacts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_credentials: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          password: string | null
          service_name: string
          store_id: string | null
          updated_at: string
          updated_by: string | null
          url: string | null
          username: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          password?: string | null
          service_name: string
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          url?: string | null
          username?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          password?: string | null
          service_name?: string
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_credentials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vault_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_credentials_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      warning_templates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      weekly_payment_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_payment_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_payment_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_blocked_numbers: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          phone: string
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          phone: string
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          phone?: string
          reason?: string | null
        }
        Relationships: []
      }
      whatsapp_customer_complaints: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          message: string
          phone: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          store_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          message: string
          phone: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          store_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          message?: string
          phone?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_customer_complaints_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_customer_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_customer_complaints_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_customer_config: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          off_hours_message: string | null
          opening_hours: string | null
          prompt_history: Json
          sales_enabled: boolean
          sales_off_message: string | null
          store_id: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          off_hours_message?: string | null
          opening_hours?: string | null
          prompt_history?: Json
          sales_enabled?: boolean
          sales_off_message?: string | null
          store_id: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          off_hours_message?: string | null
          opening_hours?: string | null
          prompt_history?: Json
          sales_enabled?: boolean
          sales_off_message?: string | null
          store_id?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_customer_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_customer_conversations: {
        Row: {
          context_summary: string | null
          created_at: string
          customer_name: string | null
          feedback_rating: string | null
          feedback_requested_at: string | null
          id: string
          last_message_at: string
          phone: string
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          context_summary?: string | null
          created_at?: string
          customer_name?: string | null
          feedback_rating?: string | null
          feedback_requested_at?: string | null
          id?: string
          last_message_at?: string
          phone: string
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          context_summary?: string | null
          created_at?: string
          customer_name?: string | null
          feedback_rating?: string | null
          feedback_requested_at?: string | null
          id?: string
          last_message_at?: string
          phone?: string
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_customer_conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_customer_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_args: Json | null
          tool_name: string | null
          tool_result: Json | null
          zapi_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          zapi_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          zapi_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_customer_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_customer_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notifications_log: {
        Row: {
          category: string | null
          created_at: string
          employee_id: string | null
          error: string | null
          id: string
          message: string
          phone: string | null
          provider: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          tag: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          employee_id?: string | null
          error?: string | null
          id?: string
          message: string
          phone?: string | null
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          tag?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          employee_id?: string | null
          error?: string | null
          id?: string
          message?: string
          phone?: string | null
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          tag?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      work_schedules: {
        Row: {
          break_end: string | null
          break_end_2: string | null
          break_start: string | null
          break_start_2: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          end_time: string | null
          id: string
          is_day_off: boolean
          is_home_office: boolean
          notes: string | null
          schedule_date: string
          shift_id: string | null
          start_time: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          break_end?: string | null
          break_end_2?: string | null
          break_start?: string | null
          break_start_2?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_time?: string | null
          id?: string
          is_day_off?: boolean
          is_home_office?: boolean
          notes?: string | null
          schedule_date: string
          shift_id?: string | null
          start_time?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          break_end?: string | null
          break_end_2?: string | null
          break_start?: string | null
          break_start_2?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_time?: string | null
          id?: string
          is_day_off?: boolean
          is_home_office?: boolean
          notes?: string | null
          schedule_date?: string
          shift_id?: string | null
          start_time?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      work_shifts: {
        Row: {
          color: string
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          name: string
          start_time: string
          store_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          start_time: string
          store_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employees_directory: {
        Row: {
          allocated_store_id: string | null
          avatar_path: string | null
          department: string | null
          full_name: string | null
          hire_date: string | null
          id: string | null
          position: string | null
          social_name: string | null
          status: string | null
          store_id: string | null
          termination_date: string | null
          user_id: string | null
        }
        Insert: {
          allocated_store_id?: string | null
          avatar_path?: string | null
          department?: string | null
          full_name?: string | null
          hire_date?: string | null
          id?: string | null
          position?: string | null
          social_name?: string | null
          status?: string | null
          store_id?: string | null
          termination_date?: string | null
          user_id?: string | null
        }
        Update: {
          allocated_store_id?: string | null
          avatar_path?: string | null
          department?: string | null
          full_name?: string | null
          hire_date?: string | null
          id?: string | null
          position?: string | null
          social_name?: string | null
          status?: string | null
          store_id?: string | null
          termination_date?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_allocated_store_id_fkey"
            columns: ["allocated_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      hour_bank_balances: {
        Row: {
          available_minutes: number | null
          credits_expiring_soon: number | null
          employee_id: string | null
          net_minutes: number | null
          total_credit_minutes: number | null
          total_debit_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hour_bank_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hour_bank_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lot_alerts: {
        Row: {
          alert_level: string | null
          days_to_expiry: number | null
          expiry_date: string | null
          lot_id: string | null
          lot_number: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          store_id: string | null
          store_name: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_stock_shortages: {
        Row: {
          current_qty: number | null
          min_qty: number | null
          product_id: string | null
          product_name: string | null
          severity: string | null
          store_id: string | null
          unit: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_finance_allocations_effective: {
        Row: {
          amount: number | null
          category_id: string | null
          is_split: boolean | null
          reference_date: string | null
          source_id: string | null
          source_kind: string | null
          store_id: string | null
        }
        Relationships: []
      }
      v_mood_weekly_store_agg: {
        Row: {
          avg_mood: number | null
          low_count: number | null
          respondents: number | null
          skipped_count: number | null
          store_id: string | null
          store_name: string | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _migration_list_tables: { Args: never; Returns: Json }
      _migration_set_triggers: {
        Args: { p_enable: boolean }
        Returns: undefined
      }
      _migration_storage_missing_count: {
        Args: { p_bucket: string; p_col: string; p_table: string }
        Returns: {
          missing: number
          total: number
        }[]
      }
      _migration_storage_missing_paths: {
        Args: {
          p_bucket: string
          p_col: string
          p_limit: number
          p_offset: number
          p_table: string
        }
        Returns: {
          path: string
        }[]
      }
      active_maintenance_for_employee: {
        Args: { _user_id: string }
        Returns: {
          approval_instructions: string
          approved_at: string
          company_contact_name: string
          company_contact_phone: string
          company_name: string
          company_phone: string
          description: string
          equipment_type: string
          id: string
          professional_name: string
          professional_phone: string
          professional_role: string
          requested_at: string
          status: string
          store_id: string
          store_name: string
          urgency: string
          user_id: string
        }[]
      }
      alert_late_freelancer_checkins: { Args: never; Returns: undefined }
      announcement_is_due: {
        Args: {
          _end: string
          _is_active: boolean
          _rec_day: number
          _recurrence: string
          _start: string
          _today?: string
        }
        Returns: boolean
      }
      apply_shift_swap: { Args: { _swap_id: string }; Returns: undefined }
      approve_inventory_count: { Args: { _count_id: string }; Returns: Json }
      bulk_create_recipes_from_pos_names: {
        Args: { _names: string[] }
        Returns: Json
      }
      calc_discipline_score: {
        Args: { _cycle_id: string; _employee_id: string }
        Returns: number
      }
      can_manage_automation_rules: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_receive_inventory: { Args: { _user_id: string }; Returns: boolean }
      can_view_accounts_payable: {
        Args: { _user_id: string }
        Returns: boolean
      }
      cancel_inventory_count: {
        Args: { _count_id: string }
        Returns: undefined
      }
      cancel_inventory_transfer: {
        Args: { _reason?: string; _transfer_id: string }
        Returns: boolean
      }
      candidate_accepts_uploads: {
        Args: { _candidate_id: string }
        Returns: boolean
      }
      candidate_id_from_upload_token: {
        Args: { _token: string }
        Returns: string
      }
      candidate_info_by_upload_token: {
        Args: { _token: string }
        Returns: {
          candidate_id: string
          documents_requested_notes: string
          full_name: string
          requested_documents: Json
        }[]
      }
      classify_product_storage_group: {
        Args: { _product_name: string }
        Returns: string
      }
      cleanup_old_job_applications: { Args: never; Returns: undefined }
      cleanup_past_appointments: { Args: never; Returns: number }
      confirm_factory_request_receipt: {
        Args: { _request_id: string }
        Returns: string
      }
      confirm_factory_request_receipt_with_divergence: {
        Args: { _items: Json; _request_id: string }
        Returns: Json
      }
      confirm_inventory_transfer: {
        Args: { _receiver_name?: string; _transfer_id: string }
        Returns: boolean
      }
      consolidated_purchase_plan: {
        Args: never
        Returns: {
          average_cost: number
          estimated_cost: number
          product_id: string
          product_name: string
          qty_factory: number
          qty_open_quotations: number
          qty_stores: number
          qty_to_buy: number
          sources: string[]
          unit: string
        }[]
      }
      consume_pdv_order_stock: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      create_inventory_transfer: {
        Args: {
          _destination_store_id: string
          _items: Json
          _notes?: string
          _origin_store_id: string
          _sender_name?: string
        }
        Returns: string
      }
      create_payable_from_bank_tx:
        | {
            Args: {
              _category_id: string
              _description: string
              _store_id: string
              _supplier_name: string
              _transaction_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _category_id: string
              _competence_date?: string
              _description: string
              _store_id: string
              _supplier_name: string
              _transaction_id: string
            }
            Returns: string
          }
      create_payables_from_bank_tx: {
        Args: { _lines: Json; _transaction_id: string }
        Returns: string[]
      }
      create_receivable_from_bank_tx:
        | {
            Args: {
              _category_id: string
              _description: string
              _payer_name: string
              _store_id: string
              _transaction_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _category_id: string
              _competence_date?: string
              _description: string
              _payer_name: string
              _store_id: string
              _transaction_id: string
            }
            Returns: string
          }
      create_receivables_from_bank_tx: {
        Args: { _lines: Json; _transaction_id: string }
        Returns: string[]
      }
      create_transfer_from_bank_txs: {
        Args: { _description: string; _from_tx_id: string; _to_tx_id: string }
        Returns: string
      }
      current_profile_store_id: { Args: { _user_id: string }; Returns: string }
      current_supplier_id: { Args: never; Returns: string }
      current_user_position: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dfe_register_supplier_map: {
        Args: { _cnpj: string; _desc_norm: string; _product_id: string }
        Returns: undefined
      }
      distribute_factory_production: {
        Args: { _notes?: string; _output_product_id: string }
        Returns: {
          destination_name: string
          destination_store_id: string
          quantity: number
          transfer_id: string
        }[]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      employee_time_clock_payroll: {
        Args: { _employee_id: string }
        Returns: boolean
      }
      employee_time_clock_required: {
        Args: { _employee_id: string }
        Returns: boolean
      }
      employee_uniform_pending: {
        Args: { _employee_id: string }
        Returns: {
          delivered: number
          item_name: string
          pending: number
          returned: number
          size: string
          uniform_item_id: string
        }[]
      }
      employee_vacation_status: {
        Args: { _employee_id: string }
        Returns: {
          acquisition_end: string
          acquisition_start: string
          concessive_end: string
          days_remaining: number
          days_scheduled: number
          days_until_deadline: number
          risk_level: string
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_current_climate_survey: { Args: never; Returns: undefined }
      ensure_weekly_inventory_counts: { Args: never; Returns: Json }
      expire_freelancer_job_openings: { Args: never; Returns: number }
      factory_weekly_plan: {
        Args: never
        Returns: {
          auto_qty: number
          deficit: number
          details: Json
          factory_stock: number
          level: string
          manual_qty: number
          product_id: string
          product_name: string
          recipe_id: string
          recipe_name: string
          source: string
          store_count: number
          total_qty: number
          unit: string
        }[]
      }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      friday_separation_checklist: {
        Args: never
        Returns: {
          current_stock: number
          max_qty: number
          min_qty: number
          product_id: string
          product_name: string
          quantity: number
          storage_group: string
          store_id: string
          store_name: string
          unit: string
        }[]
      }
      gas_confirm_receipt: {
        Args: { _notes?: string; _request_id: string }
        Returns: undefined
      }
      gas_confirm_shipment: {
        Args: { _notes?: string; _request_id: string }
        Returns: undefined
      }
      gas_consume: {
        Args: { _kind: string; _store_id: string }
        Returns: undefined
      }
      gas_register_purchase: {
        Args: {
          _bank_transaction_id?: string
          _notes?: string
          _purchased_at?: string
          _quantity?: number
          _total_amount: number
          _unit_price: number
        }
        Returns: string
      }
      gas_send_vouchers: {
        Args: { _qty: number; _store_id: string }
        Returns: string
      }
      gas_use_reserve: {
        Args: { _notes?: string; _store_id: string }
        Returns: string
      }
      get_employee_cost_center: {
        Args: { _employee_id: string }
        Returns: string
      }
      get_employee_cost_center_by_name: {
        Args: { _full_name: string }
        Returns: string
      }
      get_manager_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_product_active_lots: {
        Args: { _product_id: string; _store_id: string }
        Returns: {
          expiry_date: string
          id: string
          lot_number: string
          manufacture_date: string
          notes: string
          quantity: number
        }[]
      }
      get_terminal_store_id: { Args: { _uid: string }; Returns: string }
      get_top_occurrence_shortcuts: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          category: string
          code: string
          id: string
          occurrence: string
          uses: number
        }[]
      }
      get_user_store: { Args: { _user_id: string }; Returns: string }
      has_geofence_bypass: { Args: { _user_id: string }; Returns: boolean }
      has_module_permission: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      has_partner_or_staff_access: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hour_bank_apply_debit: {
        Args: {
          p_created_by?: string
          p_employee_id: string
          p_entry_type: Database["public"]["Enums"]["hour_bank_entry_type"]
          p_minutes: number
          p_notes?: string
          p_reference_date: string
          p_source_id?: string
          p_source_kind: string
        }
        Returns: string
      }
      hour_bank_expire_credits: { Args: never; Returns: number }
      hour_bank_register_credit: {
        Args: {
          p_created_by?: string
          p_employee_id: string
          p_entry_type: Database["public"]["Enums"]["hour_bank_entry_type"]
          p_minutes: number
          p_notes?: string
          p_reference_date: string
          p_source_id?: string
          p_source_kind: string
        }
        Returns: string
      }
      is_active_employee: { Args: { _user_id: string }; Returns: boolean }
      is_approved_supplier: { Args: { _user_id: string }; Returns: boolean }
      is_freelancer: { Args: { _user_id: string }; Returns: boolean }
      is_partner: { Args: { _user_id: string }; Returns: boolean }
      is_super_user: { Args: { _user_id: string }; Returns: boolean }
      link_freelancer_account: { Args: { _cpf: string }; Returns: string }
      link_freelancer_account_by_id: {
        Args: { _freelancer_id: string }
        Returns: string
      }
      link_pos_item: {
        Args: {
          _inventory_product_id: string
          _pos_item_name: string
          _recipe_id: string
        }
        Returns: Json
      }
      list_public_interview_slots: {
        Args: never
        Returns: {
          duration_min: number
          id: string
          start_at: string
        }[]
      }
      list_shift_swap_candidates: {
        Args: { _requester_employee_id: string }
        Returns: {
          full_name: string
          id: string
          position_name: string
          store_name: string
          user_id: string
        }[]
      }
      list_shift_swap_partner_schedule: {
        Args: { _partner_employee_id: string; _requester_employee_id: string }
        Returns: {
          end_time: string
          id: string
          is_day_off: boolean
          is_home_office: boolean
          schedule_date: string
          start_time: string
        }[]
      }
      list_store_birthdays: {
        Args: { _store_ids: string[] }
        Returns: {
          birth_day: number
          birth_month: number
          display_name: string
          id: string
          job_position: string
          photo_path: string
        }[]
      }
      list_unlinked_freelancers: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      list_unlinked_pos_items: {
        Args: never
        Returns: {
          last_sold_at: string
          occurrences: number
          product_name: string
          stores_count: number
          total_quantity: number
        }[]
      }
      lot_trail: {
        Args: { _lot_id: string }
        Returns: {
          created_at: string
          depth: number
          expiry_date: string
          id: string
          initial_quantity: number
          lot_number: string
          origin_transfer_id: string
          parent_lot_id: string
          product_name: string
          quantity: number
          status: string
          store_id: string
          store_name: string
        }[]
      }
      menu_item_available: {
        Args: {
          _category: string
          _product_id: string
          _ref?: string
          _store_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_pos_name: { Args: { _name: string }; Returns: string }
      nutri_get_user_store_id: { Args: { _user_id: string }; Returns: string }
      open_inventory_count: {
        Args: { _category?: string; _notes?: string; _store_id: string }
        Returns: string
      }
      outsourced_accessible_stores: {
        Args: { _user_id: string }
        Returns: string[]
      }
      outsourced_has_store_access: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      outsourced_self_update_keeps_approval: {
        Args: {
          _approval_status: string
          _approved_at: string
          _approved_by: string
          _id: string
        }
        Returns: boolean
      }
      pdv_advance_order_status: {
        Args: {
          p_event_code?: string
          p_external_event_id?: string
          p_new_status: string
          p_order_id: string
          p_payload?: Json
          p_reason_code?: string
          p_reason_text?: string
          p_source?: string
        }
        Returns: {
          brand_breakdown: Json | null
          cancellation_reason_code: string | null
          cancellation_reason_text: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cash_session_id: string | null
          channel_id: string
          closed_at: string | null
          closure_channel: string | null
          closure_error: string | null
          closure_id: string | null
          closure_status: string | null
          concluded_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_document: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: Json | null
          delivery_by: string | null
          delivery_code: string | null
          delivery_fee: number
          delivery_job_id: string | null
          delivery_provider: string | null
          delivery_tracking_url: string | null
          discount: number
          dispatched_at: string | null
          dre_excluded: boolean
          expected_delivery_at: string | null
          external_display_id: string | null
          external_order_id: string | null
          has_unread_chat: boolean
          id: string
          last_synced_at: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          notes: string | null
          opened_at: string
          order_number: string | null
          order_type: string
          packed_at: string | null
          pickup_code: string | null
          pickup_eta: string | null
          preparation_started_at: string | null
          ready_at: string | null
          source: string | null
          source_payload: Json | null
          status: string
          stock_consumed_at: string | null
          stock_consumed_by: string | null
          store_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pdv_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pdv_consume_order_stock: { Args: { _order_id: string }; Returns: Json }
      pdv_reverse_order_stock: { Args: { _order_id: string }; Returns: Json }
      pending_request_for_recipe: {
        Args: { _recipe_id: string }
        Returns: number
      }
      produce_recipe:
        | {
            Args: {
              _expiry_date?: string
              _lot_number?: string
              _manufacture_date?: string
              _multiplier: number
              _notes?: string
              _portion_id?: string
              _recipe_id: string
              _store_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _divergence_reason: string
              _expiry_date: string
              _lot_number: string
              _manufacture_date: string
              _multiplier: number
              _notes: string
              _portion_id?: string
              _recipe_id: string
              _requested_quantity: number
              _store_id: string
            }
            Returns: string
          }
      production_suggestions: {
        Args: never
        Returns: {
          factory_stock: number
          output_product_id: string
          output_product_name: string
          recipe_id: string
          recipe_name: string
          store_breakdown: Json
          suggested_multiplier: number
          suggested_qty: number
          total_needed: number
          yield_quantity: number
          yield_unit: string
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      receive_invoice_item: { Args: { _item_id: string }; Returns: string }
      reconcile_bank_transaction: {
        Args: { _payable_id: string; _transaction_id: string }
        Returns: Json
      }
      reconcile_bank_transaction_batch: {
        Args: {
          _payable_ids?: string[]
          _receivable_ids?: string[]
          _transaction_id: string
        }
        Returns: Json
      }
      reconcile_bank_transaction_receivable: {
        Args: { _receivable_id: string; _transaction_id: string }
        Returns: Json
      }
      reconcile_bank_tx_with_c6_batch: {
        Args: { _batch_id: string; _transaction_id: string }
        Returns: number
      }
      register_candidate_document_upload: {
        Args: {
          _doc_type: string
          _file_name: string
          _file_path: string
          _mime_type: string
          _size_bytes: number
          _token: string
        }
        Returns: string
      }
      register_inventory_loss: {
        Args: {
          _lot_id?: string
          _notes?: string
          _occurred_on?: string
          _product_id: string
          _quantity: number
          _reason?: string
          _store_id: string
        }
        Returns: string
      }
      reopen_inventory_count: {
        Args: { _count_id: string }
        Returns: undefined
      }
      same_store_as_caller: {
        Args: { _target_alloc: string; _target_store: string }
        Returns: boolean
      }
      set_count_item_lots: {
        Args: { _count_item_id: string; _lots: Json }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      store_login_store_id: { Args: { _user_id: string }; Returns: string }
      submit_inventory_count: {
        Args: { _count_id: string }
        Returns: undefined
      }
      suggest_finance_entry: {
        Args: { _kind: string; _memo: string }
        Returns: {
          category_id: string
          description: string
          party_name: string
          similarity_score: number
          source: string
        }[]
      }
      suggest_purchases: {
        Args: never
        Returns: {
          average_cost: number
          category: string
          estimated_cost: number
          product_id: string
          product_name: string
          qty_to_buy: number
          total_max: number
          total_min: number
          total_stock: number
          unit: string
        }[]
      }
      suggest_transfers: {
        Args: { _origin_store_id: string }
        Returns: {
          current_qty: number
          destination_store_id: string
          destination_store_name: string
          max_qty: number
          min_qty: number
          needed_qty: number
          origin_available: number
          product_id: string
          product_name: string
          suggested_qty: number
          unit: string
        }[]
      }
      task_period_start: {
        Args: {
          _periodicity: Database["public"]["Enums"]["task_periodicity"]
          _ref?: string
        }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
      unreconcile_bank_transaction: {
        Args: { _transaction_id: string }
        Returns: Json
      }
      user_accessible_stores: { Args: { _user_id: string }; Returns: string[] }
      user_can_access_employee: {
        Args: { _employee_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_store: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      user_works_at_factory: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "employee"
        | "trainee"
        | "nutritionist"
        | "hr"
        | "supplier"
        | "outsourced"
        | "contabilidade"
        | "partner"
        | "waiter"
        | "mental_health"
      automation_trigger_type:
        | "late_arrival"
        | "wrong_punch"
        | "unjustified_absence"
        | "infraction_recurrence"
      contract_type_enum:
        | "experience_14"
        | "experience_30"
        | "clt_indeterminate"
      employee_contract_status:
        | "pending_signature"
        | "active"
        | "signed"
        | "expired"
        | "renewed"
        | "converted_clt"
        | "terminated"
      employee_leave_type:
        | "medical_certificate"
        | "paid_absence"
        | "unpaid_absence"
        | "day_off"
        | "suspension"
        | "vacation"
        | "inss"
        | "maternity"
        | "paternity"
        | "bereavement"
        | "marriage"
        | "other"
      factory_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "shipped"
        | "received"
        | "cancelled"
      hour_bank_entry_type:
        | "overtime"
        | "late"
        | "early_leave"
        | "manual_credit"
        | "manual_debit"
        | "expired"
        | "payout"
      packaging_kit_type: "individual" | "casal" | "familia"
      payroll_advance_status:
        | "pending"
        | "partially_applied"
        | "applied"
        | "cancelled"
      payroll_advance_type:
        | "advance"
        | "deduction"
        | "loan"
        | "earning"
        | "night_addition"
      payroll_installment_status: "pending" | "applied" | "cancelled"
      payroll_workflow_status:
        | "gerada"
        | "em_revisao_contabilidade"
        | "aprovada_contabilidade"
        | "consolidada"
        | "estornada"
      shift_swap_status: "pending" | "accepted" | "rejected" | "approved"
      shift_swap_type: "reciprocal" | "coverage"
      store_type: "loja" | "fabrica" | "central"
      supplier_offer_type: "launch" | "promo" | "surplus"
      task_assignment_scope: "employee" | "store"
      task_periodicity: "daily" | "weekly" | "biweekly" | "monthly" | "once"
      termination_reason:
        | "dismissal_without_cause"
        | "employee_resignation"
        | "dismissal_with_cause"
        | "end_of_trial_contract"
        | "end_of_fixed_term"
        | "mutual_agreement_484a"
      time_clock_entry_type:
        | "clock_in"
        | "break_start"
        | "break_end"
        | "clock_out"
        | "break_start_2"
        | "break_end_2"
      time_clock_justification_type:
        | "forgotten_punch"
        | "late_arrival"
        | "early_leave"
        | "absence"
        | "other"
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
      app_role: [
        "admin",
        "manager",
        "employee",
        "trainee",
        "nutritionist",
        "hr",
        "supplier",
        "outsourced",
        "contabilidade",
        "partner",
        "waiter",
        "mental_health",
      ],
      automation_trigger_type: [
        "late_arrival",
        "wrong_punch",
        "unjustified_absence",
        "infraction_recurrence",
      ],
      contract_type_enum: [
        "experience_14",
        "experience_30",
        "clt_indeterminate",
      ],
      employee_contract_status: [
        "pending_signature",
        "active",
        "signed",
        "expired",
        "renewed",
        "converted_clt",
        "terminated",
      ],
      employee_leave_type: [
        "medical_certificate",
        "paid_absence",
        "unpaid_absence",
        "day_off",
        "suspension",
        "vacation",
        "inss",
        "maternity",
        "paternity",
        "bereavement",
        "marriage",
        "other",
      ],
      factory_request_status: [
        "pending",
        "approved",
        "rejected",
        "shipped",
        "received",
        "cancelled",
      ],
      hour_bank_entry_type: [
        "overtime",
        "late",
        "early_leave",
        "manual_credit",
        "manual_debit",
        "expired",
        "payout",
      ],
      packaging_kit_type: ["individual", "casal", "familia"],
      payroll_advance_status: [
        "pending",
        "partially_applied",
        "applied",
        "cancelled",
      ],
      payroll_advance_type: [
        "advance",
        "deduction",
        "loan",
        "earning",
        "night_addition",
      ],
      payroll_installment_status: ["pending", "applied", "cancelled"],
      payroll_workflow_status: [
        "gerada",
        "em_revisao_contabilidade",
        "aprovada_contabilidade",
        "consolidada",
        "estornada",
      ],
      shift_swap_status: ["pending", "accepted", "rejected", "approved"],
      shift_swap_type: ["reciprocal", "coverage"],
      store_type: ["loja", "fabrica", "central"],
      supplier_offer_type: ["launch", "promo", "surplus"],
      task_assignment_scope: ["employee", "store"],
      task_periodicity: ["daily", "weekly", "biweekly", "monthly", "once"],
      termination_reason: [
        "dismissal_without_cause",
        "employee_resignation",
        "dismissal_with_cause",
        "end_of_trial_contract",
        "end_of_fixed_term",
        "mutual_agreement_484a",
      ],
      time_clock_entry_type: [
        "clock_in",
        "break_start",
        "break_end",
        "clock_out",
        "break_start_2",
        "break_end_2",
      ],
      time_clock_justification_type: [
        "forgotten_punch",
        "late_arrival",
        "early_leave",
        "absence",
        "other",
      ],
    },
  },
} as const
