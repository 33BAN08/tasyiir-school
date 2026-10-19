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
          logo_url: string | null
          name: string
          phone: string | null
          settings: Json
          slug: string
          status: string
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          settings?: Json
          slug: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          settings?: Json
          slug?: string
          status?: string
          suspended_at?: string | null
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
      copy_class_lessons: {
        Args: { p_apply?: boolean; p_from_class: string; p_to_class: string }
        Returns: {
          source_lesson_id: string
          status: string
          target_slot_id: string
        }[]
      }
      copy_time_slots: {
        Args: { p_from_year: string; p_to_year: string }
        Returns: number
      }
      import_students: { Args: { p_rows: Json }; Returns: number }
      run_absence_notifications: { Args: { p_now?: string }; Returns: number }
      run_daily_alerts: { Args: { p_today: string }; Returns: number }
      run_subscription_reminders: {
        Args: { p_schools: string[]; p_today: string }
        Returns: number
      }
      save_attendance: {
        Args: { p_date: string; p_lesson: string; p_marks?: Json }
        Returns: string
      }
      school_clock: {
        Args: { p_at?: string }
        Returns: {
          local_date: string
          local_time: string
          weekday: number
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
