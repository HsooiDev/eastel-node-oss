"use client";

import { ChatWidget } from "@/components/chat-widget";
import { PlanRecommenderFloat } from "@/components/layout/plan-recommender-float";

export function ConditionalChatWidget() {
  return (
    <>
      <PlanRecommenderFloat />
      <ChatWidget />
    </>
  );
}
