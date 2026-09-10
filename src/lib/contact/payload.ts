/**
 * Contract of a submission to /api/contact, as posted by the public contact
 * form (mode "contact") and the project planner (mode "project_planner").
 * Shared by the API route and the admin, which reads planner submissions in
 * exactly this shape. Changing it changes the public payload.
 */
export type ContactPayload = {
  mode?: "contact" | "project_planner";
  locale?: "en" | "nl";
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message: string;
  website?: string;
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
