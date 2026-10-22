/** Use for every JSON-LD script, including data loaded from the catalogue. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

interface PageSchemaInput {
  origin: string;
  locale: string;
  path: string;
  title: string;
  description: string;
  homeLabel: string;
  type?: "WebPage" | "FAQPage";
  questions?: { question: string; answer: string }[];
}

/** Describe public content without publishing a business-identity entity. */
export function buildPageSchema(input: PageSchemaInput) {
  const { origin, locale, path, title, description, homeLabel } = input;
  const home = `${origin}/${locale}`;
  const url = `${home}${path ? `/${path}` : ""}`;
  const websiteId = `${origin}/#website`;
  const page = {
    "@type": input.type ?? "WebPage",
    "@id": `${url}#page`,
    url,
    name: title,
    description,
    inLanguage: locale,
    isPartOf: { "@id": websiteId },
    ...(path ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
    ...(input.questions ? {
      mainEntity: input.questions.map(({ question, answer }) => ({
        "@type": "Question", name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    } : {}),
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite", "@id": websiteId,
        name: "eastel.site", url: origin, inLanguage: ["en", "ms", "zh"],
      },
      ...(path ? [{
        "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: homeLabel, item: home },
          { "@type": "ListItem", position: 2, name: title, item: url },
        ],
      }] : []),
      page,
    ],
  };
}

/** Price comes from the same active-product selection as checkout, never a fallback. */
export function buildSimProduct(input: {
  origin: string; locale: string; name: string; description: string; price?: number;
}) {
  const url = `${input.origin}/${input.locale}/order`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${input.origin}/#physical-sim`,
    name: input.name, description: input.description,
    image: `${input.origin}/images/eastel-simcard.webp`,
    brand: { "@type": "Brand", name: "Eastel" },
    url,
    ...(typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0 ? {
      offers: {
        "@type": "Offer", price: input.price.toFixed(2), priceCurrency: "MYR", url,
      },
    } : {}),
  };
}
