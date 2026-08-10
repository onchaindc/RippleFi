"use client";

import { ActivityPageLayout } from "@/components/ActivityPageLayout";
import { DepositForm } from "@/components/DepositForm";
import { YieldStrategyPanel } from "@/components/YieldStrategyPanel";
import { useFirelight } from "@/hooks/useFirelight";
import { useVault } from "@/hooks/useVault";
import { useYieldStrategySelection } from "@/hooks/useYieldStrategySelection";

export default function DepositPage() {
  const vault = useVault();
  const firelight = useFirelight();
  const strategy = useYieldStrategySelection();
  const selectedIsFirelight =
    firelight.isAvailable && strategy.selectedStrategy === "firelight";

  return (
    <ActivityPageLayout
      accent="green"
      activityScope="deposit"
      eyebrow="Earn with FXRP"
      title="Deposit FXRP"
      vault={vault}
      description={
        selectedIsFirelight
          ? "Stake FXRP with Firelight and receive stXRP."
          : "Deposit into RippleFI and keep your position ready to withdraw or spend."
      }
      metrics={[
        {
          label: "Available to deposit",
          value: vault.fxrpBalance,
          suffix: "FXRP",
        },
        {
          label: selectedIsFirelight
            ? "Firelight position"
            : "RippleFI vault",
          value: selectedIsFirelight ? firelight.assets : vault.vaultAssets,
          suffix: selectedIsFirelight ? "FXRP value" : "FXRP",
        },
      ]}
    >
      <YieldStrategyPanel
        firelight={firelight}
        selectedStrategy={strategy.selectedStrategy}
        setStrategy={strategy.setStrategy}
        variant="deposit"
        vault={vault}
      />
      <DepositForm
        firelight={firelight}
        strategy={strategy.selectedStrategy}
        vault={vault}
      />
    </ActivityPageLayout>
  );
}
