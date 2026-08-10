from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase

from fastapi import HTTPException

from signer import main


class FakeInfo:
    name_to_coin = {"XRP": "XRP"}
    coin_to_asset = {"XRP": 0}
    asset_to_sz_decimals = {0: 0}

    @staticmethod
    def all_mids():
        return {"XRP": "1.07695"}


class NormalizeOrderSizeTests(TestCase):
    def setUp(self):
        self.previous_settings = main.settings_cache
        main.settings_cache = main.Settings(
            account_address="0x0000000000000000000000000000000000000001",
            api_wallet_address="0x0000000000000000000000000000000000000002",
            api_wallet_private_key="unused",
            auth_token="x" * 32,
            credential_encryption_key=b"0" * 43 + b"=",
            database_path=Path("unused.db"),
            enable_testnet_proof=False,
            mainnet_max_order_size_xrp=Decimal("100"),
            min_hedge_size_xrp=Decimal("0"),
            min_order_notional_usd=Decimal("10"),
            max_order_size_xrp=Decimal("1000"),
            max_slippage_bps=100,
            network="mainnet",
            proof_market="BTC",
            proof_max_notional_usd=Decimal("20"),
            proof_size=Decimal("0.0002"),
            redis_token="unused",
            redis_url="https://redis.invalid",
            testnet_markets=frozenset({"BTC", "ETH", "SOL"}),
            testnet_max_order_sizes={},
        )
        self.exchange = SimpleNamespace(info=FakeInfo())

    def tearDown(self):
        main.settings_cache = self.previous_settings

    def test_tiny_xrp_size_returns_structured_minimum_error(self):
        with self.assertRaises(HTTPException) as raised:
            main.normalize_order_size(
                self.exchange,
                "XRP",
                "mainnet",
                Decimal("0.012068"),
            )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(
            raised.exception.detail["code"],
            "HYPERLIQUID_SIZE_TOO_SMALL",
        )
        self.assertEqual(
            raised.exception.detail["effectiveMinimumSize"],
            "10",
        )
        self.assertEqual(raised.exception.detail["roundedSize"], "0")
        self.assertEqual(raised.exception.detail["szDecimals"], 0)

    def test_xrp_size_rounds_down_to_whole_units(self):
        normalized = main.normalize_order_size(
            self.exchange,
            "XRP",
            "mainnet",
            Decimal("10.9"),
        )

        self.assertEqual(normalized, Decimal("10"))

    def test_configured_minimum_can_raise_effective_minimum(self):
        with self.assertRaises(HTTPException) as raised:
            main.normalize_order_size(
                self.exchange,
                "XRP",
                "mainnet",
                Decimal("20"),
                Decimal("25"),
            )

        self.assertEqual(
            raised.exception.detail["effectiveMinimumSize"],
            "25",
        )
