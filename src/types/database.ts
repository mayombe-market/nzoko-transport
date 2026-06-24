// Types générés depuis le schéma Supabase
// À régénérer avec : npx supabase gen types typescript --local > src/types/database.ts

export interface Database {
  public: {
    Tables: {
      company: {
        Row: {
          id: string;
          name: string;
          slogan: string | null;
          logo_url: string | null;
          color_primary: string;
          color_accent: string;
          phone_mtn: string | null;
          phone_airtel: string | null;
          email: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["company"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["company"]["Row"]>;
      };
      cities: {
        Row: {
          id: string;
          name: string;
          region: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["cities"]["Row"], "created_at" | "is_active">;
        Update: Partial<Database["public"]["Tables"]["cities"]["Row"]>;
      };
      corridors: {
        Row: {
          id: string;
          label: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["corridors"]["Row"], "created_at" | "is_active">;
        Update: Partial<Database["public"]["Tables"]["corridors"]["Row"]>;
      };
      corridor_stops: {
        Row: {
          id: string;
          corridor_id: string;
          city_id: string;
          stop_order: number;
          offset_minutes: number;
          distance_km: number;
          price_from_start: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["corridor_stops"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["corridor_stops"]["Row"]>;
      };
      buses: {
        Row: {
          id: string;
          name: string;
          bus_type: "coach" | "minibus";
          seats_per_row: number;
          rows: number;
          back_row_seats: number;
          amenities: string[];
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["buses"]["Row"], "id" | "created_at" | "is_active">;
        Update: Partial<Database["public"]["Tables"]["buses"]["Row"]>;
      };
      services: {
        Row: {
          id: string;
          corridor_id: string;
          bus_id: string | null;
          departure_times: string[];
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["services"]["Row"], "id" | "created_at" | "is_active">;
        Update: Partial<Database["public"]["Tables"]["services"]["Row"]>;
      };
      trips: {
        Row: {
          id: string;
          service_id: string;
          date: string;
          departure_time: string;
          status: "scheduled" | "boarding" | "departed" | "arrived" | "cancelled";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["trips"]["Row"], "id" | "created_at" | "status">;
        Update: Partial<Database["public"]["Tables"]["trips"]["Row"]>;
      };
      bookings: {
        Row: {
          id: string;
          reference: string;
          trip_id: string | null;
          corridor_id: string | null;
          from_city: string | null;
          to_city: string | null;
          date: string;
          departure_time: string;
          total_price: number;
          passenger_count: number;
          status: "pending" | "confirmed" | "cancelled" | "completed";
          customer_phone: string | null;
          customer_email: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["bookings"]["Row"], "id" | "created_at" | "status">;
        Update: Partial<Database["public"]["Tables"]["bookings"]["Row"]>;
      };
      passengers: {
        Row: {
          id: string;
          booking_id: string;
          full_name: string;
          phone: string | null;
          seat_number: number | null;
          is_primary: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["passengers"]["Row"], "id" | "created_at" | "is_primary">;
        Update: Partial<Database["public"]["Tables"]["passengers"]["Row"]>;
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          method: "mtn" | "airtel";
          amount: number;
          transaction_code: string | null;
          phone_sender: string | null;
          status: "pending" | "confirmed" | "rejected";
          confirmed_by: string | null;
          confirmed_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payments"]["Row"], "id" | "created_at" | "status">;
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
      };
      agent_profiles: {
        Row: {
          id: string;
          full_name: string;
          role: "admin" | "agent";
          phone: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["agent_profiles"]["Row"], "created_at" | "is_active">;
        Update: Partial<Database["public"]["Tables"]["agent_profiles"]["Row"]>;
      };
    };
  };
}

// Types utilitaires
export type City = Database["public"]["Tables"]["cities"]["Row"];
export type Corridor = Database["public"]["Tables"]["corridors"]["Row"];
export type CorridorStop = Database["public"]["Tables"]["corridor_stops"]["Row"];
export type Bus = Database["public"]["Tables"]["buses"]["Row"];
export type Service = Database["public"]["Tables"]["services"]["Row"];
export type Trip = Database["public"]["Tables"]["trips"]["Row"];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type Passenger = Database["public"]["Tables"]["passengers"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type AgentProfile = Database["public"]["Tables"]["agent_profiles"]["Row"];
export type Company = Database["public"]["Tables"]["company"]["Row"];
