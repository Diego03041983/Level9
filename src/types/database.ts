export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EventStatus = "draft" | "ready" | "live" | "paused" | "finished" | "archived";
export type AdministrativeStatus = "invited" | "active" | "inactive" | "withdrawn";
export type OperationalStatus = "available" | "called" | "competing" | "resting" | "unavailable";
export type StationStatus = "available" | "reserved" | "occupied" | "paused" | "out_of_service";
export type SceneStatus = "queued" | "delivered" | "playing" | "played" | "skipped" | "expired" | "failed" | "cancelled";

type RowMap<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface EventRow {
  id: string;
  name: string;
  subtitle: string | null;
  celebrant_name: string;
  celebrant_age: number | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: EventStatus;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParticipantRow {
  id: string;
  event_id: string;
  first_name: string;
  last_name: string | null;
  gamer_tag: string | null;
  player_number: number;
  avatar_key: string | null;
  photo_path: string | null;
  is_celebrant: boolean;
  administrative_status: AdministrativeStatus;
  operational_status: OperationalStatus;
  arrived_at: string | null;
  departed_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityRow {
  id: string;
  event_id: string;
  slug: string;
  name: string;
  activity_type: "fifa" | "roblox" | "foosball" | "mission" | "custom";
  status: "draft" | "ready" | "live" | "paused" | "finished" | "cancelled";
  enabled: boolean;
  rules: Json;
  created_at: string;
  updated_at: string;
}

export interface StationRow {
  id: string;
  event_id: string;
  code: string;
  name: string;
  station_type: "playstation" | "pc" | "foosball" | "mission" | "other";
  capacity: number;
  status: StationStatus;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface SceneEventRow {
  id: string;
  event_id: string;
  scene_type: string;
  payload: Json;
  priority: number;
  duration_ms: number | null;
  scheduled_at: string;
  sound: Json;
  animation: Json;
  interrupt_policy: "queue" | "interrupt_lower" | "force" | "overlay";
  status: SceneStatus;
  target_device_id: string | null;
  idempotency_key: string;
  created_by: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      events: RowMap<EventRow>;
      participants: RowMap<ParticipantRow>;
      activities: RowMap<ActivityRow>;
      stations: RowMap<StationRow>;
      scene_events: RowMap<SceneEventRow>;
    } & Record<string, RowMap<Record<string, unknown>>>;
    Views: Record<string, never>;
    Functions: {
      reserve_station: {
        Args: {
          target_event: string;
          target_station: string;
          participant_ids: string[];
          assignment_context_type: string;
          assignment_context_id?: string | null;
        };
        Returns: Record<string, unknown>[];
      };
      validate_mission_code: {
        Args: { target_mission: string; submitted_code: string; target_device?: string | null };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

