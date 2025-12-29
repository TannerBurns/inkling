/**
 * Status of URL content fetching and indexing
 */
export type UrlStatus = "pending" | "fetching" | "indexed" | "error";

/**
 * A URL attachment linked to a note
 */
export interface UrlAttachment {
  id: string;
  noteId: string;
  url: string;
  title: string | null;
  description: string | null;
  content: string | null;
  /** JSON array of outbound links */
  links: string | null;
  /** OG image URL for preview cards */
  imageUrl: string | null;
  /** Favicon URL */
  faviconUrl: string | null;
  /** Site name from og:site_name */
  siteName: string | null;
  fetchedAt: string | null;
  status: UrlStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight URL metadata for preview cards (without full content)
 */
export interface UrlMetadata {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
}

/**
 * A link found on a scraped page
 */
export interface ScrapedLink {
  url: string;
  text: string;
}

/**
 * Progress events emitted during URL indexing
 */
export type UrlIndexingProgress =
  | {
      type: "started";
      urlAttachmentId: string;
      url: string;
      noteId: string;
    }
  | {
      type: "fetching";
      url: string;
    }
  | {
      type: "parsing";
      url: string;
      contentLength: number;
    }
  | {
      type: "embedding";
      url: string;
    }
  | {
      type: "completed";
      urlAttachmentId: string;
      url: string;
      title: string | null;
      contentLength: number;
      linksCount: number;
    }
  | {
      type: "error";
      urlAttachmentId: string;
      url: string;
      error: string;
    };

/**
 * Parse the links JSON from a URL attachment
 */
export function parseUrlLinks(linksJson: string | null): ScrapedLink[] {
  if (!linksJson) return [];
  try {
    return JSON.parse(linksJson) as ScrapedLink[];
  } catch {
    return [];
  }
}

/**
 * Get a display-friendly domain from a URL
 */
export function getUrlDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Get a short display title for a URL attachment
 */
export function getUrlDisplayTitle(attachment: UrlAttachment): string {
  if (attachment.title) {
    return attachment.title;
  }
  return getUrlDomain(attachment.url);
}

/**
 * Check if a URL attachment has been successfully indexed
 */
export function isUrlIndexed(attachment: UrlAttachment): boolean {
  return attachment.status === "indexed" && attachment.content !== null;
}

/**
 * Check if a URL attachment is currently being processed
 */
export function isUrlProcessing(attachment: UrlAttachment): boolean {
  return attachment.status === "pending" || attachment.status === "fetching";
}

/**
 * Check if a URL attachment has an error
 */
export function isUrlError(attachment: UrlAttachment): boolean {
  return attachment.status === "error";
}

