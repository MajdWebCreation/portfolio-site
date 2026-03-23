import type { MetadataRoute } from "next";
import { getPublishedArticlePaths } from "@/lib/content/blog";
import { getLocalizedPath } from "@/lib/content/routes";
import { serviceDefinitions, serviceKeys } from "@/lib/content/services";
import { businessInfo } from "@/lib/content/site-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("en", "home")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "home")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "home")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "home")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "home")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "home")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("en", "services")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "services")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "services")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "services")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "services")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "services")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("en", "pricing")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "pricing")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "pricing")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "pricing")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "pricing")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "pricing")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("en", "projects")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "projects")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "projects")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "projects")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "projects")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "projects")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("en", "contact")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "contact")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "contact")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "contact")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "contact")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "contact")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("en", "blog")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "blog")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "blog")}`,
        },
      },
    },
    {
      url: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "blog")}`,
      alternates: {
        languages: {
          en: `${businessInfo.websiteUrl}${getLocalizedPath("en", "blog")}`,
          nl: `${businessInfo.websiteUrl}${getLocalizedPath("nl", "blog")}`,
        },
      },
    },
  ];

  const serviceEntries: MetadataRoute.Sitemap = serviceKeys.flatMap((key) => {
    const definition = serviceDefinitions[key];
    const en = `/en/services/${definition.locale.en.slug}`;
    const nl = `/nl/diensten/${definition.locale.nl.slug}`;

    return [
      {
        url: `${businessInfo.websiteUrl}${en}`,
        alternates: {
          languages: {
            en: `${businessInfo.websiteUrl}${en}`,
            nl: `${businessInfo.websiteUrl}${nl}`,
          },
        },
      },
      {
        url: `${businessInfo.websiteUrl}${nl}`,
        alternates: {
          languages: {
            en: `${businessInfo.websiteUrl}${en}`,
            nl: `${businessInfo.websiteUrl}${nl}`,
          },
        },
      },
    ];
  });

  const articleEntries: MetadataRoute.Sitemap = getPublishedArticlePaths("nl").map(
    (path) => ({
      url: `${businessInfo.websiteUrl}${path}`,
    }),
  );

  return [...staticEntries, ...serviceEntries, ...articleEntries];
}
