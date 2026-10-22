export interface Plan {
  id: string;
  name: string;
  price: string;
  priceNumeric: number;
  data: string;
  hotspot: string;
  roaming: string | null;
  calls: string;
  sms: string;
  validity: string;
  badge?: "popular" | "best-data";
  category: "monthly" | "onetime";
  noteKeys: string[];
  dataPerMonth?: string;
  bwTotal?: string;
  comingSoon?: boolean;
}

export const MONTHLY_PLANS: Plan[] = [
  {
    id: "ez15",
    name: "EZ15",
    price: "RM15",
    priceNumeric: 15,
    data: "30GB",
    hotspot: "Full Hotspot",
    roaming: null,
    calls: "Unlimited",
    sms: "5 SMS",
    validity: "15 Days",
    category: "monthly",
    noteKeys: ["home.plans.note.fairUsage"],
  },
  {
    id: "ez35",
    name: "EZ35",
    price: "RM35",
    priceNumeric: 35,
    data: "200GB",
    hotspot: "100GB Hotspot",
    roaming: null,
    calls: "Unlimited",
    sms: "10 SMS",
    validity: "30 Days",
    category: "monthly",
    bwTotal: "300GB",
    noteKeys: [
      "home.plans.note.carryForward",
      "home.plans.note.fairUsage",
    ],
  },
  {
    id: "ez50",
    name: "EZ50",
    price: "RM50",
    priceNumeric: 50,
    data: "500GB",
    hotspot: "Full Hotspot",
    roaming: "3GB",
    calls: "Unlimited",
    sms: "10 SMS",
    validity: "30 Days",
    badge: "popular",
    category: "monthly",
    noteKeys: [
      "home.plans.note.carryForward",
      "home.plans.note.freeRoaming",
      "home.plans.note.fairUsage",
    ],
  },
  {
    id: "ez68",
    name: "EZ68",
    price: "RM68",
    priceNumeric: 68,
    data: "700GB",
    hotspot: "Full Hotspot",
    roaming: "5GB",
    calls: "Unlimited",
    sms: "10 SMS",
    validity: "30 Days",
    category: "monthly",
    noteKeys: [
      "home.plans.note.carryForward",
      "home.plans.note.freeRoaming",
      "home.plans.note.fairUsage",
    ],
  },
  {
    id: "ez98",
    name: "EZ98",
    price: "RM98",
    priceNumeric: 98,
    data: "999GB",
    hotspot: "Full Hotspot",
    roaming: "10GB",
    calls: "Unlimited",
    sms: "10 SMS",
    validity: "30 Days",
    badge: "best-data",
    category: "monthly",
    noteKeys: [
      "home.plans.note.carryForward",
      "home.plans.note.freeRoaming",
      "home.plans.note.fairUsage",
    ],
  },
];

export const ONETIME_PLANS: Plan[] = [
  {
    id: "ezday",
    name: "EZDAY",
    price: "RM3",
    priceNumeric: 3,
    data: "5GB",
    hotspot: "Full Hotspot",
    roaming: null,
    calls: "30 Mins",
    sms: "",
    validity: "1 Day",
    category: "onetime",
    noteKeys: [],
  },
  {
    id: "ezweek",
    name: "EZWEEK",
    price: "RM7",
    priceNumeric: 7,
    data: "10GB",
    hotspot: "Full Hotspot",
    roaming: null,
    calls: "30 Mins",
    sms: "",
    validity: "7 Days",
    category: "onetime",
    noteKeys: [],
  },
  {
    id: "ezyear",
    name: "EZYEAR",
    price: "RM50",
    priceNumeric: 50,
    data: "12GB",
    hotspot: "Full Hotspot",
    roaming: null,
    calls: "30 Mins/Month",
    sms: "",
    validity: "30 Days x 12",
    dataPerMonth: "1GB/Month",
    category: "onetime",
    noteKeys: [],
    comingSoon: true,
  },
  {
    id: "ez365d",
    name: "EZ365D",
    price: "RM240",
    priceNumeric: 240,
    data: "240GB",
    hotspot: "",
    roaming: null,
    calls: "30 Mins",
    sms: "",
    validity: "365 Days",
    category: "onetime",
    noteKeys: [],
  },
];

export interface BoosterPlan {
  id: string;
  name: string;
  price: string;
  priceNumeric: number;
  data: string;
  description: string;
}

export const BOOSTER_PLANS: BoosterPlan[] = [
  {
    id: "ezplus",
    name: "EZPLUS Booster",
    price: "RM10",
    priceNumeric: 10,
    data: "30GB",
    description:
      "30GB high-speed data, valid for 10 days. Available in the Eastel App.",
  },
  {
    id: "ezroamplus",
    name: "EZROAMPLUS",
    price: "RM35",
    priceNumeric: 35,
    data: "10GB",
    description:
      "10GB roaming data with shared hotspot. Follows the roaming end date. Only works with a Roaming Pass.",
  },
];

// Kept as a compatibility alias for callers that only render the original booster.
export const BOOSTER_PLAN: BoosterPlan = BOOSTER_PLANS[0]!;

export const ALL_PLANS: Plan[] = [...MONTHLY_PLANS, ...ONETIME_PLANS];

export interface WhyFeature {
  titleKey: string;
  descKey: string;
  icon: string;
}

export const WHY_FEATURES: WhyFeature[] = [
  {
    titleKey: "home.why.1.title",
    descKey: "home.why.1.desc",
    icon: "zap",
  },
  {
    titleKey: "home.why.2.title",
    descKey: "home.why.2.desc",
    icon: "globe",
  },
  {
    titleKey: "home.why.3.title",
    descKey: "home.why.3.desc",
    icon: "gift",
  },
  {
    titleKey: "home.why.4.title",
    descKey: "home.why.4.desc",
    icon: "wallet",
  },
  {
    titleKey: "home.why.5.title",
    descKey: "home.why.5.desc",
    icon: "users",
  },
  {
    titleKey: "home.why.6.title",
    descKey: "home.why.6.desc",
    icon: "heart",
  },
];

export interface Stat {
  valueKey: string;
  labelKey: string;
}

export const STATS: Stat[] = [
  { valueKey: "home.stats.1.value", labelKey: "home.stats.1.label" },
  { valueKey: "home.stats.2.value", labelKey: "home.stats.2.label" },
  { valueKey: "home.stats.3.value", labelKey: "home.stats.3.label" },
  { valueKey: "home.stats.4.value", labelKey: "home.stats.4.label" },
];

export interface FaqItem {
  questionKey: string;
  answerKey: string;
}

export interface FaqCategory {
  id: string;
  titleKey: string;
  icon: string;
  items: FaqItem[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "general",
    titleKey: "faq.cat.general",
    icon: "💡",
    items: Array.from({ length: 3 }, (_, i) => ({
      questionKey: `faq.general.q${i + 2}`,
      answerKey: `faq.general.a${i + 2}`,
    })),
  },
  {
    id: "getting-started",
    titleKey: "faq.cat.started",
    icon: "🚀",
    items: Array.from({ length: 4 }, (_, i) => ({
      questionKey: `faq.getting-started.q${i + 1}`,
      answerKey: `faq.getting-started.a${i + 1}`,
    })),
  },
  {
    id: "support",
    titleKey: "faq.cat.support",
    icon: "🛡️",
    items: Array.from({ length: 3 }, (_, i) => ({
      questionKey: `faq.support.q${i + 1}`,
      answerKey: `faq.support.a${i + 1}`,
    })),
  },
];
