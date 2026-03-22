import { businessInfo } from "@/lib/content/site-content";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: businessInfo.name,
    legalName: businessInfo.legalName,
    url: businessInfo.websiteUrl,
    email: businessInfo.email,
    telephone: businessInfo.phone,
    identifier: businessInfo.kvk,
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: businessInfo.name,
    url: businessInfo.websiteUrl,
  };
}

export function webPageSchema(input: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url: input.url,
  };
}

export function collectionPageSchema(input: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: input.url,
  };
}

export function blogSchema(input: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: input.name,
    description: input.description,
    url: input.url,
  };
}

export function serviceSchema(input: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: input.url,
    provider: {
      "@type": "Organization",
      name: businessInfo.name,
      url: businessInfo.websiteUrl,
      email: businessInfo.email,
      telephone: businessInfo.phone,
    },
  };
}

export function creativeWorkSchema(input: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: input.name,
    description: input.description,
    url: input.url,
  };
}

export function blogPostingSchema(input: {
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  authorName?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline,
    description: input.description,
    url: input.url,
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.authorName
      ? {
          author: {
            "@type": "Person",
            name: input.authorName,
          },
        }
      : {}),
    publisher: {
      "@type": "Organization",
      name: businessInfo.name,
      url: businessInfo.websiteUrl,
    },
  };
}
