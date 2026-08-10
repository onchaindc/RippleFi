"use client";

import { ActivityPageLayout } from "@/components/ActivityPageLayout";
import { FirelightLiquidityNotice } from "@/components/FirelightLiquidityNotice";
import { PaymentRequestCreator } from "@/components/PaymentRequestCreator";
import { SpendPay } from "@/components/SpendPay";
import { useFirelight } from "@/hooks/useFirelight";
import { useVault } from "@/hooks/useVault";

export default function SpendPage() {
  const vault = useVault();
  const firelight = useFirelight();

  return (
    <ActivityPageLayout
      accent="gold"
      activityScope="spend"
      eyebrow="Payments"
      title="Spend / Pay"
      vault={vault}
      description="Send FXRP from your available balance or vault position."
      metrics={[
        {
          label: "Available FXRP",
          value: vault.fxrpBalance,
          suffix: "FXRP",
        },
        {
          label: "Vault assets",
          value: vault.vaultAssets,
          suffix: "FXRP",
        },
      ]}
    >
      <FirelightLiquidityNotice context="spend" firelight={firelight} />
      <SpendPay vault={vault} />
      <PaymentRequestCreator vault={vault} />
    </ActivityPageLayout>
  );
}
