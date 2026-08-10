"""Per-user API-wallet isolation at order-signing time.

These tests pin the behaviour that broke multi-user Auto-Hedge: execution must
sign with the requesting user's own stored API wallet, and must fail loudly
(never silently fall back to the shared operator key) when that key is absent.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

from fastapi import HTTPException

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from signer import main  # noqa: E402

FERNET_KEY = "0" * 43 + "="
OPERATOR_KEY = (
    "0x1111111111111111111111111111111111111111111111111111111111111111"
)


def _set_env(monkeypatch: None, **values: str) -> None:
    # The module reads env at load_settings() time; a fresh process env per test
    # is the only state isolation needed because settings are re-read after
    # main.settings_cache is cleared.
    for name, value in values.items():
        os.environ[name] = value


def _clear_env(names: list[str]) -> None:
    for name in names:
        os.environ.pop(name, None)


def _order(main, wallet: str, master: str, api_wallet: str):
    return main.ShortOrderRequest(
        accountAddress=master,
        apiWalletAddress=api_wallet,
        ripplefiWallet=wallet,
        direction="short",
        idempotencyKey="idem-key-123456",
        market="BTC",
        network="testnet",
        orderType="market",
        semantics={
            "maxSlippageBps": 100,
            "reduceOnly": False,
            "timeInForce": "ioc",
            "venueOrderType": "aggressive-limit",
        },
        size="1",
        venue="hyperliquid",
        venueMarket="BTC",
    )


class UserKeyIsolationTest(unittest.TestCase):
    def setUp(self) -> None:
        _set_env(
            None,
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

    def test_two_masters_each_sign_with_their_own_key(self) -> None:
        """The core multi-user guarantee: no cross-talk between funded masters."""
        from eth_account import Account

        alice_master = "0x" + "a1" * 20
        bob_master = "0x" + "b2" * 20
        alice_agent = Account.create()
        bob_agent = Account.create()

        def store_credential(master: str, agent) -> None:
            main.agent_storage_key
            key = main.agent_storage_key(master, master, "testnet")
            credential = {
                "apiWalletAddress": agent.address.lower(),
                "encryptedPrivateKey": main.encrypt_private_key(
                    agent.key.hex()
                ),
                "masterAccount": master,
                "network": "testnet",
                "ripplefiWallet": master,
            }
            os.environ[key] = json.dumps(credential)

        store_credential(alice_master, alice_agent)
        store_credential(bob_master, bob_agent)

        original_redis = main.redis_command
        try:
            main.redis_command = lambda command: os.environ.get(command[1])
            signed: list[tuple[str, str]] = []
            original_create = main.create_exchange

            def fake_create(master: str, private_key: str):
                from eth_account import Account

                signed.append(
                    (master, Account.from_key(private_key).address.lower())
                )
                return None

            main.create_exchange = fake_create

            main.get_user_exchange(
                _order(main, alice_master, alice_master, alice_agent.address)
            )
            main.get_user_exchange(
                _order(main, bob_master, bob_master, bob_agent.address)
            )
        finally:
            main.redis_command = original_redis
            main.create_exchange = original_create

        self.assertEqual(
            signed,
            [
                (alice_master, alice_agent.address.lower()),
                (bob_master, bob_agent.address.lower()),
            ],
        )
        # Each master signed with its own agent, and never with the other's.
        self.assertNotEqual(signed[0][1], signed[1][1])

    def test_missing_credential_returns_clear_error(self) -> None:
        original_redis = main.redis_command
        original_create = main.create_exchange
        try:
            main.redis_command = lambda command: None
            main.create_exchange = (
                lambda master, key: self.fail(
                    "must not sign without a user key"
                )
            )

            wallet = "0x" + "c3" * 20
            with self.assertRaises(HTTPException) as caught:
                main.get_user_exchange(
                    _order(main, wallet, wallet, "0x" + "d4" * 20)
                )
        finally:
            main.redis_command = original_redis
            main.create_exchange = original_create

        self.assertEqual(caught.exception.status_code, 403)
        self.assertEqual(
            caught.exception.detail["code"], "HYPERLIQUID_NO_USER_KEY"
        )
        self.assertEqual(
            caught.exception.detail["message"],
            "No trading key found for this user. Enable protection again.",
        )

    def test_shared_operator_key_is_refused(self) -> None:
        """A credential resolving to the shared env wallet must never trade."""
        from eth_account import Account

        operator = Account.from_key(OPERATOR_KEY)
        _set_env(
            None,
            HYPERLIQUID_ACCOUNT_ADDRESS="0x" + "e5" * 20,
            HYPERLIQUID_API_WALLET_ADDRESS=operator.address.lower(),
            HYPERLIQUID_API_WALLET_PRIVATE_KEY=OPERATOR_KEY,
        )
        main.settings_cache = None

        wallet = "0x" + "f6" * 20
        stored = json.dumps(
            {
                "apiWalletAddress": operator.address.lower(),
                "encryptedPrivateKey": main.encrypt_private_key(OPERATOR_KEY),
                "masterAccount": wallet,
                "network": "testnet",
                "ripplefiWallet": wallet,
            }
        )
        original_redis = main.redis_command
        original_create = main.create_exchange
        try:
            main.redis_command = lambda command: stored
            main.create_exchange = (
                lambda master, key: self.fail(
                    "must not sign with operator key"
                )
            )

            with self.assertRaises(HTTPException) as caught:
                main.get_user_exchange(
                    _order(main, wallet, wallet, operator.address)
                )
        finally:
            main.redis_command = original_redis
            main.create_exchange = original_create

        self.assertEqual(caught.exception.status_code, 403)
        self.assertEqual(
            caught.exception.detail["code"],
            "HYPERLIQUID_SHARED_KEY_REFUSED",
        )

    def test_client_error_is_not_masked_as_runtime_failure(self) -> None:
        """A 403 from key lookup must not become a generic 503."""
        original_redis = main.redis_command
        original_store = main.get_store
        original_validate = main.validate_request
        try:
            main.redis_command = lambda command: None
            main.get_store = lambda: object()
            main.validate_request = lambda request: 1

            wallet = "0x" + "a7" * 20
            with self.assertRaises(HTTPException) as caught:
                main.execute_short_order(
                    _order(main, wallet, wallet, "0x" + "b8" * 20)
                )
        finally:
            main.redis_command = original_redis
            main.get_store = original_store
            main.validate_request = original_validate

        self.assertEqual(caught.exception.status_code, 403)
        self.assertEqual(
            caught.exception.detail["code"], "HYPERLIQUID_NO_USER_KEY"
        )

    def test_provision_reports_storage_failure(self) -> None:
        """A write that does not persist must fail loudly, not report success."""
        original_redis = main.redis_command
        try:
            main.redis_command = lambda command: None  # SET accepted, GET empty
            wallet = "0x" + "c9" * 20
            with self.assertRaisesRegex(RuntimeError, "could not be saved"):
                main.provision_agent_credential(
                    main.AgentProvisionRequest(
                        masterAccount=wallet,
                        network="testnet",
                        ripplefiWallet=wallet,
                    )
                )
        finally:
            main.redis_command = original_redis


if __name__ == "__main__":
    unittest.main(verbosity=2)
