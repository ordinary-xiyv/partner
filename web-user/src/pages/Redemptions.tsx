import React, { useState } from 'react';
import { Card, Tabs, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { AppPageHeader } from '../ui/appLayout';
import { PagePanel } from '../ui/PagePanel';
import { RedemptionListPanel } from '../components/redemption/RedemptionListPanel';
import { ComplimentaryQuotaListPanel } from '../components/complimentary-quota/ComplimentaryQuotaListPanel';

type TabKey = 'redemptions' | 'gift';

export default function Redemptions() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [activeTab, setActiveTab] = useState<TabKey>('redemptions');

  return (
    <div>
      <AppPageHeader
        title={t('redemptions')}
        subtitle={t('marketingBenefits.subtitle')}
      />

      <PagePanel padded={false}>
        <Card size="small" bordered={false} styles={{ body: { padding: 0 } }}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as TabKey)}
            size="middle"
            tabBarGutter={token.marginLG}
            tabBarStyle={{
              margin: 0,
              padding: `${token.paddingMD}px ${token.paddingLG}px 0`,
            }}
            items={[
              {
                key: 'redemptions',
                label: t('redemptionCode'),
                children: (
                  <div style={{ padding: token.paddingLG }}>
                    <RedemptionListPanel />
                  </div>
                ),
              },
              {
                key: 'gift',
                label: t('complimentaryQuota.giftCredit'),
                children: (
                  <div style={{ padding: token.paddingLG }}>
                    <ComplimentaryQuotaListPanel />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </PagePanel>
    </div>
  );
}
