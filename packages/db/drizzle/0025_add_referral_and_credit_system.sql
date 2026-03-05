-- Migration: 0025_add_referral_and_credit_system
-- Adds referral tracking, credit ledger, and user credit balance

-- 1. Add referral code and credit balance to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS my_referral_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_credits_expire_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(my_referral_code);

-- 2. Add referral tracking columns to early_access_submissions
ALTER TABLE early_access_submissions ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id);
ALTER TABLE early_access_submissions ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE early_access_submissions ADD COLUMN IF NOT EXISTS reward_issued_at TIMESTAMPTZ;

-- 3. Referrals tracking table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id),
  referred_user_id UUID NOT NULL REFERENCES users(id),
  referral_code VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reward_credits_issued INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_referrals_referred_user UNIQUE (referred_user_id),
  CONSTRAINT uq_referrals_pair UNIQUE (referrer_user_id, referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- 4. Credit ledger (append-only, immutable)
CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason VARCHAR(30) NOT NULL,
  description TEXT,
  reference_type VARCHAR(30),
  reference_id UUID,
  idempotency_key VARCHAR(100) UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_idempotency ON credit_ledger(idempotency_key);
