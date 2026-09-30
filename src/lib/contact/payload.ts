/**
 * Contract of a submission to /api/contact, as posted by the public contact
 * form (mode "contact"), the project planner (mode "project_planner") and
 * the websitecheck landing page (mode "websitecheck"). Shared by the API
 * route and the admin, which reads planner submissions in exactly this
 * shape. Changing it changes the public payload.
 */
export type ContactMode = "contact" | "project_planner" | "websitecheck";

export type ContactPayload = {
  mode?: ContactMode;
  locale?: "en" | "nl";
  /**
   * Where the visit came from, as the browser classified it
   * (lib/attribution). Optional, untrusted: the route validates it against
   * the same rules and stores nothing when it does not fit exactly.
   */
  attribution?: {
    trafficClass?: string;
    trafficSource?: string | null;
    trafficMedium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
    landingPath?: string;
  };
  /**
   * Google Ads click identifiers from the landing URL (lib/attribution).
   * Optional, untrusted: the route keeps each only when it has the shape of
   * one, and stores them only when the request carries a yes to marketing.
   */
  adClickIds?: { gclid?: string; gbraid?: string; wbraid?: string };
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message: string;
  /** Honeypot. A filled value marks the submission as automated. */
  website?: string;
  /**
   * The website a websitecheck is requested for, as typed. The route
   * normalises it (lib/contact/website-url) and stores the result.
   */
  websiteUrl?: string;
  planner?: {
    projectTypeKey?: string;
    selectedProjectType?: string;
    recommendedPackage?: string;
    reason?: string;
    startingPrice?: string;
    monthlyManagement?: string;
    indicativeRange?: string | null;
    selectedFeatures?: string[];
    selectedAddOns?: string[];
    pageCount?: string;
    multilingualKey?: string;
    multilingual?: string;
    brandingContentState?: string;
    smartScopeSelected?: boolean;
    webshopProducts?: string;
    customScopeSelected?: boolean;
    launchTimelineKey?: string;
    launchTimeline?: string;
    contentReadyKey?: string;
    contentReady?: string;
    brandingReadyKey?: string;
    brandingReady?: string;
    priorityKey?: string;
    priority?: string;
    notes?: string;
    businessDeclaration?: boolean;
  };
};
