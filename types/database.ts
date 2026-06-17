/**
 * Database types for Vibecheck.
 *
 * Hand-maintained to mirror /supabase/migrations. Once you have the Supabase
 * CLI linked you can regenerate this file with:
 *
 *   npx supabase gen types typescript --local > types/database.ts
 *   # or, against a hosted project:
 *   npx supabase gen types typescript --project-id <ref> > types/database.ts
 *
 * Keep the shape compatible with `Database` so `lib/supabase.ts` stays typed.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Plan = "free" | "pro" | "team";
export type ScanStatus =
  | "queued"
  | "running"
  | "awaiting_report"
  | "done"
  | "failed";
export type Severity = "critical" | "high" | "medium" | "low";
export type FindingCategory =
  | "secrets"
  | "auth"
  | "injection"
  | "deps"
  | "scaling"
  | "config";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          created_at: string;
          plan: Plan;
          github_login: string | null;
          github_token: string | null;
          scan_credits: number;
        };
        Insert: {
          id?: string;
          email?: string | null;
          created_at?: string;
          plan?: Plan;
          github_login?: string | null;
          github_token?: string | null;
          scan_credits?: number;
        };
        Update: {
          id?: string;
          email?: string | null;
          created_at?: string;
          plan?: Plan;
          github_login?: string | null;
          github_token?: string | null;
          scan_credits?: number;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: { id: string; created_at: string };
        Insert: { id: string; created_at?: string };
        Update: { id?: string; created_at?: string };
        Relationships: [];
      };
      fix_prs: {
        Row: {
          id: string;
          scan_id: string;
          user_id: string | null;
          pr_url: string;
          pr_number: number | null;
          branch: string | null;
          title: string | null;
          finding_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          scan_id: string;
          user_id?: string | null;
          pr_url: string;
          pr_number?: number | null;
          branch?: string | null;
          title?: string | null;
          finding_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          scan_id?: string;
          user_id?: string | null;
          pr_url?: string;
          pr_number?: number | null;
          branch?: string | null;
          title?: string | null;
          finding_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fix_prs_scan_id_fkey";
            columns: ["scan_id"];
            referencedRelation: "scans";
            referencedColumns: ["id"];
          },
        ];
      };
      scans: {
        Row: {
          id: string;
          user_id: string | null;
          repo_url: string;
          status: ScanStatus;
          risk_score: number | null;
          summary: string | null;
          raw_findings: Json | null;
          unlocked: boolean;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          repo_url: string;
          status?: ScanStatus;
          risk_score?: number | null;
          summary?: string | null;
          raw_findings?: Json | null;
          unlocked?: boolean;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          repo_url?: string;
          status?: ScanStatus;
          risk_score?: number | null;
          summary?: string | null;
          raw_findings?: Json | null;
          unlocked?: boolean;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "scans_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      findings: {
        Row: {
          id: string;
          scan_id: string;
          severity: Severity;
          category: FindingCategory;
          title: string;
          plain_explanation: string;
          why_it_matters: string;
          fix_snippet: string | null;
          fix_prompt: string | null;
          file_path: string | null;
          line: number | null;
          is_locked: boolean;
        };
        Insert: {
          id?: string;
          scan_id: string;
          severity: Severity;
          category: FindingCategory;
          title: string;
          plain_explanation: string;
          why_it_matters: string;
          fix_snippet?: string | null;
          fix_prompt?: string | null;
          file_path?: string | null;
          line?: number | null;
          is_locked?: boolean;
        };
        Update: {
          id?: string;
          scan_id?: string;
          severity?: Severity;
          category?: FindingCategory;
          title?: string;
          plain_explanation?: string;
          why_it_matters?: string;
          fix_snippet?: string | null;
          fix_prompt?: string | null;
          file_path?: string | null;
          line?: number | null;
          is_locked?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "findings_scan_id_fkey";
            columns: ["scan_id"];
            referencedRelation: "scans";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          user_id: string | null;
          scan_id: string | null;
          name: string;
          props: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          scan_id?: string | null;
          name: string;
          props?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          scan_id?: string | null;
          name?: string;
          props?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_scan_id_fkey";
            columns: ["scan_id"];
            referencedRelation: "scans";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row aliases. */
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
export type FindingRow = Database["public"]["Tables"]["findings"]["Row"];
export type EventRow = Database["public"]["Tables"]["events"]["Row"];
