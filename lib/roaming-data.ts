export interface RoamingPlan {
  id: string;
  name: string;
  price: string;
  priceNumeric: number;
  data: string;
  validity: string;
  countries: string[];
  hotspot: string;
  voiceSmsIncluded: boolean;
}

// Source: owner-supplied Eastel App screenshots (2026-10-07). Global 10 lists nine destinations in the App.
// Keep this list separate from purchaseable SIM plans until the roaming
// purchase/API contract is migrated and verified.
export const ROAMING_PLANS: RoamingPlan[] = [
  {
    id: "ez-roam-7d",
    name: "EZ Roam 7D",
    price: "RM30",
    priceNumeric: 30,
    data: "7GB",
    validity: "7 Days",
    countries: ["Hong Kong", "Singapore", "Thailand", "Russia"],
    hotspot: "Full Hotspot",
    voiceSmsIncluded: false,
  },
  {
    id: "ez-roam-15d",
    name: "EZ Roam 15D",
    price: "RM50",
    priceNumeric: 50,
    data: "14GB",
    validity: "15 Days",
    countries: ["Hong Kong", "Singapore", "Thailand", "Russia"],
    hotspot: "Full Hotspot",
    voiceSmsIncluded: false,
  },
  {
    id: "ez-roam-30d",
    name: "EZ Roam 30D",
    price: "RM75",
    priceNumeric: 75,
    data: "25GB",
    validity: "30 Days",
    countries: ["Hong Kong", "Singapore", "Thailand", "Russia"],
    hotspot: "Full Hotspot",
    voiceSmsIncluded: false,
  },
  {
    id: "ez-roam-explorer-16-7d",
    name: "EZ Roam Explorer 16 7D",
    price: "RM50",
    priceNumeric: 50,
    data: "6GB",
    validity: "7 Days",
    countries: [
      "Australia", "Austria", "Bahrain", "Denmark", "France", "Iceland",
      "Indonesia", "Macau", "Nepal", "Poland", "South Korea", "Sri Lanka",
      "Sweden", "Taiwan", "Vietnam", "Uzbekistan",
    ],
    hotspot: "Full Hotspot",
    voiceSmsIncluded: false,
  },
  {
    id: "ez-roam-explorer-16-15d",
    name: "EZ Roam Explorer 16 15D",
    price: "RM99",
    priceNumeric: 99,
    data: "15GB",
    validity: "15 Days",
    countries: [
      "Australia", "Austria", "Bahrain", "Denmark", "France", "Iceland",
      "Indonesia", "Macau", "Nepal", "Poland", "South Korea", "Sri Lanka",
      "Sweden", "Taiwan", "Vietnam", "Uzbekistan",
    ],
    hotspot: "Full Hotspot",
    voiceSmsIncluded: false,
  },
  {
    id: "ez-roam-global-10",
    name: "EZ Roam Global 10 Plan",
    price: "RM80",
    priceNumeric: 80,
    data: "5GB",
    validity: "7 Days",
    countries: [
      "Chile", "China", "Colombia", "Costa Rica",
      "El Salvador", "Kazakhstan", "Peru", "Uruguay", "Venezuela",
    ],
    hotspot: "Full Hotspot",
    voiceSmsIncluded: false,
  },
];

export const FREE_ROAMING_PLANS = [
  { name: "EZ50", data: "3GB" },
  { name: "EZ68", data: "5GB" },
  { name: "EZ98", data: "10GB" },
] as const;
