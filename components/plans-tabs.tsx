import { t } from '@/lib/i18n';
import { MONTHLY_PLANS, ONETIME_PLANS } from '@/lib/plans-data';
import { PlanCard } from '@/components/plans/plan-card';

interface PlansTabsProps {
  translations: Record<string, string>;
  locale: string;
}

export function PlansTabs({ translations, locale }: PlansTabsProps) {
  return (
    <div>
      {/* Monthly Plans */}
      <div className="plans-tab-row" role="presentation">
        <span className="plans-tab-btn" aria-selected="true" style={{ cursor: 'default', pointerEvents: 'none' }}>
          {t(translations, 'home.plans.tab.monthly', 'Monthly Plans')}
        </span>
      </div>

      <div
        className="plans-monthly-grid"
        style={{ scrollbarWidth: 'none', marginBottom: '56px' }}
      >
        {MONTHLY_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} locale={locale} translations={translations} />
        ))}
      </div>

      {/* One-Time Purchase */}
      <div className="plans-tab-row" role="presentation">
        <span className="plans-tab-btn" aria-selected="true" style={{ cursor: 'default', pointerEvents: 'none' }}>
          {t(translations, 'home.plans.tab.onetime', 'One-Time Purchase')}
        </span>
      </div>

      <div
        className="plans-onetime-grid"
        style={{ scrollbarWidth: 'none' }}
      >
        {ONETIME_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} locale={locale} translations={translations} />
        ))}
      </div>
    </div>
  );
}
