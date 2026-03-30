export interface ResySlotDate {
  start: string;
}

export interface ResySlotConfig {
  token: string;
  type: string;
}

export interface ResySlot {
  date: ResySlotDate;
  config: ResySlotConfig;
}

export interface ResyVenueInfo {
  id: number | string;
  name: string;
}

export interface ResyVenueEntry {
  venue: ResyVenueInfo;
  slots: ResySlot[];
}

export interface SearchTarget {
  venueId: string;
  date: string;
}

export interface SearchSelection {
  venueId: string;
  date: string;
  slotToken: string;
  venueName?: string;
}

export interface ResolvedSearchPlan {
  venueIds: string[];
  dates: string[];
  targets: SearchTarget[];
}

export interface SlotSearchResponse {
  results: {
    venues: ResyVenueEntry[];
  };
}

export interface ExistingReservationEntry {
  date?: string;
  reservation_date?: string;
  service_date?: string;
  venue?: {
    id?: number | string;
  };
  reservation?: {
    date?: string;
    reservation_date?: string;
    service_date?: string;
    venue?: {
      id?: number | string;
    };
  };
}

export interface ExistingReservationsResponse {
  reservations: ExistingReservationEntry[];
}

export interface BookingSearchOptions {
  venueIds?: string[];
  dates?: string[];
}

export interface BookingTokenResponse {
  book_token: {
    value: string;
  };
}

export interface BookingResponse {
  resy_token?: string;
}

export interface VenueCalendarDay {
  date: string;
  inventory?: {
    reservation?: string;
    event?: string;
    'walk-in'?: string;
  };
}

export interface VenueCalendarResponse {
  scheduled?: VenueCalendarDay[];
  last_calendar_day?: string;
}

export interface VenueConfigResponse {
  calendar_date_to?: string;
}
