"use client";

import { ActivityPageLayout } from "@/components/ActivityPageLayout";
import { FirelightLiquidityNotice } from "@/components/FirelightLiquidityNotice";
import { WithdrawForm } from "@/components/WithdrawForm";
import { useFirelight } from "@/hooks/useFirelight";
import { useVault } from "@/hooks/useVault";

export default function WithdrawPage() {
  const vault = useVault();
  const firelight = useFirelight();

  return (
    <ActivityPageLayout
      accent="blue"
      activityScope="withdraw"
      eyebrow="Vault action"
      title="Redeem FXRP"
      vault={vault}
      description="Redeem spend-ready assets from your RippleFI vault back to FXRP."
      metrics={[
        {
          label: "Available to withdraw",
          value: vault.withdrawableAssets,
          suffix: "FXRP",
        },
        {
          label: "Vault shares",
          value: vault.vaultShares,
          suffix: "rFXRP",
        },
      ]}
    >
      <FirelightLiquidityNotice context="withdraw" firelight={firelight} />
      <WithdrawForm vault={vault} />
    </ActivityPageLayout>
  );
}
