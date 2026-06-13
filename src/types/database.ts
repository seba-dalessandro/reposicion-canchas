import type { AppRole } from './roles'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type SkuStatus = 'active' | 'voided'
export type SkuStatusSource = 'file' | 'manual'
export type SkuImportClassification =
  | 'nuevo'
  | 'existente'
  | 'modificado'
  | 'duplicado_archivo'
  | 'error'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: AppRole
          can_change_sku_manual_status: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: AppRole
          can_change_sku_manual_status?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          full_name?: string | null
          role?: AppRole
          can_change_sku_manual_status?: boolean
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      forklifts: {
        Row: { id: string; name: string; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; is_active?: boolean; created_at?: string; updated_at?: string }
        Update: { name?: string; is_active?: boolean; updated_at?: string }
        Relationships: []
      }
      courts: {
        Row: { id: string; name: string; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; is_active?: boolean; created_at?: string; updated_at?: string }
        Update: { name?: string; is_active?: boolean; updated_at?: string }
        Relationships: []
      }
      drivers: {
        Row: { id: string; name: string; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; is_active?: boolean; created_at?: string; updated_at?: string }
        Update: { name?: string; is_active?: boolean; updated_at?: string }
        Relationships: []
      }
      skus: {
        Row: {
          id: string
          sku_code: string
          description: string
          status_file: SkuStatus
          status_manual: SkuStatus | null
          effective_status: SkuStatus
          status_source: SkuStatusSource
          last_file_import_at: string | null
          manual_status_changed_by: string | null
          manual_status_changed_at: string | null
          manual_status_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sku_code: string
          description: string
          status_file?: SkuStatus
          status_manual?: SkuStatus | null
          effective_status?: SkuStatus
          status_source?: SkuStatusSource
          last_file_import_at?: string | null
          manual_status_changed_by?: string | null
          manual_status_changed_at?: string | null
          manual_status_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          sku_code?: string
          description?: string
          status_file?: SkuStatus
          status_manual?: SkuStatus | null
          effective_status?: SkuStatus
          status_source?: SkuStatusSource
          last_file_import_at?: string | null
          manual_status_changed_by?: string | null
          manual_status_changed_at?: string | null
          manual_status_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sku_imports: {
        Row: {
          id: string
          file_name: string
          status: 'pending' | 'processed' | 'failed'
          total_rows: number
          valid_rows: number
          invalid_rows: number
          summary_new: number
          summary_existing: number
          summary_modified: number
          summary_duplicado_archivo: number
          summary_error: number
          created_by: string | null
          created_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          file_name: string
          status?: 'pending' | 'processed' | 'failed'
          total_rows?: number
          valid_rows?: number
          invalid_rows?: number
          summary_new?: number
          summary_existing?: number
          summary_modified?: number
          summary_duplicado_archivo?: number
          summary_error?: number
          created_by?: string | null
          created_at?: string
          processed_at?: string | null
        }
        Update: {
          status?: 'pending' | 'processed' | 'failed'
          total_rows?: number
          valid_rows?: number
          invalid_rows?: number
          summary_new?: number
          summary_existing?: number
          summary_modified?: number
          summary_duplicado_archivo?: number
          summary_error?: number
          processed_at?: string | null
        }
        Relationships: []
      }
      sku_import_details: {
        Row: {
          id: string
          import_id: string
          row_number: number
          sku_code: string
          description: string | null
          status_file: SkuStatus | null
          classification: SkuImportClassification
          previous_description: string | null
          previous_status_file: SkuStatus | null
          status_manual: SkuStatus | null
          effective_status: SkuStatus | null
          status_source: SkuStatusSource | null
          error_message: string | null
          sku_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          import_id: string
          row_number: number
          sku_code: string
          description?: string | null
          status_file?: SkuStatus | null
          classification?: SkuImportClassification
          previous_description?: string | null
          previous_status_file?: SkuStatus | null
          status_manual?: SkuStatus | null
          effective_status?: SkuStatus | null
          status_source?: SkuStatusSource | null
          error_message?: string | null
          sku_id?: string | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      replenishments: {
        Row: {
          id: string
          sku_id: string
          court_id: string
          forklift_id: string | null
          fecha_operativa: string
          hora_operativa: string | null
          cantidad_paletas: number
          observacion: string | null
          status: 'active' | 'voided'
          created_by: string
          voided_by: string | null
          void_reason: string | null
          created_at: string
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          id?: string
          sku_id: string
          court_id: string
          forklift_id?: string | null
          fecha_operativa: string
          hora_operativa?: string | null
          cantidad_paletas: number
          observacion?: string | null
          status?: 'active' | 'voided'
          created_by?: string
          voided_by?: string | null
          void_reason?: string | null
          created_at?: string
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          sku_id?: string
          court_id?: string
          forklift_id?: string | null
          fecha_operativa?: string
          hora_operativa?: string | null
          cantidad_paletas?: number
          observacion?: string | null
          status?: 'active' | 'voided'
          voided_by?: string | null
          void_reason?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: []
      }
      replenishment_operations: {
        Row: {
          id: string
          fecha_operativa: string
          hora_operativa: string
          forklift_id: string | null
          court_id: string
          status: 'active' | 'voided'
          driver_id: string | null
          created_by: string | null
          voided_by: string | null
          void_reason: string | null
          created_at: string
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          id?: string
          fecha_operativa: string
          hora_operativa: string
          forklift_id?: string | null
          court_id: string
          status?: 'active' | 'voided'
          driver_id?: string | null
          created_by?: string | null
          voided_by?: string | null
          void_reason?: string | null
          created_at?: string
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          fecha_operativa?: string
          hora_operativa?: string
          forklift_id?: string | null
          court_id?: string
          status?: 'active' | 'voided'
          driver_id?: string | null
          created_by?: string | null
          voided_by?: string | null
          void_reason?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: []
      }
      replenishment_items: {
        Row: {
          id: string
          operation_id: string
          sku_id: string
          cantidad_paletas: number
          observacion: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          operation_id: string
          sku_id: string
          cantidad_paletas: number
          observacion?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          operation_id?: string
          sku_id?: string
          cantidad_paletas?: number
          observacion?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_replenishments_report: {
        Row: {
          operation_id: string
          item_id: string
          fecha_operativa: string
          hora_operativa: string
          operation_status: 'active' | 'voided'
          driver_id: string | null
          driver_name: string | null
          forklift_id: string | null
          forklift_name: string | null
          court_id: string
          court_name: string
          sku_id: string
          sku_code: string
          sku_description: string
          sku_status: SkuStatus
          cantidad_paletas: number
          observacion: string | null
          created_by: string | null
          operation_created_at: string
          item_created_at: string
          voided_by: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_replenishment_operation: {
        Args: {
          fecha_operativa: string
          hora_operativa: string
          forklift_id: string | null
          court_id: string
          driver_id?: string | null
          items: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role: AppRole
      replenishment_status: 'active' | 'voided'
      sku_status: SkuStatus
      sku_status_source: SkuStatusSource
      sku_import_status: 'pending' | 'processed' | 'failed'
      sku_import_detail_classification: SkuImportClassification
    }
    CompositeTypes: Record<string, never>
  }
}
