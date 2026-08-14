"""Close-order coverage for the Hyperliquid signer.

Pins the behaviour of /v1/orders/close: it must sign the reduce-only
market_close with the requesting user's own stored API wallet and never with
the shared operator key, and it must reuse the same idempotency store.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from signer import main  # noqa: E402

FERNET_KEY = "0" * 43 + "="


def _set_env(**values: str) -> None:
    for name, value in values.items():
        os.environ[name] = value


def _clear_env(names: list[str]) -> None:
    for name in names:
        os.environ.pop(name, None)


class CloseOrderTests(unittest.TestCase):
    def setUp(self) -> None:
        _set_env(
            HYPERLIQUID_NETWORK="testnet",
            HYPERLIQUID_SIGNER_AUTH_TOKEN="t" * 40,
            HYPERLIQUID_CREDENTIAL_ENCRYPTION_KEY=FERNET_KEY,
            UPSTASH_REDIS_REST_URL="https://redis.invalid",
            UPSTASH_REDIS_REST_TOKEN="token",
        )
        _clear_env(
            [
                "HYPERLIQUID_ACCOUNT_ADDRESS",
                "HYPERLIQUID_API_WALLET_ADDRESS",
                "HYPERLIQUID_API_WALLET_PRIVATE_KEY",
            ]
        )
        main.settings_cache = None
        main.settings_error = None
        main.exchange_cache = None

    def tearDown(self) -> None:
        main.settings_cache = None
        main.settings_error = None
        main.exchange_cache = None
        for name in list(os.environ):
            if name.startswith("HYPERLIQUID_") or name.startswith("UPSTASH_"):
                os.environ.pop(name, None)

    def _close_request(self, master: str, api_wallet: str) -> main.CloseOrderRequest:
        return main.CloseOrderRequest(
            accountAddress=master,
            apiWalletAddress=api_wallet,
            ripplefiWallet=master,
            idempotencyKey="close-test-123456789",
            market="BTC",
            network="testnet",
            slippageBps=100,
            venue="hyperliquid",
            venueMarket="BTC",
        )

    def test_close_signs_with_user_key_and_calls_market_close(self) -> None:
        from eth_account import Account

        master = "0x" + "a1" * 20
        agent = Account.create()
        credential = {
            "apiWalletAddress": agent.address.lower(),
            "encryptedPrivateKey": main.encrypt_private_key(agent.key.hex()),
            "masterAccount": master,
            "network": "testnet",
            "ripplefiWallet": master,
        }
        os.environ[
            main.agent_storage_key(master, master, "testnet")
        ] = json.dumps(credential)

        closed: list[tuple[str, dict]] = []

        class FakeExchange:
            def market_close(self, coin: str, **kwargs: object) -> dict:
                closed.append((coin, kwargs))
                return {
                    "status": "ok",
                    "response": {
                        "data": {
                            "statuses": [
                                {
                                    "filled": {
                                        "avgPx": "0.9512",
                                        "oid": 4242,
                                        "totalSz": "5",
                                    }
                                }
                            ]
                        }
                    },
                }

        original_create = main.create_exchange
        original_store = main.get_store
        original_redis = main.redis_command
        try:
            main.create_exchange = lambda master, key: FakeExchange()
            main.get_store = lambda: main.MemoryExecutionStore()
            main.redis_command = lambda command: os.environ.get(command[1])
            response = main.execute_close_order(
                self._close_request(master, agent.address)
            )
        finally:
            main.create_exchange = original_create
            main.get_store = original_store
            main.redis_command = original_redis

        self.assertEqual(response.status, "success")
        self.assertEqual(response.message, "BTC closed at $0.9512.")
        self.assertEqual(response.external_order_id, "4242")
        self.assertEqual(closed[0][0], "BTC")
        self.assertEqual(closed[0][1]["slippage"], 100 / 10_000)

    def test_close_rejects_unconfigured_market(self) -> None:
        request = self._close_request(
            "0x" + "a2" * 20,
            "0x" + "b2" * 20,
        )
        request.market = "DOGE"
        request.venue_market = "DOGE"
        with self.assertRaises(HTTPException) as raised:
            main.validate_close_request(request)
        self.assertEqual(raised.exception.status_code, 422)

    def test_close_requires_network_match(self) -> None:
        request = self._close_request(
            "0x" + "a3" * 20,
            "0x" + "b3" * 20,
        )
        request.network = "mainnet"
        with self.assertRaises(HTTPException) as raised:
            main.validate_close_request(request)
        self.assertEqual(raised.exception.status_code, 403)
