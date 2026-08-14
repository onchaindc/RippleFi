from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from base64 import urlsafe_b64decode
from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_DOWN, Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal, Protocol

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("ripplefi.signer")

ADDRESS_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")
MAX_IDEMPOTENCY_KEY_LENGTH = 200
HARD_MAINNET_MAX_ORDER_SIZE_XRP = Decimal("1000")
HARD_MIN_ORDER_NOTIONAL_USD = Decimal("10")
PROOF_MARKET_ALLOWLIST = {"BTC", "ETH", "SOL"}
HyperliquidNetwork = Literal["mainnet", "testnet"]


@dataclass(frozen=True)
class Settings:
    account_address: str | None
    api_wallet_address: str | None
    api_wallet_private_key: str | None
    auth_token: str
    credential_encryption_key: bytes
    database_path: Path
    enable_testnet_proof: bool
    mainnet_max_order_size_xrp: Decimal | None
    min_hedge_size_xrp: Decimal
    min_order_notional_usd: Decimal
    max_order_size_xrp: Decimal
    max_slippage_bps: int
    network: HyperliquidNetwork
    proof_market: str
    proof_max_notional_usd: Decimal
    proof_size: Decimal
    testnet_max_order_sizes: dict[str, Decimal]
    testnet_markets: frozenset[str]
    redis_token: str
    redis_url: str


class ExecutionStore(Protocol):
    name: str

    def read(
        self,
        idempotency_key: str,
        request_hash: str,
    ) -> XrpShortResponse | None: ...

    def reserve(self, idempotency_key: str, request_hash: str) -> None: ...

    def complete(self, response: XrpShortResponse) -> None: ...

    def mark_unknown(self, idempotency_key: str) -> None: ...


class OrderSemantics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    max_slippage_bps: int = Field(alias="maxSlippageBps", ge=1)
    reduce_only: Literal[False] = Field(alias="reduceOnly")
    time_in_force: Literal["ioc"] = Field(alias="timeInForce")
    venue_order_type: Literal["aggressive-limit"] = Field(
        alias="venueOrderType",
    )


class ShortOrderRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    account_address: str = Field(alias="accountAddress")
    api_wallet_address: str = Field(alias="apiWalletAddress")
    ripplefi_wallet: str = Field(alias="ripplefiWallet")
    direction: Literal["short"]
    idempotency_key: str = Field(
        alias="idempotencyKey",
        min_length=12,
        max_length=MAX_IDEMPOTENCY_KEY_LENGTH,
    )
    # Optional per-rule perpetual leverage. When present the signer applies it
    # on Hyperliquid right before opening the short; absent means "leave the
    # account's current leverage untouched" (legacy clients).
    is_cross: bool | None = Field(default=None, alias="isCross")
    leverage: int | None = Field(default=None, ge=1, le=50)
    market: str = Field(min_length=2, max_length=32, pattern=r"^[A-Z0-9:_-]+$")
    network: HyperliquidNetwork
    order_type: Literal["market"] = Field(alias="orderType")
    semantics: OrderSemantics
    size: str
    venue: Literal["hyperliquid"]
    venue_market: str = Field(
        alias="venueMarket",
        min_length=2,
        max_length=32,
        pattern=r"^[A-Z0-9:_-]+$",
    )


class CloseOrderRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    account_address: str = Field(alias="accountAddress")
    api_wallet_address: str = Field(alias="apiWalletAddress")
    ripplefi_wallet: str = Field(alias="ripplefiWallet")
    idempotency_key: str = Field(
        alias="idempotencyKey",
        min_length=12,
        max_length=MAX_IDEMPOTENCY_KEY_LENGTH,
    )
    market: str = Field(min_length=2, max_length=32, pattern=r"^[A-Z0-9:_-]+$")
    network: HyperliquidNetwork
    slippage_bps: int = Field(default=100, alias="slippageBps", ge=1)
    venue: Literal["hyperliquid"]
    venue_market: str = Field(
        alias="venueMarket",
        min_length=2,
        max_length=32,
        pattern=r"^[A-Z0-9:_-]+$",
    )


class XrpShortResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    average_price: str | None = Field(alias="averagePrice")
    cached: bool
    external_order_id: str | None = Field(alias="externalOrderId")
    filled_size: str | None = Field(alias="filledSize")
    idempotency_key: str = Field(alias="idempotencyKey")
    market: str = "XRP"
    message: str
    network: HyperliquidNetwork = "testnet"
    status: Literal["pending", "success"]


class ProofOrderRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    idempotency_key: str = Field(
        alias="idempotencyKey",
        min_length=12,
        max_length=MAX_IDEMPOTENCY_KEY_LENGTH,
    )


class AgentProvisionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    master_account: str = Field(alias="masterAccount")
    network: HyperliquidNetwork
    ripplefi_wallet: str = Field(alias="ripplefiWallet")


class AgentProvisionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api_wallet_address: str = Field(alias="apiWalletAddress")
    created: bool
    master_account: str = Field(alias="masterAccount")
    network: HyperliquidNetwork
    ripplefi_wallet: str = Field(alias="ripplefiWallet")
    status: Literal["provisioned"]


def required_env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def read_positive_decimal(name: str, default: str | None = None) -> Decimal:
    raw_value = required_env(name, default)
    try:
        value = Decimal(raw_value)
    except InvalidOperation as error:
        raise RuntimeError(f"{name} must be a decimal.") from error
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero.")
    return value


def read_non_negative_decimal(
    name: str,
    default: str | None = None,
) -> Decimal:
    raw_value = required_env(name, default)
    try:
        value = Decimal(raw_value)
    except InvalidOperation as error:
        raise RuntimeError(f"{name} must be a decimal.") from error
    if value < 0:
        raise RuntimeError(f"{name} must be zero or greater.")
    return value


def read_enabled(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() == "true"


def read_market_size_caps(raw_value: str) -> dict[str, Decimal]:
    caps: dict[str, Decimal] = {}
    for entry in raw_value.split(","):
        market, separator, raw_cap = entry.strip().partition(":")
        if not separator or not market or not raw_cap:
            raise RuntimeError(
                "HYPERLIQUID_TESTNET_MAX_ORDER_SIZES must use "
                "MARKET:SIZE comma-separated entries."
            )
        try:
            cap = Decimal(raw_cap)
        except InvalidOperation as error:
            raise RuntimeError(
                f"Invalid testnet size cap for {market}."
            ) from error
        if not cap.is_finite() or cap <= 0:
            raise RuntimeError(
                f"Testnet size cap for {market} must be greater than zero."
            )
        caps[market.upper()] = cap
    return caps


def load_settings() -> Settings:
    network = os.getenv("HYPERLIQUID_NETWORK", "testnet").strip()
    if network not in ("mainnet", "testnet"):
        raise RuntimeError(
            "HYPERLIQUID_NETWORK must be testnet or mainnet."
        )
    allow_mainnet = read_enabled("HYPERLIQUID_ALLOW_MAINNET")
    if network == "mainnet" and not allow_mainnet:
        raise RuntimeError(
            "Mainnet execution is disabled. Set HYPERLIQUID_ALLOW_MAINNET=true "
            "only after reviewing the real-funds size cap."
        )

    enable_testnet_proof = read_enabled("HYPERLIQUID_ENABLE_TESTNET_PROOF")
    if enable_testnet_proof and network != "testnet":
        raise RuntimeError(
            "HYPERLIQUID_ENABLE_TESTNET_PROOF can only be used on testnet."
        )

    account_address = (
        os.getenv("HYPERLIQUID_ACCOUNT_ADDRESS", "").strip().lower() or None
    )
    api_wallet_address = (
        os.getenv("HYPERLIQUID_API_WALLET_ADDRESS", "").strip().lower()
        or None
    )
    private_key = (
        os.getenv("HYPERLIQUID_API_WALLET_PRIVATE_KEY", "").strip() or None
    )
    if any((account_address, api_wallet_address, private_key)):
        if not all((account_address, api_wallet_address, private_key)):
            raise RuntimeError(
                "Legacy demo account settings must be configured together."
            )
        if not ADDRESS_PATTERN.fullmatch(account_address or ""):
            raise RuntimeError("HYPERLIQUID_ACCOUNT_ADDRESS is invalid.")
        if not ADDRESS_PATTERN.fullmatch(api_wallet_address or ""):
            raise RuntimeError("HYPERLIQUID_API_WALLET_ADDRESS is invalid.")
        from eth_account import Account

        api_wallet = Account.from_key(private_key)
        if api_wallet.address.lower() != api_wallet_address:
            raise RuntimeError(
                "HYPERLIQUID_API_WALLET_PRIVATE_KEY does not match "
                "HYPERLIQUID_API_WALLET_ADDRESS."
            )

    auth_token = required_env("HYPERLIQUID_SIGNER_AUTH_TOKEN")
    if len(auth_token) < 32:
        raise RuntimeError(
            "HYPERLIQUID_SIGNER_AUTH_TOKEN must be at least 32 characters."
        )

    encryption_key = required_env(
        "HYPERLIQUID_CREDENTIAL_ENCRYPTION_KEY"
    ).encode()
    try:
        if len(urlsafe_b64decode(encryption_key)) != 32:
            raise ValueError
    except Exception as error:
        raise RuntimeError(
            "HYPERLIQUID_CREDENTIAL_ENCRYPTION_KEY must be a Fernet key."
        ) from error

    redis_url = (
        os.getenv("UPSTASH_REDIS_REST_URL", "").strip()
        or os.getenv("KV_REST_API_URL", "").strip()
    ).rstrip("/")
    redis_token = (
        os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()
        or os.getenv("KV_REST_API_TOKEN", "").strip()
    )
    if not redis_url or not redis_token:
        raise RuntimeError(
            "Persistent Redis credentials are required for user API wallets."
        )

    try:
        max_slippage_bps = int(
            required_env("HYPERLIQUID_MAX_SLIPPAGE_BPS", "100")
        )
    except ValueError as error:
        raise RuntimeError(
            "HYPERLIQUID_MAX_SLIPPAGE_BPS must be an integer."
        ) from error
    if max_slippage_bps < 1 or max_slippage_bps > 500:
        raise RuntimeError(
            "HYPERLIQUID_MAX_SLIPPAGE_BPS must be between 1 and 500."
        )

    mainnet_max_order_size_xrp = None
    if network == "mainnet":
        mainnet_max_order_size_xrp = read_positive_decimal(
            "HYPERLIQUID_MAINNET_MAX_ORDER_SIZE_XRP"
        )
        if mainnet_max_order_size_xrp > HARD_MAINNET_MAX_ORDER_SIZE_XRP:
            raise RuntimeError(
                "HYPERLIQUID_MAINNET_MAX_ORDER_SIZE_XRP exceeds the hard "
                f"{HARD_MAINNET_MAX_ORDER_SIZE_XRP} XRP signer limit."
            )

    proof_market = os.getenv(
        "HYPERLIQUID_TESTNET_PROOF_MARKET",
        "BTC",
    ).strip().upper()
    if proof_market not in PROOF_MARKET_ALLOWLIST:
        raise RuntimeError(
            "HYPERLIQUID_TESTNET_PROOF_MARKET must be BTC, ETH, or SOL."
        )

    default_database_path = (
        "/tmp/ripplefi-signer.db"
        if os.getenv("VERCEL")
        else "./data/signer.db"
    )
    database_path = Path(
        os.getenv("SIGNER_DB_PATH", default_database_path).strip()
    )
    if os.getenv("VERCEL") and database_path.parent != Path("/tmp"):
        database_path = Path(default_database_path)

    min_order_notional_usd = read_positive_decimal(
        "HYPERLIQUID_MIN_ORDER_NOTIONAL_USD",
        str(HARD_MIN_ORDER_NOTIONAL_USD),
    )
    if min_order_notional_usd < HARD_MIN_ORDER_NOTIONAL_USD:
        raise RuntimeError(
            "HYPERLIQUID_MIN_ORDER_NOTIONAL_USD cannot be below the "
            f"Hyperliquid {HARD_MIN_ORDER_NOTIONAL_USD} USD venue minimum."
        )

    testnet_markets = frozenset(
        market.strip().upper()
        for market in os.getenv(
            "HYPERLIQUID_TESTNET_MARKETS",
            "BTC,ETH,SOL",
        ).split(",")
        if market.strip()
    )
    testnet_max_order_sizes = read_market_size_caps(
        os.getenv(
            "HYPERLIQUID_TESTNET_MAX_ORDER_SIZES",
            "BTC:0.001,ETH:0.02,SOL:0.5",
        )
    )
    missing_caps = testnet_markets.difference(testnet_max_order_sizes)
    if missing_caps:
        raise RuntimeError(
            "Missing HYPERLIQUID_TESTNET_MAX_ORDER_SIZES caps for: "
            + ", ".join(sorted(missing_caps))
        )

    return Settings(
        account_address=account_address,
        api_wallet_address=api_wallet_address,
        api_wallet_private_key=private_key,
        auth_token=auth_token,
        credential_encryption_key=encryption_key,
        database_path=database_path,
        enable_testnet_proof=enable_testnet_proof,
        mainnet_max_order_size_xrp=mainnet_max_order_size_xrp,
        min_hedge_size_xrp=read_non_negative_decimal(
            "HYPERLIQUID_MIN_HEDGE_SIZE_XRP",
            "0",
        ),
        min_order_notional_usd=min_order_notional_usd,
        max_order_size_xrp=read_positive_decimal(
            "HYPERLIQUID_MAX_ORDER_SIZE_XRP",
            "1000",
        ),
        max_slippage_bps=max_slippage_bps,
        network=network,
        proof_market=proof_market,
        proof_max_notional_usd=read_positive_decimal(
            "HYPERLIQUID_TESTNET_PROOF_MAX_NOTIONAL_USD",
            "20",
        ),
        proof_size=read_positive_decimal(
            "HYPERLIQUID_TESTNET_PROOF_SIZE",
            "0.0002",
        ),
        testnet_max_order_sizes=testnet_max_order_sizes,
        testnet_markets=testnet_markets,
        redis_token=redis_token,
        redis_url=redis_url,
    )


execution_lock = threading.Lock()
runtime_lock = threading.RLock()
settings_cache: Settings | None = None
settings_error: str | None = None
exchange_cache: Any | None = None
store_cache: ExecutionStore | None = None


def get_settings() -> Settings:
    global settings_cache, settings_error

    if settings_cache is not None:
        return settings_cache
    with runtime_lock:
        if settings_cache is not None:
            return settings_cache
        try:
            settings_cache = load_settings()
            settings_error = None
            return settings_cache
        except Exception as error:
            settings_error = str(error)
            raise RuntimeError(settings_error) from error


def require_ready_settings() -> Settings:
    try:
        return get_settings()
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Signer configuration is not ready: {error}",
        ) from error


def get_exchange() -> Any:
    global exchange_cache

    if exchange_cache is not None:
        return exchange_cache
    with runtime_lock:
        if exchange_cache is not None:
            return exchange_cache

        settings = get_settings()
        if (
            not settings.api_wallet_private_key
            or not settings.account_address
        ):
            raise RuntimeError("Legacy demo trading account is not configured.")
        exchange_cache = create_exchange(
            settings.account_address,
            settings.api_wallet_private_key,
        )
        return exchange_cache


def create_exchange(account_address: str, private_key: str) -> Any:
    settings = get_settings()
    from eth_account import Account
    from hyperliquid.exchange import Exchange
    from hyperliquid.utils import constants

    api_wallet = Account.from_key(private_key)
    base_url = (
        constants.MAINNET_API_URL
        if settings.network == "mainnet"
        else constants.TESTNET_API_URL
    )
    return Exchange(
        api_wallet,
        base_url,
        account_address=account_address,
        timeout=12.0,
    )


def redis_command(command: list[Any]) -> Any:
    settings = get_settings()
    request = urllib.request.Request(
        settings.redis_url,
        data=json.dumps(command).encode(),
        headers={
            "Authorization": f"Bearer {settings.redis_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError) as error:
        raise RuntimeError("Credential storage is unavailable.") from error
    if body.get("error"):
        raise RuntimeError("Credential storage rejected the request.")
    return body.get("result")


def agent_storage_key(
    ripplefi_wallet: str,
    master_account: str,
    network: HyperliquidNetwork,
) -> str:
    return (
        f"ripplefi:hyperliquid-agent:v1:{network}:"
        f"{ripplefi_wallet.lower()}:{master_account.lower()}"
    )


def encrypt_private_key(private_key: str) -> str:
    from cryptography.fernet import Fernet

    return Fernet(
        get_settings().credential_encryption_key
    ).encrypt(private_key.encode()).decode()


def decrypt_private_key(encrypted_key: str) -> str:
    from cryptography.fernet import Fernet, InvalidToken

    try:
        return Fernet(
            get_settings().credential_encryption_key
        ).decrypt(encrypted_key.encode()).decode()
    except InvalidToken as error:
        raise RuntimeError("Stored API-wallet credential is invalid.") from error


def load_agent_credential(
    ripplefi_wallet: str,
    master_account: str,
    network: HyperliquidNetwork,
) -> dict[str, str] | None:
    stored = redis_command(
        ["GET", agent_storage_key(ripplefi_wallet, master_account, network)]
    )
    return json.loads(stored) if stored else None


def provision_agent_credential(
    request: AgentProvisionRequest,
) -> tuple[dict[str, str], bool]:
    wallet = request.ripplefi_wallet.lower()
    master = request.master_account.lower()
    existing = load_agent_credential(
        request.ripplefi_wallet,
        request.master_account,
        request.network,
    )
    if existing:
        logger.info(
            "hyperliquid.provision reused wallet=%s master=%s network=%s "
            "apiWallet=%s credentialStored=true",
            wallet,
            master,
            request.network,
            existing.get("apiWalletAddress", "none"),
        )
        return existing, False
    from eth_account import Account

    agent = Account.create()
    credential = {
        "apiWalletAddress": agent.address.lower(),
        "encryptedPrivateKey": encrypt_private_key(agent.key.hex()),
        "masterAccount": master,
        "network": request.network,
        "ripplefiWallet": wallet,
    }
    redis_command(
        [
            "SET",
            agent_storage_key(
                request.ripplefi_wallet,
                request.master_account,
                request.network,
            ),
            json.dumps(credential, separators=(",", ":")),
        ]
    )
    # Read the credential back before reporting success. A write that silently
    # fails here is exactly what leaves a user "connected" in the UI while
    # execution later finds no key to sign with.
    stored = load_agent_credential(
        request.ripplefi_wallet,
        request.master_account,
        request.network,
    )
    credential_stored = (
        stored is not None
        and stored.get("apiWalletAddress", "").lower()
        == credential["apiWalletAddress"]
    )
    logger.info(
        "hyperliquid.provision created wallet=%s master=%s network=%s "
        "apiWallet=%s credentialStored=%s",
        wallet,
        master,
        request.network,
        credential["apiWalletAddress"],
        "true" if credential_stored else "false",
    )
    if not credential_stored:
        raise RuntimeError(
            "The trading key could not be saved. Enable protection again."
        )
    return credential, True


def get_user_exchange(request: ShortOrderRequest | CloseOrderRequest) -> Any:
    wallet = request.ripplefi_wallet.lower()
    master = request.account_address.lower()
    requested_api_wallet = request.api_wallet_address.lower()
    credential = load_agent_credential(
        request.ripplefi_wallet,
        request.account_address,
        request.network,
    )
    stored_api_wallet = (credential or {}).get("apiWalletAddress", "").lower()
    logger.info(
        "hyperliquid.execute lookup wallet=%s master=%s network=%s "
        "credentialFound=%s requestedApiWallet=%s storedApiWallet=%s",
        wallet,
        master,
        request.network,
        "true" if credential else "false",
        requested_api_wallet,
        stored_api_wallet or "none",
    )
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HYPERLIQUID_NO_USER_KEY",
                "message": (
                    "No trading key found for this user. "
                    "Enable protection again."
                ),
            },
        )
    if stored_api_wallet != requested_api_wallet:
        logger.warning(
            "hyperliquid.execute api wallet mismatch wallet=%s master=%s "
            "requestedApiWallet=%s storedApiWallet=%s",
            wallet,
            master,
            requested_api_wallet,
            stored_api_wallet,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HYPERLIQUID_KEY_MISMATCH",
                "message": (
                    "This trading key no longer matches your account. "
                    "Enable protection again."
                ),
            },
        )
    # Never let the shared operator key sign a user order. If a per-user
    # credential ever resolves to the legacy env wallet, that is a provisioning
    # fault, not a tradable state.
    legacy_api_wallet = (get_settings().api_wallet_address or "").lower()
    if legacy_api_wallet and stored_api_wallet == legacy_api_wallet:
        logger.error(
            "hyperliquid.execute refused shared operator key wallet=%s "
            "master=%s apiWallet=%s",
            wallet,
            master,
            stored_api_wallet,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HYPERLIQUID_SHARED_KEY_REFUSED",
                "message": (
                    "No trading key found for this user. "
                    "Enable protection again."
                ),
            },
        )
    exchange = create_exchange(
        request.account_address,
        decrypt_private_key(credential["encryptedPrivateKey"]),
    )
    logger.info(
        "hyperliquid.execute signing wallet=%s master=%s network=%s "
        "signingApiWallet=%s",
        wallet,
        master,
        request.network,
        stored_api_wallet,
    )
    return exchange


def cached_response_from_row(
    row: tuple[str, str, str | None] | None,
    request_hash: str,
) -> XrpShortResponse | None:
    if row is None:
        return None

    stored_hash, state, response_json = row
    if stored_hash != request_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The idempotency key was already used for another request.",
        )
    if state == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This hedge execution is already processing.",
        )
    if not response_json:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This hedge execution has no retry-safe response.",
        )

    response = XrpShortResponse.model_validate_json(response_json)
    return response.model_copy(update={"cached": True})


class SQLiteExecutionStore:
    name = "sqlite"

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        if not os.getenv("VERCEL"):
            database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS executions (
                    idempotency_key TEXT PRIMARY KEY,
                    request_hash TEXT NOT NULL,
                    state TEXT NOT NULL,
                    response_json TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """
            )

    def connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.database_path, timeout=2)

    def read(
        self,
        idempotency_key: str,
        request_hash: str,
    ) -> XrpShortResponse | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT request_hash, state, response_json
                FROM executions
                WHERE idempotency_key = ?
                """,
                (idempotency_key,),
            ).fetchone()
        return cached_response_from_row(row, request_hash)

    def reserve(self, idempotency_key: str, request_hash: str) -> None:
        now = int(time.time() * 1000)
        try:
            with self.connect() as connection:
                connection.execute(
                    """
                    INSERT INTO executions (
                        idempotency_key,
                        request_hash,
                        state,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, 'processing', ?, ?)
                    """,
                    (idempotency_key, request_hash, now, now),
                )
        except sqlite3.IntegrityError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This hedge execution was reserved concurrently.",
            ) from error

    def complete(self, response: XrpShortResponse) -> None:
        now = int(time.time() * 1000)
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE executions
                SET state = 'complete', response_json = ?, updated_at = ?
                WHERE idempotency_key = ?
                """,
                (
                    response.model_dump_json(by_alias=True),
                    now,
                    response.idempotency_key,
                ),
            )

    def mark_unknown(self, idempotency_key: str) -> None:
        now = int(time.time() * 1000)
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE executions
                SET state = 'unknown', updated_at = ?
                WHERE idempotency_key = ?
                """,
                (now, idempotency_key),
            )


class MemoryExecutionStore:
    name = "memory-fallback"

    def __init__(self) -> None:
        self.rows: dict[str, tuple[str, str, str | None]] = {}

    def read(
        self,
        idempotency_key: str,
        request_hash: str,
    ) -> XrpShortResponse | None:
        return cached_response_from_row(
            self.rows.get(idempotency_key),
            request_hash,
        )

    def reserve(self, idempotency_key: str, request_hash: str) -> None:
        if idempotency_key in self.rows:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This hedge execution was reserved concurrently.",
            )
        self.rows[idempotency_key] = (request_hash, "processing", None)

    def complete(self, response: XrpShortResponse) -> None:
        request_hash, _, _ = self.rows[response.idempotency_key]
        self.rows[response.idempotency_key] = (
            request_hash,
            "complete",
            response.model_dump_json(by_alias=True),
        )

    def mark_unknown(self, idempotency_key: str) -> None:
        request_hash, _, response_json = self.rows[idempotency_key]
        self.rows[idempotency_key] = (
            request_hash,
            "unknown",
            response_json,
        )


def get_store() -> ExecutionStore:
    global store_cache

    if store_cache is not None:
        return store_cache
    with runtime_lock:
        if store_cache is not None:
            return store_cache
        try:
            store_cache = SQLiteExecutionStore(get_settings().database_path)
        except (OSError, sqlite3.Error):
            store_cache = MemoryExecutionStore()
        return store_cache


app = FastAPI(
    docs_url=None,
    openapi_url=None,
    redoc_url=None,
    title="RippleFI Hyperliquid Signer",
    version="1.0.0",
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "health": "/healthz",
        "service": "ripplefi-hyperliquid-signer",
        "status": "booted",
    }


def require_auth(authorization: str | None = Header(default=None)) -> None:
    settings = require_ready_settings()
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )
    supplied_token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(supplied_token, settings.auth_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token.",
        )


def parse_size(
    raw_size: str,
    network: HyperliquidNetwork,
    market: str,
) -> Decimal:
    settings = require_ready_settings()
    try:
        size = Decimal(raw_size)
    except InvalidOperation as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="size must be a decimal string.",
        ) from error
    if not size.is_finite() or size <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="size must be greater than zero.",
        )
    size_limit = (
        settings.mainnet_max_order_size_xrp
        if network == "mainnet"
        else settings.testnet_max_order_sizes.get(market)
    )
    if size_limit is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{network} {market} execution is not configured.",
        )
    if size > size_limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"size exceeds the {size_limit} {market} {network} signer "
                "limit."
            ),
        )
    return size


def validate_request(request: ShortOrderRequest) -> Decimal:
    settings = require_ready_settings()
    if request.network != settings.network:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Request network {request.network} does not match signer "
                f"network {settings.network}."
            ),
        )
    if not ADDRESS_PATTERN.fullmatch(request.ripplefi_wallet):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The RippleFI wallet is invalid.",
        )
    if not ADDRESS_PATTERN.fullmatch(request.account_address):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The Hyperliquid master account is invalid.",
        )
    if not ADDRESS_PATTERN.fullmatch(request.api_wallet_address):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The Hyperliquid API wallet is invalid.",
        )
    if request.market != request.venue_market:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "HYPERLIQUID_MARKET_MAPPING_INVALID",
                "message": "Logical and venue market symbols must match.",
            },
        )
    if request.network == "mainnet" and request.market != "XRP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HYPERLIQUID_MAINNET_MARKET_LOCKED",
                "message": "This signer permits only XRP on mainnet.",
            },
        )
    if (
        request.network == "testnet"
        and request.market not in settings.testnet_markets
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "HYPERLIQUID_MARKET_UNAVAILABLE",
                "market": request.market,
                "message": (
                    f"{request.market} is not enabled by the testnet signer."
                ),
            },
        )
    if request.semantics.max_slippage_bps > settings.max_slippage_bps:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Requested slippage exceeds the signer policy limit of "
                f"{settings.max_slippage_bps} bps."
            ),
        )
    return parse_size(request.size, request.network, request.market)


def request_digest(request: BaseModel) -> str:
    canonical_request = request.model_dump(
        by_alias=True,
        exclude_none=True,
        mode="json",
    )
    encoded = json.dumps(
        canonical_request,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def deterministic_cloid(idempotency_key: str) -> Any:
    from hyperliquid.utils.types import Cloid

    digest = hashlib.sha256(idempotency_key.encode()).hexdigest()
    return Cloid.from_str(f"0x{digest[:32]}")


def ensure_market_available(
    exchange: Any,
    market: str,
    network: HyperliquidNetwork,
    logical_market: str,
) -> None:
    available_markets = exchange.info.name_to_coin
    if market in available_markets:
        return

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
            "code": "HYPERLIQUID_MARKET_UNAVAILABLE",
            "logicalMarket": logical_market,
            "message": (
                f"Hyperliquid {network} does not currently list a {market} "
                "perpetual market."
            ),
            "network": network,
            "venue": "hyperliquid",
            "venueMarket": market,
        },
    )


def normalize_order_size(
    exchange: Any,
    market: str,
    network: HyperliquidNetwork,
    requested_size: Decimal,
    configured_minimum: Decimal = Decimal("0"),
) -> Decimal:
    settings = require_ready_settings()
    try:
        coin = exchange.info.name_to_coin[market]
        asset = exchange.info.coin_to_asset[coin]
        size_decimals = int(exchange.info.asset_to_sz_decimals[asset])
        mid_price = Decimal(str(exchange.info.all_mids()[coin]))
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "HYPERLIQUID_SIZE_RULES_UNAVAILABLE",
                "market": market,
                "network": network,
                "venueError": describe_hyperliquid_error(error),
            },
        ) from error

    if not mid_price.is_finite() or mid_price <= 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "HYPERLIQUID_INVALID_MID_PRICE",
                "market": market,
                "midPrice": str(mid_price),
                "network": network,
            },
        )

    size_increment = Decimal("1").scaleb(-size_decimals)
    rounded_size = (
        requested_size / size_increment
    ).to_integral_value(rounding=ROUND_DOWN) * size_increment
    notional_minimum = (
        settings.min_order_notional_usd / mid_price / size_increment
    ).to_integral_value(rounding=ROUND_CEILING) * size_increment
    configured_minimum = (
        configured_minimum / size_increment
    ).to_integral_value(rounding=ROUND_CEILING) * size_increment
    effective_minimum = max(
        size_increment,
        notional_minimum,
        configured_minimum,
    )

    if rounded_size < effective_minimum:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "HYPERLIQUID_SIZE_TOO_SMALL",
                "configuredMinimumSize": str(configured_minimum),
                "effectiveMinimumSize": str(effective_minimum),
                "market": market,
                "message": (
                    f"Hedge size is too small. Hyperliquid {market} requires "
                    f"at least {effective_minimum} units at the current price."
                ),
                "midPrice": str(mid_price),
                "minimumNotionalUsd": str(
                    settings.min_order_notional_usd
                ),
                "network": network,
                "requestedSize": str(requested_size),
                "roundedSize": str(rounded_size),
                "sizeIncrement": str(size_increment),
                "szDecimals": size_decimals,
            },
        )

    return rounded_size


def describe_hyperliquid_error(error: Exception) -> dict[str, Any]:
    detail: dict[str, Any] = {
        "message": str(error) or error.__class__.__name__,
        "type": error.__class__.__name__,
    }
    for source_name, target_name in (
        ("status_code", "statusCode"),
        ("error_code", "errorCode"),
        ("error_message", "message"),
        ("error_data", "data"),
        ("message", "message"),
    ):
        value = getattr(error, source_name, None)
        if value is not None:
            detail[target_name] = value
    return detail


def normalize_exchange_response(
    result: dict[str, Any],
    idempotency_key: str,
    market: str,
    network: HyperliquidNetwork,
    verb: str = "short",
) -> XrpShortResponse:
    if result.get("status") != "ok":
        raise RuntimeError(f"Hyperliquid rejected the order: {result}")

    statuses = (
        result.get("response", {})
        .get("data", {})
        .get("statuses", [])
    )
    if not statuses:
        raise RuntimeError("Hyperliquid returned no order status.")

    order_status = statuses[0]
    if "error" in order_status:
        raise RuntimeError(f"Hyperliquid order failed: {order_status['error']}")
    if "filled" in order_status:
        fill = order_status["filled"]
        return XrpShortResponse(
            averagePrice=str(fill.get("avgPx")),
            cached=False,
            externalOrderId=str(fill.get("oid")),
            filledSize=str(fill.get("totalSz")),
            idempotencyKey=idempotency_key,
            market=market,
            message=(
                f"{market} closed at ${fill.get('avgPx')}."
                if verb == "closed"
                else f"{market} short filled at ${fill.get('avgPx')}."
            ),
            network=network,
            status="success",
        )
    if "resting" in order_status:
        resting = order_status["resting"]
        return XrpShortResponse(
            averagePrice=None,
            cached=False,
            externalOrderId=str(resting.get("oid")),
            filledSize=None,
            idempotencyKey=idempotency_key,
            market=market,
            message=(
                f"{market} {verb} accepted and awaiting final venue status."
            ),
            network=network,
            status="pending",
        )

    raise RuntimeError(f"Unsupported Hyperliquid order status: {order_status}")


@app.get("/healthz", response_model=None)
def health() -> dict[str, Any] | JSONResponse:
    try:
        settings = get_settings()
    except RuntimeError as error:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "configuration": "error",
                "detail": str(error),
                "service": "ripplefi-hyperliquid-signer",
                "status": "not_ready",
            },
        )

    return {
        "configuration": "ready",
        "credentialEncryptionConfigured": bool(
            settings.credential_encryption_key
        ),
        "credentialStorageConfigured": bool(
            settings.redis_url and settings.redis_token
        ),
        "mainnetEnabled": settings.network == "mainnet",
        "network": settings.network,
        "service": "ripplefi-hyperliquid-signer",
        "sharedOperatorKeyPresent": bool(settings.api_wallet_private_key),
        "stateBackend": store_cache.name if store_cache else "lazy",
        "status": "ok",
        "testnetProofEnabled": settings.enable_testnet_proof,
        "testnetMarkets": sorted(settings.testnet_markets),
        "venueClient": "lazy",
    }


@app.post(
    "/v1/agents/provision",
    dependencies=[Depends(require_auth)],
    response_model=AgentProvisionResponse,
    response_model_by_alias=True,
)
def provision_agent(
    request: AgentProvisionRequest,
) -> AgentProvisionResponse:
    settings = require_ready_settings()
    if request.network != settings.network:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The requested network does not match this signer.",
        )
    if (
        not ADDRESS_PATTERN.fullmatch(request.ripplefi_wallet)
        or not ADDRESS_PATTERN.fullmatch(request.master_account)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Valid RippleFI and Hyperliquid wallet addresses are required.",
        )
    try:
        credential, created = provision_agent_credential(request)
    except RuntimeError as error:
        logger.error(
            "hyperliquid.provision failed wallet=%s master=%s network=%s "
            "credentialStored=false error=%s",
            request.ripplefi_wallet.lower(),
            request.master_account.lower(),
            request.network,
            error,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "HYPERLIQUID_KEY_STORAGE_FAILED",
                "message": str(error),
            },
        ) from error
    return AgentProvisionResponse(
        apiWalletAddress=credential["apiWalletAddress"],
        created=created,
        masterAccount=request.master_account.lower(),
        network=request.network,
        ripplefiWallet=request.ripplefi_wallet.lower(),
        status="provisioned",
    )


def execute_short_order(request: ShortOrderRequest) -> XrpShortResponse:
    settings = require_ready_settings()
    size = validate_request(request)
    digest = request_digest(request)
    try:
        execution_store = get_store()
        exchange = get_user_exchange(request)
    except HTTPException:
        # 403s from get_user_exchange (missing/mismatched/shared-operator key)
        # are client errors and must reach the caller as-is — never converted
        # into a generic "runtime not ready" 503.
        raise
    except Exception as error:
        logger.error(
            "hyperliquid.execute runtime failure wallet=%s master=%s network=%s "
            "error=%s",
            request.ripplefi_wallet.lower(),
            request.account_address.lower(),
            request.network,
            error,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Signer execution runtime is not ready: {error}",
        ) from error
    ensure_market_available(
        exchange,
        request.venue_market,
        request.network,
        request.market,
    )
    configured_minimum = (
        settings.min_hedge_size_xrp
        if request.network == "mainnet" and request.market == "XRP"
        else Decimal("0")
    )
    normalized_size = normalize_order_size(
        exchange,
        request.venue_market,
        request.network,
        size,
        configured_minimum,
    )

    with execution_lock:
        cached_response = execution_store.read(
            request.idempotency_key,
            digest,
        )
        if cached_response:
            return cached_response

        execution_store.reserve(request.idempotency_key, digest)
        try:
            if request.leverage is not None:
                exchange.update_leverage(
                    request.leverage,
                    request.venue_market,
                    request.is_cross if request.is_cross is not None else True,
                )
            result = exchange.market_open(
                request.venue_market,
                False,
                float(normalized_size),
                slippage=request.semantics.max_slippage_bps / 10_000,
                cloid=deterministic_cloid(request.idempotency_key),
            )
            response = normalize_exchange_response(
                result,
                request.idempotency_key,
                request.venue_market,
                request.network,
            )
            execution_store.complete(response)
            return response
        except Exception as error:
            try:
                execution_store.mark_unknown(request.idempotency_key)
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "HYPERLIQUID_EXECUTION_FAILED",
                    "logicalMarket": request.market,
                    "message": (
                        f"Hyperliquid rejected or failed the "
                        f"{request.venue_market} short."
                    ),
                    "network": request.network,
                    "venue": request.venue,
                    "venueError": describe_hyperliquid_error(error),
                    "venueMarket": request.venue_market,
                },
            ) from error


@app.post(
    "/v1/orders/short",
    dependencies=[Depends(require_auth)],
    response_model=XrpShortResponse,
    response_model_by_alias=True,
)
def place_short(request: ShortOrderRequest) -> XrpShortResponse:
    return execute_short_order(request)


@app.post(
    "/v1/orders/xrp-short",
    dependencies=[Depends(require_auth)],
    response_model=XrpShortResponse,
    response_model_by_alias=True,
)
def place_xrp_short(request: ShortOrderRequest) -> XrpShortResponse:
    if request.market != "XRP" or request.venue_market != "XRP":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The legacy endpoint accepts only XRP.",
        )
    return execute_short_order(request)


def validate_close_request(request: CloseOrderRequest) -> None:
    settings = require_ready_settings()
    if request.network != settings.network:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Request network {request.network} does not match signer "
                f"network {settings.network}."
            ),
        )
    if not ADDRESS_PATTERN.fullmatch(request.ripplefi_wallet):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The RippleFI wallet is invalid.",
        )
    if not ADDRESS_PATTERN.fullmatch(request.account_address):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The Hyperliquid master account is invalid.",
        )
    if not ADDRESS_PATTERN.fullmatch(request.api_wallet_address):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The Hyperliquid API wallet is invalid.",
        )
    if request.market != request.venue_market:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "HYPERLIQUID_MARKET_MAPPING_INVALID",
                "message": "Logical and venue market symbols must match.",
            },
        )
    if request.network == "mainnet" and request.market != "XRP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HYPERLIQUID_MAINNET_MARKET_LOCKED",
                "message": "This signer permits only XRP on mainnet.",
            },
        )
    if (
        request.network == "testnet"
        and request.market not in settings.testnet_markets
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "HYPERLIQUID_MARKET_UNAVAILABLE",
                "market": request.market,
                "message": (
                    f"{request.market} is not enabled by the testnet signer."
                ),
            },
        )
    if request.slippage_bps > settings.max_slippage_bps:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Requested slippage exceeds the signer policy limit of "
                f"{settings.max_slippage_bps} bps."
            ),
        )


def execute_close_order(request: CloseOrderRequest) -> XrpShortResponse:
    validate_close_request(request)
    digest = request_digest(request)
    try:
        execution_store = get_store()
        exchange = get_user_exchange(request)
    except HTTPException:
        raise
    except Exception as error:
        logger.error(
            "hyperliquid.close runtime failure wallet=%s master=%s network=%s "
            "error=%s",
            request.ripplefi_wallet.lower(),
            request.account_address.lower(),
            request.network,
            error,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Signer execution runtime is not ready: {error}",
        ) from error

    with execution_lock:
        cached_response = execution_store.read(
            request.idempotency_key,
            digest,
        )
        if cached_response:
            return cached_response

        execution_store.reserve(request.idempotency_key, digest)
        try:
            result = exchange.market_close(
                request.venue_market,
                slippage=request.slippage_bps / 10_000,
                cloid=deterministic_cloid(request.idempotency_key),
            )
            response = normalize_exchange_response(
                result,
                request.idempotency_key,
                request.venue_market,
                request.network,
                verb="closed",
            )
            execution_store.complete(response)
            return response
        except Exception as error:
            try:
                execution_store.mark_unknown(request.idempotency_key)
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "HYPERLIQUID_CLOSE_FAILED",
                    "logicalMarket": request.market,
                    "message": (
                        f"Hyperliquid rejected or failed closing the "
                        f"{request.venue_market} position."
                    ),
                    "network": request.network,
                    "venue": request.venue,
                    "venueError": describe_hyperliquid_error(error),
                    "venueMarket": request.venue_market,
                },
            ) from error


@app.post(
    "/v1/orders/close",
    dependencies=[Depends(require_auth)],
    response_model=XrpShortResponse,
    response_model_by_alias=True,
)
def place_close(request: CloseOrderRequest) -> XrpShortResponse:
    return execute_close_order(request)


@app.post(
    "/v1/orders/testnet-proof",
    dependencies=[Depends(require_auth)],
    response_model=XrpShortResponse,
    response_model_by_alias=True,
)
def place_testnet_proof(request: ProofOrderRequest) -> XrpShortResponse:
    settings = require_ready_settings()
    if settings.network != "testnet" or not settings.enable_testnet_proof:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HYPERLIQUID_TESTNET_PROOF_DISABLED",
                "message": (
                    "Testnet proof mode is disabled. Set "
                    "HYPERLIQUID_ENABLE_TESTNET_PROOF=true on a testnet signer."
                ),
            },
        )

    try:
        execution_store = get_store()
        exchange = get_exchange()
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "HYPERLIQUID_RUNTIME_NOT_READY",
                "venueError": describe_hyperliquid_error(error),
            },
        ) from error

    ensure_market_available(
        exchange,
        settings.proof_market,
        "testnet",
        "TESTNET_PROOF",
    )
    normalized_proof_size = normalize_order_size(
        exchange,
        settings.proof_market,
        "testnet",
        settings.proof_size,
    )
    try:
        mid_price = Decimal(
            str(exchange.info.all_mids()[settings.proof_market])
        )
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "HYPERLIQUID_PROOF_PRICE_UNAVAILABLE",
                "market": settings.proof_market,
                "venueError": describe_hyperliquid_error(error),
            },
        ) from error

    proof_notional = mid_price * normalized_proof_size
    if proof_notional > settings.proof_max_notional_usd:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "HYPERLIQUID_PROOF_NOTIONAL_LIMIT",
                "market": settings.proof_market,
                "maxNotionalUsd": str(settings.proof_max_notional_usd),
                "message": "Configured proof order exceeds its notional cap.",
                "notionalUsd": str(proof_notional),
                "size": str(settings.proof_size),
            },
        )

    digest_payload = {
        "idempotencyKey": request.idempotency_key,
        "market": settings.proof_market,
        "network": "testnet",
        "size": str(normalized_proof_size),
    }
    digest = hashlib.sha256(
        json.dumps(digest_payload, sort_keys=True).encode()
    ).hexdigest()

    with execution_lock:
        cached_response = execution_store.read(
            request.idempotency_key,
            digest,
        )
        if cached_response:
            return cached_response

        execution_store.reserve(request.idempotency_key, digest)
        try:
            result = exchange.market_open(
                settings.proof_market,
                False,
                float(normalized_proof_size),
                slippage=settings.max_slippage_bps / 10_000,
                cloid=deterministic_cloid(request.idempotency_key),
            )
            response = normalize_exchange_response(
                result,
                request.idempotency_key,
                settings.proof_market,
                "testnet",
            )
            execution_store.complete(response)
            return response
        except Exception as error:
            try:
                execution_store.mark_unknown(request.idempotency_key)
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "HYPERLIQUID_TESTNET_PROOF_FAILED",
                    "market": settings.proof_market,
                    "network": "testnet",
                    "notionalUsd": str(proof_notional),
                    "size": str(normalized_proof_size),
                    "venueError": describe_hyperliquid_error(error),
                },
            ) from error
