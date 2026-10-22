export interface Review {
  id?: number;
  name: string;
  date: string;
  rating: number;
  text: string;
}

// Historical sample testimonials have no verifiable purchase provenance.
// Empty fallback preserves the approved-review API without inventing feedback.
export const PUBLIC_REVIEWS: Review[] = [];

export interface License {
  issuer: string;
  title: string;
  description: string;
  icon: string;
  image?: string;
}

export const LICENSES: License[] = [
  {
    issuer: "SKMM Malaysia",
    title: "Network Service Provider (NSP) License",
    description:
      "Eastel Network Service Provider document.",
    icon: "shield",
    image: "/images/eastel-certificates.jpg",
  },
  {
    issuer: "SKMM Malaysia",
    title: "Application Service Provider (ASP) License",
    description:
      "Eastel Application Service Provider document.",
    icon: "radio",
    image: "/images/asp-licence.jpg",
  },
  {
    issuer: "Masyref Advisor",
    title: "Shariah Certification",
    description:
      "Eastel Shariah certification document.",
    icon: "star",
    image: "/images/shariah-certificate.jpg",
  },
];
