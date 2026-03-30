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

export interface SlotSearchResponse {
  results: {
    venues: ResyVenueEntry[];
  };
}

export interface ExistingReservationEntry {
  venue?: {
    id?: number | string;
  };
}

export interface ExistingReservationsResponse {
  reservations: ExistingReservationEntry[];
}

export interface BookingTokenResponse {
  book_token: {
    value: string;
  };
}

export interface BookingResponse {
  resy_token?: string;
}
