export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  shakeSensitivity?: 'low' | 'medium' | 'high';
  customSOSMessage?: string;
  trackingInterval?: number;
  createdAt: string;
}

export interface Guardian {
  id?: string;
  userId: string;
  name: string;
  phoneNumber: string;
  email?: string;
  relationship: string;
}

export interface Alert {
  id?: string;
  userId: string;
  timestamp: string;
  location: {
    latitude: number;
    longitude: number;
  };
  mapsLink: string;
  status: 'active' | 'resolved';
}

export interface Recording {
  id?: string;
  userId: string;
  alertId: string;
  timestamp: string;
  audioUrl: string;
}
