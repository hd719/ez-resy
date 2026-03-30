export function convertTimeToTwelveHourFormat(time: string): string {
  const timeString = time.split(' ')[1];
  const [hourString, minutes] = timeString.split(':');
  const hour = Number(hourString);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minutes} ${suffix}`;
}

export function convertDateToLongFormat(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const dateObject = new Date(year, month - 1, day);

  return dateObject.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function isTimeBetween(
  startTime: string,
  endTime: string,
  dateString: string,
): boolean {
  const targetTime = dateString.split(' ')[1];

  const convertToMinutes = (timeValue: string): number => {
    const [hours, minutes] = timeValue.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const startMinutes = convertToMinutes(startTime);
  const endMinutes = convertToMinutes(endTime);
  const targetMinutes = convertToMinutes(targetTime);

  return targetMinutes >= startMinutes && targetMinutes <= endMinutes;
}

export function checkTokenExpiration(token: string | undefined): boolean {
  if (!token) {
    console.error('JWT token not found in the AUTH_TOKEN environment variable');
    return false;
  }

  try {
    const decoded = decodeJwtPayload(token);

    if (!decoded) {
      console.error('JWT decoding failed');
      return false;
    }

    if (typeof decoded.exp !== 'number') {
      console.error('JWT expiration claim is missing');
      return false;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeUntilExpiration = decoded.exp - currentTimestamp;
    const expirationDate = new Date(decoded.exp * 1000);

    if (timeUntilExpiration <= 0) {
      console.log('JWT has already expired');
      return false;
    }

    console.log(`JWT will expire on ${expirationDate}`);
    return true;
  } catch (error: unknown) {
    console.error('JWT decoding failed:', error);
    return false;
  }
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split('.');

  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

    const decodedPayload = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decodedPayload) as { exp?: number };
  } catch {
    return null;
  }
}
