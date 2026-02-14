# Changelog

All notable changes to this project are documented in this file.

## [1.3.0] - 2025-02-14

### Added
- CLI: `npm run export-transactions` — export transactions to CSV
- CLI: `npm run rename-account` — rename account display name
- Cancel button in /add, /sync, /transfer flows for quick operation cancellation

### Changed
- Updated CLAUDE.md with CLI output style convention

---

## [1.2.0] - 2025-12-14

### Changed
- Unified number parsing with `parseAmount()` utility
- Improved button labels with action verbs (Material Design)
- Updated BotFather setup documentation

---

## [1.1.0] - 2025-12-08

### Added
- `/transfer` command — transfer between accounts with automatic exchange rates (ECB via Frankfurter API)
- `/cancel` command — cancel transactions with reversal tracking
- Cross-currency transfers with rate preview and custom amount option
- Two-way cancellation references for audit trail

### Changed
- Updated BotFather profile descriptions with new features

---

## [1.0.0] - 2025-12-03

### Features
- `/add` — Add transactions with amount and description
- `/balance` — View all account balances
- `/history` — View recent transaction history
- `/sync` — Sync balance with actual amount (creates adjustment)
- `/start` — Welcome message with available commands
- `/help` — Show help information

### Architecture
- Telegram webhook via Firebase Cloud Functions
- Firestore database for accounts, transactions, sessions
- Atomic transactions with `balanceAfter` tracking
- Minor units storage (cents/kopiykas) for precision

### UI/UX
- Adaptive keyboards (reply for private/groups, inline for forum topics)
- Message cleanup after transaction flows
- Localization support (Ukrainian, English via Remote Config)

### Group Chat Support
- Concurrent sessions per user (`chatId:userId` key)
- Forum topics (supergroups) support
- Admin message deletion for clean UX
