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
      absence_notices: {
        Row: {
          due_at: string
          end_time: string
          school_id: string
          sent_at: string | null
          session_date: string
          session_id: string
          start_time: string
          student_id: string
          subject_name: string
        }
        Insert: {
          due_at: string
          end_time: string
          school_id: string
          sent_at?: string | null
          session_date: string
          session_id: string
          start_time: string
          student_id: string
          subject_name: string
        }
        Update: {
          due_at?: string
          end_time?: string
          school_id?: string
          sent_at?: string | null
          session_date?: string
          session_id?: string
          start_time?: string
          student_id?: string
          subject_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_notices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_notices_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          label: string
          school_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          label: string
          school_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          label?: string
          school_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_events: {
        Row: {
          count: number
          created_at: string
          id: string
          period_end: string
          period_start: string
          school_id: string
          student_id: string
          type: string
        }
        Insert: {
          count: number
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          school_id: string
          student_id: string
          type: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          school_id?: string
          student_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          enabled: boolean
          recipients: string[]
          school_id: string
          threshold: number
          type: string
          updated_at: string
          updated_by: string | null
          window_days: number | null
        }
        Insert: {
          enabled?: boolean
          recipients: string[]
          school_id: string
          threshold: number
          type: string
          updated_at?: string
          updated_by?: string | null
          window_days?: number | null
        }
        Update: {
          enabled?: boolean
          recipients?: string[]
          school_id?: string
          threshold?: number
          type?: string
          updated_at?: string
          updated_by?: string | null
          window_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_targets: {
        Row: {
          academic_year_id: string
          announcement_id: string
          class_id: string | null
          id: string
          level_id: string | null
          school_id: string
        }
        Insert: {
          academic_year_id: string
          announcement_id: string
          class_id?: string | null
          id?: string
          level_id?: string | null
          school_id: string
        }
        Update: {
          academic_year_id?: string
          announcement_id?: string
          class_id?: string | null
          id?: string
          level_id?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_targets_announcement_fkey"
            columns: ["announcement_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "announcement_targets_class_fkey"
            columns: ["class_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "announcement_targets_level_fkey"
            columns: ["level_id", "school_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcement_targets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          academic_year_id: string | null
          audience: string
          body: string
          created_at: string
          created_by: string
          id: string
          school_id: string
          scope: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          academic_year_id?: string | null
          audience: string
          body: string
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          scope: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string | null
          audience?: string
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          scope?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_fkey"
            columns: ["created_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      attendance_marks: {
        Row: {
          marked_at: string
          marked_by: string
          minutes_late: number | null
          note: string | null
          school_id: string
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          marked_at?: string
          marked_by: string
          minutes_late?: number | null
          note?: string | null
          school_id: string
          session_id: string
          status: string
          student_id: string
        }
        Update: {
          marked_at?: string
          marked_by?: string
          minutes_late?: number | null
          note?: string | null
          school_id?: string
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_marks_marked_by_fkey"
            columns: ["marked_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marks_session_fkey"
            columns: ["session_id", "school_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_marks_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          academic_year_id: string
          class_id: string
          end_time: string
          id: string
          lesson_id: string | null
          school_id: string
          session_date: string
          start_time: string
          subject_id: string
          taken_at: string
          taken_by: string
          teacher_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          end_time: string
          id?: string
          lesson_id?: string | null
          school_id: string
          session_date: string
          start_time: string
          subject_id: string
          taken_at?: string
          taken_by: string
          teacher_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          end_time?: string
          id?: string
          lesson_id?: string | null
          school_id?: string
          session_date?: string
          start_time?: string
          subject_id?: string
          taken_at?: string
          taken_by?: string
          teacher_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_class_fkey"
            columns: ["class_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_lesson_fkey"
            columns: ["lesson_id", "school_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_subject_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_taken_by_fkey"
            columns: ["taken_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_teacher_fkey"
            columns: ["teacher_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_updated_by_fkey"
            columns: ["updated_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          data: Json
          entity: string | null
          entity_id: string | null
          id: number
          school_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          entity?: string | null
          entity_id?: string | null
          id?: never
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          entity?: string | null
          entity_id?: string | null
          id?: never
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year_id: string
          created_at: string
          id: string
          level_id: string
          name: string
          school_id: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          id?: string
          level_id: string
          name: string
          school_id: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          id?: string
          level_id?: string
          name?: string
          school_id?: string
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classes_level_fkey"
            columns: ["level_id", "school_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_track_fkey"
            columns: ["track_id", "level_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id", "level_id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          city: string
          created_at: string
          email: string | null
          full_name: string
          handled_at: string | null
          handled_by: string | null
          id: string
          kind: string
          locale: string
          message: string | null
          phone: string
          school_id: string | null
          school_name: string
          students: string
        }
        Insert: {
          city: string
          created_at?: string
          email?: string | null
          full_name: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          locale?: string
          message?: string | null
          phone: string
          school_id?: string | null
          school_name: string
          students: string
        }
        Update: {
          city?: string
          created_at?: string
          email?: string | null
          full_name?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          locale?: string
          message?: string | null
          phone?: string
          school_id?: string | null
          school_name?: string
          students?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_level_settings: {
        Row: {
          absent_as_zero: boolean
          academic_year_id: string
          activities: boolean
          activities_weight: number
          controls_count: number
          level_id: string
          ranking: string
          rounding: string
          scale: number
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          absent_as_zero?: boolean
          academic_year_id: string
          activities?: boolean
          activities_weight?: number
          controls_count?: number
          level_id: string
          ranking?: string
          rounding?: string
          scale: number
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          absent_as_zero?: boolean
          academic_year_id?: string
          activities?: boolean
          activities_weight?: number
          controls_count?: number
          level_id?: string
          ranking?: string
          rounding?: string
          scale?: number
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grade_level_settings_level_fkey"
            columns: ["level_id", "school_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grade_level_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_level_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_level_settings_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      grade_publications: {
        Row: {
          academic_year_id: string
          class_id: string
          first_published_at: string
          id: string
          period_id: string | null
          published_at: string
          published_by: string | null
          school_id: string
          show_rank: boolean
        }
        Insert: {
          academic_year_id: string
          class_id: string
          first_published_at?: string
          id?: string
          period_id?: string | null
          published_at?: string
          published_by?: string | null
          school_id: string
          show_rank?: boolean
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          first_published_at?: string
          id?: string
          period_id?: string | null
          published_at?: string
          published_by?: string | null
          school_id?: string
          show_rank?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "grade_publications_class_fkey"
            columns: ["class_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "grade_publications_period_fkey"
            columns: ["period_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "grade_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_publications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          absent: boolean
          academic_year_id: string
          entered_at: string
          entered_by: string | null
          id: string
          kind: string
          number: number
          period_id: string
          school_id: string
          score: number | null
          student_id: string
          subject_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          absent?: boolean
          academic_year_id: string
          entered_at?: string
          entered_by?: string | null
          id?: string
          kind?: string
          number?: number
          period_id: string
          school_id: string
          score?: number | null
          student_id: string
          subject_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          absent?: boolean
          academic_year_id?: string
          entered_at?: string
          entered_by?: string | null
          id?: string
          kind?: string
          number?: number
          period_id?: string
          school_id?: string
          score?: number | null
          student_id?: string
          subject_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_period_fkey"
            columns: ["period_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grades_subject_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grades_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      grading_periods: {
        Row: {
          academic_year_id: string
          created_at: string
          end_date: string
          id: string
          locked_at: string | null
          locked_by: string | null
          number: number
          school_id: string
          start_date: string
          updated_at: string | null
          updated_by: string | null
          weight: number
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          end_date: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          number: number
          school_id: string
          start_date: string
          updated_at?: string | null
          updated_by?: string | null
          weight?: number
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          end_date?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          number?: number
          school_id?: string
          start_date?: string
          updated_at?: string | null
          updated_by?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grading_periods_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_periods_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_periods_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string
          profile_id: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone: string
          profile_id?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
          profile_id?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_profile_fkey"
            columns: ["profile_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      justifications: {
        Row: {
          file_path: string | null
          from_date: string
          id: string
          kind: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          session_id: string | null
          status: string
          student_id: string
          submitted_at: string
          submitted_by: string
          to_date: string
          updated_at: string
        }
        Insert: {
          file_path?: string | null
          from_date: string
          id?: string
          kind: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          session_id?: string | null
          status?: string
          student_id: string
          submitted_at?: string
          submitted_by: string
          to_date: string
          updated_at?: string
        }
        Update: {
          file_path?: string | null
          from_date?: string
          id?: string
          kind?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          session_id?: string | null
          status?: string
          student_id?: string
          submitted_at?: string
          submitted_by?: string
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "justifications_mark_fkey"
            columns: ["session_id", "student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "attendance_marks"
            referencedColumns: ["session_id", "student_id", "school_id"]
          },
          {
            foreignKeyName: "justifications_reviewed_by_fkey"
            columns: ["reviewed_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "justifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justifications_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "justifications_submitted_by_fkey"
            columns: ["submitted_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      lessons: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          id: string
          room_id: string | null
          school_id: string
          slot_kind: string
          subject_id: string
          teacher_id: string
          time_slot_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          id?: string
          room_id?: string | null
          school_id: string
          slot_kind?: string
          subject_id: string
          teacher_id: string
          time_slot_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          id?: string
          room_id?: string | null
          school_id?: string
          slot_kind?: string
          subject_id?: string
          teacher_id?: string
          time_slot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_class_fkey"
            columns: ["class_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "lessons_room_fkey"
            columns: ["room_id", "school_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "lessons_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_subject_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "lessons_teacher_fkey"
            columns: ["teacher_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "lessons_teacher_subject_fkey"
            columns: ["teacher_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "teacher_subjects"
            referencedColumns: ["teacher_id", "subject_id"]
          },
          {
            foreignKeyName: "lessons_time_slot_fkey"
            columns: [
              "time_slot_id",
              "school_id",
              "academic_year_id",
              "slot_kind",
            ]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id", "school_id", "academic_year_id", "kind"]
          },
          {
            foreignKeyName: "lessons_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      levels: {
        Row: {
          created_at: string
          cycle: string
          id: string
          name: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json
          id: string
          read_at: string | null
          recipient_id: string
          school_id: string | null
          student_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          recipient_id: string
          school_id?: string | null
          student_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          recipient_id?: string
          school_id?: string | null
          student_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_fkey"
            columns: ["recipient_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          key: string
          module_key: string | null
        }
        Insert: {
          created_at?: string
          key: string
          module_key?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          module_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      plan_modules: {
        Row: {
          created_at: string
          module_key: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          module_key: string
          plan_id: string
        }
        Update: {
          created_at?: string
          module_key?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_modules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          max_admin_accounts: number | null
          max_students: number | null
          name: string
          price_monthly: number
          price_yearly: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          max_admin_accounts?: number | null
          max_students?: number | null
          name: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          max_admin_accounts?: number | null
          max_students?: number | null
          name?: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          email: string | null
          full_name: string
          id: string
          locale: string
          must_change_password: boolean
          phone: string | null
          role_id: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          full_name: string
          id: string
          locale?: string
          must_change_password?: boolean
          phone?: string | null
          role_id: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          locale?: string
          must_change_password?: boolean
          phone?: string | null
          role_id?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          id: number
          notification_id: string
          school_id: string | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: never
          notification_id: string
          school_id?: string | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: never
          notification_id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      push_preferences: {
        Row: {
          absences: boolean
          announcements: boolean
          grades: boolean
          profile_id: string
          remarks: boolean
          school_id: string
          updated_at: string
        }
        Insert: {
          absences?: boolean
          announcements?: boolean
          grades?: boolean
          profile_id: string
          remarks?: boolean
          school_id: string
          updated_at?: string
        }
        Update: {
          absences?: boolean
          announcements?: boolean
          grades?: boolean
          profile_id?: string
          remarks?: boolean
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_preferences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failures: number
          id: string
          last_success_at: string | null
          p256dh: string
          profile_id: string
          school_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failures?: number
          id?: string
          last_success_at?: string | null
          p256dh: string
          profile_id: string
          school_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failures?: number
          id?: string
          last_success_at?: string | null
          p256dh?: string
          profile_id?: string
          school_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_cards: {
        Row: {
          average: number | null
          class_average: number | null
          class_max: number | null
          class_min: number | null
          created_at: string
          id: string
          missing: number
          periods: Json
          publication_id: string
          rank: number | null
          ranked: number | null
          scale: number
          school_id: string
          student_id: string
          subjects: Json
        }
        Insert: {
          average?: number | null
          class_average?: number | null
          class_max?: number | null
          class_min?: number | null
          created_at?: string
          id?: string
          missing?: number
          periods?: Json
          publication_id: string
          rank?: number | null
          ranked?: number | null
          scale: number
          school_id: string
          student_id: string
          subjects?: Json
        }
        Update: {
          average?: number | null
          class_average?: number | null
          class_max?: number | null
          class_min?: number | null
          created_at?: string
          id?: string
          missing?: number
          periods?: Json
          publication_id?: string
          rank?: number | null
          ranked?: number | null
          scale?: number
          school_id?: string
          student_id?: string
          subjects?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_publication_fkey"
            columns: ["publication_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grade_publications"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_key: string
          role_id: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          permission_key: string
          role_id: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          permission_key?: string
          role_id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          key: string
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string
          id: string
          name: string
          room_type: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          id?: string
          name: string
          room_type?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          name?: string
          room_type?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_contacts: {
        Row: {
          phone: string | null
          school_id: string
          updated_at: string
          updated_by: string | null
          whatsapp: string | null
        }
        Insert: {
          phone?: string | null
          school_id: string
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Update: {
          phone?: string | null
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_contacts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_days: {
        Row: {
          academic_year_id: string
          created_at: string
          day_of_week: number
          school_id: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          day_of_week: number
          school_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          day_of_week?: number
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_days_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      school_modules: {
        Row: {
          created_at: string
          enabled: boolean
          module_key: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled: boolean
          module_key: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          module_key?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "school_modules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_subscriptions: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          max_admins_override: number | null
          max_students_override: number | null
          plan_id: string
          school_id: string
          start_date: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          max_admins_override?: number | null
          max_students_override?: number | null
          plan_id: string
          school_id: string
          start_date?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          max_admins_override?: number | null
          max_students_override?: number | null
          plan_id?: string
          school_id?: string
          start_date?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          is_demo: boolean
          logo_url: string | null
          name: string
          phone: string | null
          settings: Json
          slug: string
          status: string
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          settings?: Json
          slug: string
          status?: string
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          settings?: Json
          slug?: string
          status?: string
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_enrollments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_class_fkey"
            columns: ["class_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "student_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          created_at: string
          guardian_id: string
          relation: string
          school_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          relation: string
          school_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          relation?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_fkey"
            columns: ["guardian_id", "school_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "student_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      student_remarks: {
        Row: {
          academic_year_id: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          read_at: string | null
          read_by: string | null
          school_id: string
          student_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          academic_year_id: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          read_at?: string | null
          read_by?: string | null
          school_id: string
          student_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          academic_year_id?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          read_at?: string | null
          read_by?: string | null
          school_id?: string
          student_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_remarks_author_fkey"
            columns: ["created_by", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "student_remarks_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_remarks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_remarks_student_fkey"
            columns: ["student_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "student_remarks_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      students: {
        Row: {
          birth_date: string
          code_massar: string | null
          created_at: string
          first_name: string
          first_name_ar: string | null
          gender: string
          id: string
          last_name: string
          last_name_ar: string | null
          photo_path: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          birth_date: string
          code_massar?: string | null
          created_at?: string
          first_name: string
          first_name_ar?: string | null
          gender: string
          id?: string
          last_name: string
          last_name_ar?: string | null
          photo_path?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          birth_date?: string
          code_massar?: string | null
          created_at?: string
          first_name?: string
          first_name_ar?: string | null
          gender?: string
          id?: string
          last_name?: string
          last_name_ar?: string | null
          photo_path?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_coefficients: {
        Row: {
          academic_year_id: string
          coefficient: number
          controls_count: number | null
          id: string
          level_id: string
          position: number
          school_id: string
          subject_id: string
          track_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          academic_year_id: string
          coefficient: number
          controls_count?: number | null
          id?: string
          level_id: string
          position?: number
          school_id: string
          subject_id: string
          track_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string
          coefficient?: number
          controls_count?: number | null
          id?: string
          level_id?: string
          position?: number
          school_id?: string
          subject_id?: string
          track_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subject_coefficients_level_fkey"
            columns: ["level_id", "school_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "subject_coefficients_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_coefficients_subject_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "subject_coefficients_track_fkey"
            columns: ["track_id", "level_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id", "level_id"]
          },
          {
            foreignKeyName: "subject_coefficients_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_coefficients_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          color: string
          created_at: string
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          color?: string
          created_at?: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          color?: string
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_reminders: {
        Row: {
          created_at: string
          days_left: number
          last_day: string
          school_id: string
          step: number
          subscription_id: string
        }
        Insert: {
          created_at?: string
          days_left: number
          last_day: string
          school_id: string
          step: number
          subscription_id: string
        }
        Update: {
          created_at?: string
          days_left?: number
          last_day?: string
          school_id?: string
          step?: number
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_reminders_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_reminders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "school_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_subjects: {
        Row: {
          created_at: string
          school_id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          school_id: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          school_id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_subject_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "teacher_subjects_teacher_fkey"
            columns: ["teacher_id", "school_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      time_slots: {
        Row: {
          academic_year_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          kind: string
          label: string | null
          school_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          kind?: string
          label?: string | null
          school_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          kind?: string
          label?: string | null
          school_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_slots_day_fkey"
            columns: ["school_id", "academic_year_id", "day_of_week"]
            isOneToOne: false
            referencedRelation: "school_days"
            referencedColumns: ["school_id", "academic_year_id", "day_of_week"]
          },
          {
            foreignKeyName: "time_slots_year_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      tracks: {
        Row: {
          created_at: string
          id: string
          level_id: string
          name: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          level_id: string
          name: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          level_id?: string
          name?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_level_fkey"
            columns: ["level_id", "school_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "tracks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      class_averages: {
        Args: { p_class: string }
        Returns: {
          absences: number
          average: number
          class_average: number
          class_max: number
          class_min: number
          coefficient: number
          marks: number
          missing: number
          period_id: string
          rank: number
          ranked: number
          student_id: string
          subject_id: string
        }[]
      }
      copy_class_lessons: {
        Args: { p_apply?: boolean; p_from_class: string; p_to_class: string }
        Returns: {
          source_lesson_id: string
          status: string
          target_slot_id: string
        }[]
      }
      copy_grading_from_year: {
        Args: { p_apply: boolean; p_from_year: string; p_to_year: string }
        Returns: {
          kind: string
          level_id: string
          status: string
          subject_id: string
          track_id: string
        }[]
      }
      copy_level_coefficients: {
        Args: {
          p_apply: boolean
          p_from_level: string
          p_from_track: string
          p_to_levels: string[]
          p_year: string
        }
        Returns: {
          status: string
          subject_id: string
          to_level_id: string
        }[]
      }
      copy_time_slots: {
        Args: { p_from_year: string; p_to_year: string }
        Returns: number
      }
      create_announcement: {
        Args: {
          p_audience: string
          p_body: string
          p_class_ids?: string[]
          p_level_ids?: string[]
          p_scope: string
          p_title: string
        }
        Returns: string
      }
      grade_level_rules: {
        Args: { p_year: string }
        Returns: {
          absent_as_zero: boolean
          activities: boolean
          activities_weight: number
          controls_count: number
          customised: boolean
          level_id: string
          ranking: string
          rounding: string
          scale: number
        }[]
      }
      import_students: { Args: { p_rows: Json }; Returns: number }
      my_school_suspension: { Args: never; Returns: string }
      publish_grades: {
        Args: { p_class: string; p_period: string; p_show_rank?: boolean }
        Returns: number
      }
      push_claim: {
        Args: { p_limit?: number }
        Returns: {
          data: Json
          locale: string
          notification_id: string
          outbox_id: number
          student: Json
          student_id: string
          subscriptions: Json
          type: string
        }[]
      }
      push_done: {
        Args: {
          p_failed?: string[]
          p_gone?: string[]
          p_ok?: string[]
          p_outbox: number[]
        }
        Returns: undefined
      }
      run_absence_notifications: { Args: { p_now?: string }; Returns: number }
      run_daily_alerts: { Args: { p_today: string }; Returns: number }
      run_demo_reset: { Args: { p_school: string }; Returns: string }
      run_subscription_reminders: {
        Args: { p_schools: string[]; p_today: string }
        Returns: number
      }
      run_trial_expiry: {
        Args: { p_now: string; p_schools: string[] }
        Returns: number
      }
      save_attendance: {
        Args: { p_date: string; p_lesson: string; p_marks?: Json }
        Returns: string
      }
      save_grades: {
        Args: { p_cells: Json; p_period: string; p_subject: string }
        Returns: number
      }
      save_push_preferences: {
        Args: {
          p_absences: boolean
          p_announcements: boolean
          p_grades?: boolean
          p_remarks: boolean
        }
        Returns: undefined
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: string
      }
      save_subject_coefficients: {
        Args: { p_cells: Json; p_year: string }
        Returns: number
      }
      school_clock: {
        Args: { p_at?: string }
        Returns: {
          local_date: string
          local_time: string
          weekday: number
        }[]
      }
      school_usage: {
        Args: never
        Returns: {
          admins: number
          max_admins: number
          max_students: number
          students: number
        }[]
      }
      swap_lessons: { Args: { p_a: string; p_b: string }; Returns: undefined }
      timetable_teachers: {
        Args: { p_year?: string }
        Returns: {
          active: boolean
          full_name: string
          id: string
        }[]
      }
      unpublish_grades: { Args: { p_publication: string }; Returns: undefined }
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
